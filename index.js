import fs from 'fs'
import path from 'path'
import os from 'os'
import puppeteer from 'puppeteer'
import {VK} from 'vk-io'
import {HearManager} from '@vk-io/hear'
import nodemailer from 'nodemailer'

import token from './token.js'

if (/ubuntu/i.test(os.version())) {
    try {
        process.chdir('/srv/twitshot')
    } catch (err) {
        console.error(`chdir: ${err}`)
    }
}

const vk = new VK({
    token,
    pollingGroupId: 197617619,
    apiMode: 'parallel_selected'
})

const hearManager = new HearManager()

const SOC_NETS = {
    tw: {
        selector: 'article[role="article"]',
        regexp: /twitter\.com/i
    },
    tg: {
        selector: '.tgme_page iframe',
        regexp: /t\.me/i
    },
    pkb: {
        selector: 'article .story__main',
        regexp: /pikabu\.ru\/story/i
    },
    inst: {
        selector: 'article[role="presentation"]',
        regexp: /instagram.com\/p/i
    }
}

const getScreenshot = async (link, socnet, context) => {
    const {selector} = SOC_NETS[socnet]

    let screenshot
    try {
        await page.goto(link)
    } catch (e) {
        if (e instanceof puppeteer.errors.TimeoutError) {
            context.send('Пикабу опять долго грузился поэтому хуй вам, а не скриншот')
            return false
        }

        transporter.sendMail({
            ...MAIL_DEFAULTS,
            subject: MAIL_DEFAULTS.subject,
            text: `Бот умер из-за неудачного перехода по ссылке: ${link}\n\nУРЛ (🌍): ${globalThis.link}\n\n${e.message}\n\n${e.stack}`
        }, () => process.exit(0))
    }

    const isRedirected = !page.url().includes(link)

    try {
        let element
        if (isRedirected) {
            if ( // закрытые профили редиректят на страницу логина
                socnet == 'inst' &&
                page.url() == 'https://www.instagram.com/accounts/login/'
            ) {
                const creds = ['USERNAME', 'PASSWORD']
                await page.waitForSelector('#loginForm')
                await page.$$eval('#loginForm input', (inputs, creds) => {
                    inputs.forEach((input, index) => input.value = creds[index])
                }, creds)
                await page.$('[type="submit"]').click()
                await page.waitForSelector(selector)
            } else {
                console.log(`Instagram перенаправил бота куда-то не туда: «${page.url()}»`)
                return
            }
        } else {
            try {
            await page.waitForSelector(selector)
            element = await page.$(selector)
            } catch {
                context.send('Я не долждался когда загрузится нужная страница поэтому хуй вам, а не скриншот')

                transporter.sendMail({
                    ...MAIL_DEFAULTS,
                    subject: MAIL_DEFAULTS.subject,
                    text: `Бот не смог найти селектор ${selector} на странице по ссылке: ${link}\n\n🌍: ${globalThis.link}`
                })
                return false
            }
        }

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
        } else if (socnet == 'inst') {
            element = await page.$(selector)
            await page.$$eval('[style="width: 100%;"]', ([div]) => {
                console.log('login banner', div)

                if (div && /Войдите/.test(div.textContent)) {
                    if (div.querySelector('button')) {
                        div.querySelector('button').click()
                    }
                }
            })
        }

        screenshot = await element.screenshot({
            path: 'screenshot.png',
            omitBackground: true
        })
    } catch (e) {
        console.log('🔥 ОШИБКА!', e.message)

        await page.screenshot({
            path: 'error_screenshot.png',
            omitBackground: true,
            // encoding: 'base64'
        })

        transporter.sendMail({
            text: `Бот умер из-за необработанного исключения в getScreenshot: ${e.message}\n\n\ne.stack`,
            /* attachments: [{
                filename: 'Error screenshot.png',
                path: path.resolve('error_screenshot.png')
            }] */
        }).then(
            () => process.exit(1)
        )
    }

    /* await */ page.goto('about:blank')
    return screenshot
}

const makeScreenshotAndSend = async (link, socnet, context) => {
    globalThis.link = link
    const result = await getScreenshot(link, socnet, context)
    if (result === false) {
        return
    } else {
    context.sendPhotos({value: 'screenshot.png'})//.then(() => process.exit())
    }
}

const makeScreenshot = async (socnet, context) => {
    const {regexp} = SOC_NETS[socnet]

    let matchedRegExp

    const link = context.text.split(/\s/).find(chunk => {
        const result = regexp.test(chunk)

        if (result) {
            matchedRegExp = regexp
        }

        return result
    })

    if (link) {
        try {
            const url = new URL(link)
            makeScreenshotAndSend(link, socnet, context)
        } catch {
            context.send(`Либо меня беды с башкой, либо вот это «${link}» не URL адрес сервиса «${socnet}» (совпало с регуляркой: ${matchedRegExp})`)
        }
    }
}

/* const transporter = {
    sendMail: console.log
} */
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

await page.setDefaultTimeout(60000)

globalThis.page = page

vk.updates.on('message_new', hearManager.middleware)

vk.updates.use(async (context, next) => { // Skip outbox message and handle errors
    if (context.type === 'message' && context.isOutbox) {
        return
    }

    try {
        await next()
    } catch (error) {
        console.log(`Ошибка в работе`, error)
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

/* hearManager.hear(/http(.+)\.mp4/gi, async context => {
    const link = context.text.split(' ').find(chunk => /http(.+)\.mp4/gi.test(chunk))

    const attachment = await vk.upload.video({
        peer_id: context.peerId,
        link
    })
}) */

async function run() {
    await vk.updates.startPolling()
    console.log('Бот запущен')

    Object.keys(SOC_NETS).forEach(socnet => {
        hearManager.hear(SOC_NETS[socnet].regexp, makeScreenshot.bind(this, socnet))
    })
}

run().catch(
    console.error.bind(console, 'Ошибка запуска бота:\n\n')
)

})()

process.on('uncaughtException', (reason, p) => {
    transporter.sendMail({
        ...MAIL_DEFAULTS,
        subject: MAIL_DEFAULTS.subject + ': uncaughtException',
        text: `Бот умер из-за непойманного исключения: ${reason}\n\n${reason.stack}`
    }, () => process.exit(0))
})

process.on('unhandledRejection', (reason, p) => {
    transporter.sendMail({
        ...MAIL_DEFAULTS,
        subject: MAIL_DEFAULTS.subject + ': unhandledRejection',
        text: `Бот умер из-за необработанного исключения: ${reason}\n\nУРЛ:${globalThis.link}\n\n${reason.stack}`
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

/*process.on('exit', (reason, p) => {
    transporter.sendMail({
        ...MAIL_DEFAULTS,
        subject: MAIL_DEFAULTS.subject + ': EXIT',
        text: `Бот умер из-за остановки процесса: ${reason}`
    }, () => process.exit(0))
})*/
