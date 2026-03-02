const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
})

// Valid status transitions (our state machine)
const VALID_TRANSITIONS = {
    applied: ['interview', 'rejection', 'ghosted'],
    interview: ['rejection', 'offer'],
    rejection: [],  // terminal state
    offer: [],      // terminal state
    ghosted: ['interview']  // sometimes companies come back!
}

async function findOrCreateApplication({ company, role, status, emailId }) {
    const existing = await pool.query(
        `SELECT * FROM applications 
     WHERE LOWER(company) = LOWER($1) 
     AND LOWER(role) = LOWER($2)`,
        [company, role]
    )

    if (existing.rows.length === 0) {
        const result = await pool.query(
            `INSERT INTO applications 
       (company, role, current_status, source_email_thread_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
            [company, role, status, emailId]
        )
        console.log(`✅ New application: ${company} - ${role}`)
        return { application: result.rows[0], isNew: true }
    }

    const app = existing.rows[0]
    const validNextStatuses = VALID_TRANSITIONS[app.current_status] || []

    if (validNextStatuses.includes(status)) {
        const result = await pool.query(
            `UPDATE applications 
       SET current_status = $1, last_updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
            [status, app.id]
        )
        console.log(`🔄 Updated ${company}: ${app.current_status} → ${status}`)
        return { application: result.rows[0], isNew: false }
    }

    console.log(`⚠️ Invalid transition for ${company}: ${app.current_status} → ${status}`)
    return { application: app, isNew: false }
}
async function logEvent({ applicationId, eventType, emailId }) {
    await pool.query(
        `INSERT INTO events (application_id, event_type, raw_email_id)
     VALUES ($1, $2, $3)`,
        [applicationId, eventType, emailId]
    )
}

module.exports = { findOrCreateApplication, logEvent, pool }