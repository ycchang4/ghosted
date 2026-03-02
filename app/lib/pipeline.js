const { authorize } = require('./gmail-auth')
const { google } = require('googleapis')
const { classifyEmail } = require('./classifier')
const { findOrCreateApplication, logEvent } = require('./db')
require('dotenv').config({ path: '.env.local' })

// Defined at top level so all functions can use it
function extractBody(payload) {
    if (payload.body?.data) {
        return Buffer.from(payload.body.data, 'base64').toString('utf-8')
    }

    if (payload.parts) {
        const textPart = payload.parts.find(p => p.mimeType === 'text/plain')
        if (textPart?.body?.data) {
            return Buffer.from(textPart.body.data, 'base64').toString('utf-8')
        }

        const htmlPart = payload.parts.find(p => p.mimeType === 'text/html')
        if (htmlPart?.body?.data) {
            return Buffer.from(htmlPart.body.data, 'base64').toString('utf-8')
        }

        for (const part of payload.parts) {
            const nested = extractBody(part)
            if (nested) return nested
        }
    }

    return ''
}
function stripHtml(html) {
    return html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // remove style blocks
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // remove script blocks
        .replace(/<[^>]+>/g, ' ') // remove all HTML tags
        .replace(/&nbsp;/g, ' ') // replace &nbsp; with space
        .replace(/&amp;/g, '&') // replace &amp; with &
        .replace(/\s+/g, ' ') // collapse whitespace
        .trim()
        .substring(0, 1000) // only send first 1000 chars to AI
}

async function runPipeline() {
    console.log('Starting Ghosted pipeline...')

    const auth = await authorize()
    const gmail = google.gmail({ version: 'v1', auth })

    const res = await gmail.users.messages.list({
        userId: 'me',
        q: 'subject:application OR subject:"thank you for applying" OR subject:"application update" OR subject:"your application"',
        maxResults: 10
    })

    const messages = res.data.messages || []
    console.log(`📧 Found ${messages.length} emails to process`)

    for (const msg of messages) {
        try {
            const email = await gmail.users.messages.get({
                userId: 'me',
                id: msg.id,
                format: 'full'
            })

            const headers = email.data.payload.headers
            const subject = headers.find(h => h.name === 'Subject')?.value
            const from = headers.find(h => h.name === 'From')?.value
            const body = extractBody(email.data.payload)

            console.log(`Classifying: ${subject}`)
            const classification = await classifyEmail({ subject, from, body })

            if (classification.status === 'other' || !classification.company) {
                console.log(`Skipping: not a job email`)
                continue
            }

            if (classification.confidence < 0.75) {
                console.log(`Low confidence (${classification.confidence}): ${classification.company}`)
            }

            const { application } = await findOrCreateApplication({
                company: classification.company,
                role: classification.role || 'Unknown Role',
                status: classification.status,
                emailId: msg.id
            })

            await logEvent({
                applicationId: application.id,
                eventType: classification.status,
                emailId: msg.id
            })

        } catch (err) {
            console.error(`❌ Error processing email:`, err)
            continue
        }
    }

    console.log('✅ Pipeline complete!')
}

// Temporary debug - remove after testing
async function debugEmail(emailId) {
    const auth = await authorize()
    const gmail = google.gmail({ version: 'v1', auth })

    const email = await gmail.users.messages.get({
        userId: 'me',
        id: emailId,
        format: 'full'
    })

    const rawBody = extractBody(email.data.payload)
    const body = stripHtml(rawBody)
}

runPipeline()