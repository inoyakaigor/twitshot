import puppeteer from 'puppeteer'
import VKIO from 'vk-io'

import token from './token.js'

const {VK} = VKIO

const vk = new VK({
    token,
    pollingGroupId: 197617619,
    apiMode: 'parallel_selected'
})

const getScreenshot = async (url) => {
    await page.goto(url)

    await page.waitForSelector('article[role="article"]')

    //document.querySelector(`a[href="${$0.attributes.href.value}"]`).closest('article')

    const element = await page.$('article[role="article"]')
    const screenshot = await element.screenshot({
        path: 'screenshot.png',
        omitBackground: true,
        // encoding: 'base64'
    })

    await page.goto('about:blank')
    // await browser.close()
    return screenshot
}

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

    /* const screenshot =  */await getScreenshot(link)
    // context.sendPhotos(`data:image/png;base64,${screenshot}`)
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
    process.exit(0)
})

process.on('unhandledRejection', (reason, p) => {
    console.log(`Необработанное исключение в: ${p}\nreason: ${reason}`)
    process.exit(0)
})