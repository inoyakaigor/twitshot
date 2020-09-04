import fs from 'fs'
import puppeteer from 'puppeteer'
import VKIO from 'vk-io'
import nodemailer from 'nodemailer'

import token from './token.js'

const {VK} = VKIO

const vk = new VK({
    token,
    pollingGroupId: 197617619,
    apiMode: 'parallel_selected'
})

const SELECTORS = {
    tw: 'article[role="article"]',
    tg: '.tgme_page iframe'
}

const getScreenshot = async (url, site) => {
    console.log('go to', url)
    await page.goto(url)

    const selector = SELECTORS[site]
    // console.log('selector is', selector)

    await page.waitForSelector(selector)
    const element = await page.$(selector)
    // console.log('element', element)

    if (site == 'tg') {
        // console.log('\n\n================\n\n')
        const wrapSelector = '.message_media_not_supported_wrap'
        const frame = await element.contentFrame()
        // console.log('frame is', frame)
        await frame.waitForSelector(wrapSelector)
        const content = fs.readFileSync('/srv/twitshot/tg.css', 'utf8');
        await frame.addStyleTag({content})

        await frame.evaluate((wrapSelector) => {
            document.querySelector(wrapSelector).style.display = 'none'
            // return document.documentElement.innerHTML
        }, wrapSelector)
    }

    const screenshot = await element.screenshot({
        path: 'screenshot.png',
        omitBackground: true,
        // encoding: 'base64'
    })

    await page.goto('about:blank')
    // await browser.close()
    return screenshot
}

const transporter = nodemailer.createTransport({sendmail: true}, {
    from: 'twitshot@inoy.dev',
    to: 'inoyakaigor@ya.ru',
    subject: 'Я умер †',
})


;( async () => {

const browser = await puppeteer.launch({
    headless: true,
    args: ['--window-size=1280,1920', /*'--no-sandbox'/*, '--disable-setuid-sandbox'*/]
})

const page = await browser.newPage()

await page.setViewport({
    width: 1280,
    height: 1920
})

globalThis.page = page

vk.updates.use(async (context, next) => { // Skip outbox message and handle errors
    if (context.type === 'message' && context.isOutbox) {
        return
    }

    try {
        await next()
    } catch (error) {
        console.log(`Ошибка при работе с VK API`, error)
        process.exit(0)
    }
})

vk.updates.hear(/twitter.com/i, async context => {
    const link = context.text.split(' ').find(chunk => /twitter.com/i.test(chunk))

    /* const screenshot = */await getScreenshot(link, 'tw')
    // context.sendPhotos(`data:image/png;base64,${screenshot}`)
    context.sendPhotos('screenshot.png')
})

vk.updates.hear(/t.me/i, async context => {
    const link = context.text.split(' ').find(chunk => /t.me/i.test(chunk))

    await getScreenshot(link, 'tg')

    context.sendPhotos('screenshot.png')
})

async function run() {
    await vk.updates.startPolling()
    console.log('Polling started')
}

run().catch(console.error)

})()

process.on('uncaughtException', (reason, p) => {
    console.log(`Необработанное исключение в: ${p}\nreason: ${reason}`)
    transporter.sendMail({text: `Бот умер из-за необработанного исключения: ${p}\nreason: ${reason}`})
    process.exit(0)
})

process.on('unhandledRejection', (reason, p) => {
    console.log(`Необработанное исключение в: ${p}\nreason: ${reason}`)
    transporter.sendMail({text: `Бот умер из-за необработанного отказа: ${p}\nreason: ${reason}`})
    process.exit(0)
})

process.on('SIGTERM', (reason, p) => {
    console.log(`Необработанное исключение в: ${p}\nreason: ${reason}`)
    transporter.sendMail({text: `Бот умер из-за необработанного отказа: ${p}\nreason: ${reason}`})
    process.exit(0)
})

process.on('SIGINT', (reason, p) => {
    console.log(`Необработанное исключение в: ${p}\nreason: ${reason}`)
    transporter.sendMail({text: `Бот умер из-за необработанного отказа: ${p}\nreason: ${reason}`})
    process.exit(0)
})
