import fs from 'fs'
import path from 'path'
import puppeteer from 'puppeteer'
import VKIO from 'vk-io'
import {HearManager} from '@vk-io/hear'
import nodemailer from 'nodemailer'

import token from './token.js'

const {VK} = VKIO

const vk = new VK({
    token,
    pollingGroupId: 197617619,
    apiMode: 'parallel_selected'
})

const hearManager = new HearManager()

const SOC_NETS = {
    tw: {
        selector :'article[role="article"]',
        regexp: /twitter.com/i
    },
    tg: {
        selector: '.tgme_page iframe',
        regexp: /t.me/i
    }
}

const getScreenshot = async (link, socnet) => {
    const {selector} = SOC_NETS[socnet]

    let screenshot

    await page.goto(link)

    try {
        await page.waitForSelector(selector)
        const element = await page.$(selector)

        if (socnet == 'tg') {
            const wrapSelector = '.message_media_not_supported_wrap'
            const frame = await element.contentFrame()
            const content = fs.readFileSync('./tg.css', 'utf8')
            await frame.addStyleTag({content})

            await frame.evaluate((wrapSelector) => {
                const wrapperNode = document.querySelector(wrapSelector)
                if (wrapperNode?.style) {
                    wrapperNode.style.display = 'none'
                }
            }, wrapSelector)
        }

        screenshot = await element.screenshot({
            path: 'screenshot.png',
            omitBackground: true,
            // encoding: 'base64'
        })
    } catch (e) {
        console.log('🔥 ОШИБКА!', e.message)

        await page.screenshot({
            path: 'error_screenshot.png',
            omitBackground: true,
            // encoding: 'base64'
        })

        transporter.sendMail({
            text: `Бот умер из-за необработанного исключения: ${e.message}`,
            attachments: [{
                filename: 'error_screenshot.png'
            }]
        })

        process.exit(1)
    }

    /* await */ page.goto('about:blank')
    return screenshot
}

const makeScreenshotAndSend = async (link, socnet, context) => {
    await getScreenshot(link, socnet)
    context.sendPhotos('screenshot.png')
}

const makeScreenshot = async (socnet, context) => {
    const {regexp} = SOC_NETS[socnet]

    const link = context.text.split(' ').find(chunk => regexp.test(chunk))

    makeScreenshotAndSend(link, socnet, context)
}

const transporter = nodemailer.createTransport({sendmail: true}, {
    from: 'linkshot@inoy.dev',
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

vk.updates.on('message_new', hearManager.middleware)

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


vk.updates.on('message', async (context, next) => {
    if (context.hasAttachments('link')) {
        const attachments = context.getAttachments('link')

        attachments.forEach(attachment => {
            for (const socnet in SOC_NETS) {
                if (SOC_NETS[socnet].regexp.test(attachment.url)) {
                    makeScreenshotAndSend(attachment.url, socnet, context)
                    break
                }
            }
        })
    }

    await next()
})

hearManager.hear(/http(.+)\.mp4/gi, async context => {
    const link = context.text.split(' ').find(chunk => /http(.+)\.mp4/gi.test(chunk))

    const attachment = await vk.upload.video({
        peer_id: context.peerId,
        link
    })
})

async function run() {
    await vk.updates.startPolling()
    console.log('Polling started')

    Object.keys(SOC_NETS).forEach(socnet => {
        hearManager.hear(SOC_NETS[socnet].regexp, makeScreenshot.bind(this, socnet))
    })
}

run().catch(console.error)

})()

process.on('uncaughtException', (reason, p) => {
    console.log(`Необработанное исключение в: ${p}\nreason: ${reason}`)
    // transporter.sendMail({text: `Бот умер из-за необработанного исключения: ${p}\nreason: ${reason}`})
    process.exit(0)
})

process.on('unhandledRejection', (reason, p) => {
    console.log(`Необработанное исключение в: ${p}\nreason: ${reason}`)
    // transporter.sendMail({text: `Бот умер из-за необработанного отказа: ${p}\nreason: ${reason}`})
    process.exit(0)
})

process.on('SIGTERM', (reason, p) => {
    console.log(`Необработанное исключение в: ${p}\nreason: ${reason}`)
    // transporter.sendMail({text: `Бот умер из-за необработанного отказа: ${p}\nreason: ${reason}`})
    process.exit(0)
})

process.on('SIGINT', (reason, p) => {
    console.log(`Необработанное исключение в: ${p}\nreason: ${reason}`)
    // transporter.sendMail({text: `Бот умер из-за необработанного отказа: ${p}\nreason: ${reason}`})
    process.exit(0)
})
