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
    // console.log('go to', url)
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
        try {
            await frame.waitForSelector(wrapSelector)
        } catch {
            console.log('Не дождался селектора')
        }
        const content = fs.readFileSync('/srv/twitshot/tg.css', 'utf8');
        await frame.addStyleTag({content})

        await frame.evaluate((wrapSelector) => {
            const tmp = document.querySelector(wrapSelector)
            if (tmp) {
                tmp.style.display = 'none'
            }
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

const transporter = nodemailer.createTransport({
    sendmail: true,
    newline: 'unix',
    path: '/usr/sbin/sendmail',
})

const MAIL_DEFAULTS = {
    from: 'twitshot@inoy.dev',
    to: 'inoyakaigor@ya.ru',
    subject: 'Бот умер',
}

;( async () => {

const browser = await puppeteer.launch({
    headless: true,
    args: ['--window-size=1280,1920', '--no-sandbox'/*, '--disable-setuid-sandbox'*/]
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

    // Promise.reject('режект')

    try {
        await next()
    } catch (error) {
        console.log(`Ошибка в работе`, error)
        process.exit(0)
    }
})

vk.updates.hear(/twitter.com/i, async context => {
    const link = context.text.split(/\s|\n/gim).find(chunk => /twitter.com/i.test(chunk))
    // console.log(link)

    /* const screenshot = */await getScreenshot(link, 'tw')
    // context.sendPhotos(`data:image/png;base64,${screenshot}`)
    context.sendPhotos('screenshot.png')
})

vk.updates.hear(/t.me/i, async context => {
    const link = context.text.split(/\s|\n/gim).find(chunk => /t.me/i.test(chunk))

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
    transporter.sendMail({
        ...MAIL_DEFAULTS,
        subject: MAIL_DEFAULTS.subject + ': uncaughtException',
        text: `Бот умер из-за непойманного исключения: ${reason}`
    }, () => process.exit(0))
})

process.on('unhandledRejection', (reason, p) => {
    transporter.sendMail({
        ...MAIL_DEFAULTS,
        subject: MAIL_DEFAULTS.subject + ': unhandledRejection',
        text: `Бот умер из-за необработанного исключения: ${reason}`
    }, () => process.exit(0)
    )
})

process.on('SIGTERM', (reason, p) => {
    transporter.sendMail({
        ...MAIL_DEFAULTS,
        subject: MAIL_DEFAULTS.subject + ': SIGTERM',
        text: `Бот умер из-за завершения процесса Node: ${reason}`
    }, () => process.exit(0))
})

process.on('SIGINT', (reason, p) => {
    transporter.sendMail({
        ...MAIL_DEFAULTS,
        subject: MAIL_DEFAULTS.subject + ': SIGINT',
        text: `Бот умер из-за сигнала прерывания процесса: ${reason}`
    }, () => process.exit(0))
})

process.on('exit', (reason, p) => {
    transporter.sendMail({
        ...MAIL_DEFAULTS,
        subject: MAIL_DEFAULTS.subject + ': EXIT',
        text: `Бот умер из-за остановки процесса: ${reason}`
    }, () => process.exit(0))
})
