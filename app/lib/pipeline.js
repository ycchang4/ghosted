const { authorize } = require('./gmail-auth')
const { google } = require('googleapis')
const { classifyEmail } = require('./classifier')
const { findOrCreateApplication, logEvent } = require('./db')
const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
})

// Converts a JS Date to Gmail's date filter format: YYYY/MM/DD
function toGmailDate(date) {
    return date.toISOString().split('T')[0].replace(/-/g, '/')
}

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
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 1000)
}

async function getLastRunDate() {
    const { rows } = await pool.query(
        'SELECT last_run_at FROM pipeline_state WHERE id = 1'
    )
    return rows[0]?.last_run_at ?? null  // null if first run
}

async function saveLastRunDate() {
    await pool.query(`
        INSERT INTO pipeline_state (id, last_run_at)
        VALUES (1, NOW())
        ON CONFLICT (id) DO UPDATE SET last_run_at = NOW()
    `)
}

async function runPipeline() {
    console.log('Starting Ghosted pipeline...')

    // 1. Check when we last ran
    const lastRun = await getLastRunDate()

    if (lastRun) {
        console.log(`📅 Last run: ${lastRun} — fetching only new emails`)
    } else {
        console.log('🆕 First run — fetching all emails')
    }

    // 2. Build Gmail query — add date filter if we have a last run date
    const dateFilter = lastRun ? ` after:${toGmailDate(new Date(lastRun))}` : ''
    const q = `(subject:"application" OR subject:"thank you for applying" OR subject:"application update" OR subject:"your application" OR subject:"invitation" OR subject:"interview")${dateFilter}`

    const auth = await authorize()
    const gmail = google.gmail({ version: 'v1', auth })

    const res = await gmail.users.messages.list({
        userId: 'me',
        q,
        maxResults: 15  // raised from 10 — incremental runs won't have many anyway
    })

    const messages = res.data.messages || []
    console.log(`📧 Found ${messages.length} emails to process`)

    if (messages.length === 0) {
        console.log('Nothing new. Updating last_run_at.')
        await saveLastRunDate()
        await pool.end()
        return
    }

    // 3. Process emails
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
            const rawBody = extractBody(email.data.payload)
            const body = stripHtml(rawBody)

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
            console.error(`❌ Error processing email ${msg.id}:`, err)
            continue
        }
    }

    // 4. Only save last_run_at AFTER all emails are processed
    await saveLastRunDate()
    console.log('✅ Pipeline complete! last_run_at updated.')

    await pool.end()
}

runPipeline()