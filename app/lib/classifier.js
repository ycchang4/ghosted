const OpenAI = require('openai')
require('dotenv').config({ path: '.env.local' })

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
})

async function classifyEmail({ subject, from, body }) {
    const prompt = `
You are a job application tracking assistant.

Analyze the email below and return ONLY a JSON object with these fields:
- company (string): the company name
- role (string): the job title
- status (one of): "applied", "interview", "rejection", "offer", "other"
- confidence (float 0-1): how confident you are in the classification
- interview_date (string or null): ISO date if mentioned, otherwise null

Rules:
- Return JSON only. No explanation, no markdown, no extra text.
- If you cannot determine a field, use null.
- company: use the shortest common name (e.g. "PlayStation" not "PlayStation Global")

Email:
Subject: ${subject}
From: ${from}
Body: ${body}
`

    const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1
    })

    const raw = response.choices[0].message.content

    try {
        return JSON.parse(raw)
    } catch {
        // Sometimes the model adds markdown backticks despite instructions
        const cleaned = raw.replace(/```json|```/g, '').trim()
        return JSON.parse(cleaned)
    }
}

module.exports = { classifyEmail }

