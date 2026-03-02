# Ghosted

A personal job application tracker that reads your Gmail, classifies emails with AI, and displays your pipeline in a clean dashboard.

## How it works

1. **Gmail pipeline** — connects to your Gmail via OAuth, fetches job-related emails, strips HTML, and sends the body to OpenAI for classification
2. **State machine** — enforces valid status transitions (e.g. you can't go from rejection back to applied)
3. **Dashboard** — visualizes your pipeline as a Kanban board and funnel chart

## Tech stack

- **Framework:** Next.js 14 (App Router, TypeScript, Tailwind)
- **AI:** OpenAI `gpt-4o-mini`
- **Database:** PostgreSQL on Neon
- **Email:** Google Gmail API with OAuth

## Project structure

```
app/
  api/
    applications/
      route.ts          ← GET all applications, POST manual entry
      [id]/route.ts     ← GET single application, DELETE
  dashboard/
    page.tsx            ← Kanban board + funnel chart
  lib/
    gmail-auth.js       ← Gmail OAuth connection
    gmail-fetch.js      ← Email fetching
    classifier.js       ← OpenAI classification
    db.js               ← Database queries + state machine
    pipeline.js         ← Wires everything together
setup-db.js             ← One-time database setup
```

## Database schema

```sql
applications (id, company, role, current_status, first_seen_at, last_updated_at, source_email_thread_id)
events       (id, application_id, event_type, raw_email_id, timestamp)
```

## Status state machine

```
applied   → interview, rejection, ghosted
interview → rejection, offer
rejection → (terminal)
offer     → (terminal)
ghosted   → interview
```

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment variables
Create `.env.local`:
```
DATABASE_URL=your_neon_connection_string
OPENAI_API_KEY=your_openai_key
NEXTAUTH_SECRET=your_random_secret
NEXTAUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

### 3. Set up the database
```bash
node setup-db.js
```

### 4. Run Gmail OAuth (first time)
```bash
node app/lib/gmail-auth.js
```

### 5. Run the pipeline
```bash
node app/lib/pipeline.js
```

### 6. Start the dashboard
```bash
npm run dev
```

Visit `http://localhost:3000/dashboard`

## Roadmap

- [ ] Google OAuth for multi-user support
- [ ] Gmail token caching (remove re-auth on every run)
- [ ] Ghosting detection (flag apps with no update after 21 days)
- [ ] Auto-refresh / polling on dashboard
- [ ] Deploy to Vercel

## Important

Never commit `credentials.json` or `.env.local` to GitHub. Both are in `.gitignore`.
