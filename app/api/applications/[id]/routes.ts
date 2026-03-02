import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/app/lib/db";

// ─── GET /api/applications/:id ────────────────────────────────────────────────

export async function GET(
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
            `SELECT * FROM events WHERE application_id = $1 ORDER BY timestamp ASC`,
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