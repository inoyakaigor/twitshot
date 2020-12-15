import nodemailer from 'nodemailer'

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

Promise.reject('MANUAL REJECT')

process.on('unhandledRejection', (reason, p) => {
    console.log(`unhandledRejection Необработанное исключение в: ${p}\nreason: ${reason}`)
    transporter.sendMail({
        ...MAIL_DEFAULTS,
        subject: MAIL_DEFAULTS.subject + ': unhandledRejection',
        text: `Бот умер из-за необработанного исключения: ${p}\nreason: ${reason}`
    }, (err, info) => {
        console.log(err, '\n\n=====')
        console.log(info.envelope)
        console.log(info.messageId)
    })
    // process.exit(0)
})
