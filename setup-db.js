const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
})

async function setup() {
    try {
        await pool.query(`
      CREATE TABLE IF NOT EXISTS applications (
        id SERIAL PRIMARY KEY,
        company TEXT NOT NULL,
        role TEXT NOT NULL,
        current_status TEXT NOT NULL DEFAULT 'applied',
        first_seen_at TIMESTAMP DEFAULT NOW(),
        last_updated_at TIMESTAMP DEFAULT NOW(),
        source_email_thread_id TEXT
      )
    `)

        await pool.query(`
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        application_id INTEGER REFERENCES applications(id),
        event_type TEXT NOT NULL,
        raw_email_id TEXT,
        timestamp TIMESTAMP DEFAULT NOW()
      )
    `)

        console.log('✅ Tables created successfully')
    } catch (err) {
        console.error('❌ Error creating tables:', err)
    } finally {
        await pool.end()
    }
}

setup()