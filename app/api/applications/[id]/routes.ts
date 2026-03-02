// ─────────────────────────────────────────────────────────────────────────────
// app/api/applications/route.ts
// Handles: GET /api/applications   POST /api/applications
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/app/lib/db";

type AppStatus = "applied" | "interview" | "offer" | "rejection" | "ghosted";

interface Event {
    id: number;
    gmail_message_id: string | null;
    status: AppStatus;
    confidence: number | null;
    subject: string | null;
    received_at: string | null;
    created_at: string;
}

interface Application {
    id: number;
    company: string;
    role: string | null;
    current_status: AppStatus;
    created_at: string;
    updated_at: string;
    events: Event[];
}

// ─── GET /api/applications ────────────────────────────────────────────────────
// ?status=interview        → filter by status
// ?include_events=false    → skip nested events (lighter payload)

export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;
    const statusFilter = searchParams.get("status") as AppStatus | null;
    const includeEvents = searchParams.get("include_events") !== "false";

    try {
        const appResult = await pool.query(
            statusFilter
                ? `SELECT * FROM applications WHERE current_status = $1 ORDER BY updated_at DESC`
                : `SELECT * FROM applications ORDER BY updated_at DESC`,
            statusFilter ? [statusFilter] : []
        );

        const applications: Application[] = appResult.rows.map((row: string) => ({
            ...row,
            events: [],
        }));

        if (includeEvents && applications.length > 0) {
            const appIds = applications.map((a) => a.id);

            const eventsResult = await pool.query(
                `SELECT * FROM events
         WHERE application_id = ANY($1::int[])
         ORDER BY created_at ASC`,
                [appIds]
            );

            const eventsByApp = new Map<number, Event[]>();
            for (const ev of eventsResult.rows) {
                if (!eventsByApp.has(ev.application_id)) {
                    eventsByApp.set(ev.application_id, []);
                }
                eventsByApp.get(ev.application_id)!.push(ev);
            }

            for (const app of applications) {
                app.events = eventsByApp.get(app.id) ?? [];
            }
        }

        const counts = await pool.query(
            `SELECT current_status, COUNT(*)::int AS count
       FROM applications
       GROUP BY current_status`
        );

        const summary = Object.fromEntries(
            counts.rows.map((r) => [r.current_status, r.count])
        );

        return NextResponse.json({ applications, summary }, { status: 200 });
    } catch (err) {
        console.error("[GET /api/applications]", err);
        return NextResponse.json(
            { error: "Failed to fetch applications" },
            { status: 500 }
        );
    }
}

// ─── POST /api/applications ───────────────────────────────────────────────────
// Body: { company: string, role?: string, status?: AppStatus }

const VALID_STATUSES: AppStatus[] = [
    "applied", "interview", "offer", "rejection", "ghosted",
];

export async function POST(req: NextRequest) {
    let body: { company?: string; role?: string; status?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { company, role = null, status = "applied" } = body;

    if (!company || typeof company !== "string") {
        return NextResponse.json({ error: "company is required" }, { status: 400 });
    }
    if (!VALID_STATUSES.includes(status as AppStatus)) {
        return NextResponse.json(
            { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
            { status: 400 }
        );
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const appResult = await client.query(
            `INSERT INTO applications (company, role, current_status)
       VALUES ($1, $2, $3)
       ON CONFLICT (company, role) DO UPDATE
         SET current_status = EXCLUDED.current_status,
             updated_at = NOW()
       RETURNING *`,
            [company.trim(), role, status]
        );
        const app = appResult.rows[0];

        const eventResult = await client.query(
            `INSERT INTO events (application_id, status, subject)
       VALUES ($1, $2, $3)
       RETURNING *`,
            [app.id, status, "Manual entry"]
        );

        await client.query("COMMIT");
        return NextResponse.json(
            { application: { ...app, events: [eventResult.rows[0]] } },
            { status: 201 }
        );
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("[POST /api/applications]", err);
        return NextResponse.json(
            { error: "Failed to create application" },
            { status: 500 }
        );
    } finally {
        client.release();
    }
}


// ─────────────────────────────────────────────────────────────────────────────
// app/api/applications/[id]/route.ts
// Handles: GET /api/applications/:id   DELETE /api/applications/:id
// ─────────────────────────────────────────────────────────────────────────────

// import { NextRequest, NextResponse } from "next/server";
// import { pool } from "@/app/lib/db";

// ─── GET /api/applications/:id ────────────────────────────────────────────────
// Always includes full event history for the single app.

export async function GET_BY_ID(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
        return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    try {
        const appResult = await pool.query(
            `SELECT * FROM applications WHERE id = $1`,
            [id]
        );
        if (appResult.rows.length === 0) {
            return NextResponse.json(
                { error: "Application not found" },
                { status: 404 }
            );
        }

        const eventsResult = await pool.query(
            `SELECT * FROM events WHERE application_id = $1 ORDER BY created_at ASC`,
            [id]
        );

        return NextResponse.json(
            { application: { ...appResult.rows[0], events: eventsResult.rows } },
            { status: 200 }
        );
    } catch (err) {
        console.error("[GET /api/applications/:id]", err);
        return NextResponse.json(
            { error: "Failed to fetch application" },
            { status: 500 }
        );
    }
}

// ─── DELETE /api/applications/:id ────────────────────────────────────────────
// Deletes the application and all its events (cascade handled in DB or manually).

export async function DELETE(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
        return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // Delete events first if no CASCADE constraint on the FK
        await client.query(`DELETE FROM events WHERE application_id = $1`, [id]);

        const result = await client.query(
            `DELETE FROM applications WHERE id = $1 RETURNING id`,
            [id]
        );

        if (result.rows.length === 0) {
            await client.query("ROLLBACK");
            return NextResponse.json(
                { error: "Application not found" },
                { status: 404 }
            );
        }

        await client.query("COMMIT");
        return new NextResponse(null, { status: 204 });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("[DELETE /api/applications/:id]", err);
        return NextResponse.json(
            { error: "Failed to delete application" },
            { status: 500 }
        );
    } finally {
        client.release();
    }
}