const { authorize } = require('./gmail-auth')
const { google } = require('googleapis')

async function fetchJobEmails(auth) {
    const gmail = google.gmail({ version: 'v1', auth })

    const res = await gmail.users.messages.list({
        userId: 'me',
        q: 'from:greenhouse.io OR from:lever.co OR from:workday.com OR subject:application OR subject:"thank you for applying"',
        maxResults: 10
    })

    const messages = res.data.messages || []
    console.log(`Found ${messages.length} emails`)

    for (const msg of messages) {
        const email = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id,
            format: 'full'
        })

        const headers = email.data.payload.headers
        const subject = headers.find(h => h.name === 'Subject')?.value
        const from = headers.find(h => h.name === 'From')?.value
        const date = headers.find(h => h.name === 'Date')?.value

// Extract email body
        let body = ''
        if (email.data.payload.parts) {
            const textPart = email.data.payload.parts.find(p => p.mimeType === 'text/plain')
            if (textPart?.body?.data) {
                body = Buffer.from(textPart.body.data, 'base64').toString('utf-8')
            }
        } else if (email.data.payload.body?.data) {
            body = Buffer.from(email.data.payload.body.data, 'base64').toString('utf-8')
        }

        console.log('---')
        console.log('Subject:', subject)
        console.log('From:', from)
        console.log('Date:', date)
        console.log('Body preview:', body.substring(0, 200))
    }
}

authorize()
    .then(fetchJobEmails)
    .catch(console.error)







