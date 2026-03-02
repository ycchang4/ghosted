"use client";

import { useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type AppStatus = "applied" | "interview" | "offer" | "rejection" | "ghosted";

interface Event {
    id: number;
    status: AppStatus;
    confidence: number | null;
    subject: string | null;
    created_at: string;
}

interface Application {
    id: number;
    company: string;
    role: string | null;
    current_status: AppStatus;
    updated_at: string;
    events: Event[];
}

// ─── Column config ────────────────────────────────────────────────────────────

const COLUMNS: { status: AppStatus; label: string; color: string }[] = [
    { status: "applied",   label: "Applied",    color: "border-blue-500" },
    { status: "interview", label: "Interview",   color: "border-yellow-400" },
    { status: "offer",     label: "Offer",       color: "border-green-500" },
    { status: "rejection", label: "Rejected",    color: "border-red-400" },
    { status: "ghosted",   label: "Ghosted 👻",  color: "border-purple-400" },
];

// Funnel only shows the forward-progress statuses
const FUNNEL_STEPS: { status: AppStatus; label: string; color: string }[] = [
    { status: "applied",   label: "Applied",   color: "bg-blue-500" },
    { status: "interview", label: "Interview",  color: "bg-yellow-400" },
    { status: "offer",     label: "Offer",      color: "bg-green-500" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", {
        month: "short", day: "numeric",
    });
}

function latestConfidence(events: Event[]): number | null {
    const withConf = [...events].reverse().find((e) => e.confidence !== null);
    return withConf?.confidence ?? null;
}

// ─── Funnel Chart ─────────────────────────────────────────────────────────────

function FunnelChart({
                         summary,
                         total,
                     }: {
    summary: Record<string, number>;
    total: number;
}) {
    const applied = summary["applied"] ?? 0;

    return (
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
                Pipeline Funnel
            </h2>

            <div className="space-y-3">
                {FUNNEL_STEPS.map(({ status, label, color }) => {
                    const count = summary[status] ?? 0;
                    // Width relative to applied count (top of funnel), min 4% so bar is visible
                    const pct = total === 0 ? 0 : Math.max(4, Math.round((count / Math.max(applied, 1)) * 100));
                    const conversionPct = applied === 0 ? 0 : Math.round((count / applied) * 100);

                    return (
                        <div key={status}>
                            <div className="flex justify-between text-sm mb-1">
                                <span className="text-gray-700 font-medium">{label}</span>
                                <span className="text-gray-400">
                  {count} {status !== "applied" && applied > 0 && `· ${conversionPct}%`}
                </span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-3">
                                <div
                                    className={`${color} h-3 rounded-full transition-all duration-500`}
                                    style={{ width: `${pct}%` }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Side stats */}
            <div className="mt-5 flex gap-4 border-t border-gray-100 pt-4">
                <Stat label="Ghosted" value={summary["ghosted"] ?? 0} color="text-purple-500" />
                <Stat label="Rejected" value={summary["rejection"] ?? 0} color="text-red-400" />
                <Stat
                    label="Response rate"
                    value={
                        applied === 0
                            ? "—"
                            : `${Math.round(((summary["interview"] ?? 0) / applied) * 100)}%`
                    }
                    color="text-green-600"
                />
            </div>
        </div>
    );
}

function Stat({
                  label,
                  value,
                  color,
              }: {
    label: string;
    value: number | string;
    color: string;
}) {
    return (
        <div>
            <p className={`text-xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-gray-400">{label}</p>
        </div>
    );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function AppCard({
                     app,
                     onDelete,
                 }: {
    app: Application;
    onDelete: (id: number) => void;
}) {
    const [deleting, setDeleting] = useState(false);
    const confidence = latestConfidence(app.events);
    const lowConfidence = confidence !== null && confidence < 0.8;

    async function handleDelete() {
        if (!confirm(`Remove ${app.company} from your tracker?`)) return;
        setDeleting(true);
        try {
            await fetch(`/api/applications/${app.id}`, { method: "DELETE" });
            onDelete(app.id);
        } catch {
            alert("Failed to delete. Try again.");
            setDeleting(false);
        }
    }

    return (
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm space-y-2 group relative">
            <button
                onClick={handleDelete}
                disabled={deleting}
                className="absolute top-2 right-2 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                aria-label="Delete application"
            >
                ✕
            </button>

            <div className="pr-4">
                <p className="text-gray-800 font-medium leading-tight">{app.company}</p>
                <p className="text-gray-400 text-sm truncate">{app.role ?? "Unknown role"}</p>
            </div>

            <div className="flex items-center justify-between">
                <span className="text-gray-400 text-xs">{formatDate(app.updated_at)}</span>
                {lowConfidence && (
                    <span
                        className="text-xs bg-yellow-50 text-yellow-600 border border-yellow-200 px-1.5 py-0.5 rounded"
                        title={`Classifier confidence: ${Math.round(confidence! * 100)}%`}
                    >
            {Math.round(confidence! * 100)}% conf
          </span>
                )}
            </div>
        </div>
    );
}

// ─── Column ───────────────────────────────────────────────────────────────────

function KanbanColumn({
                          status, label, color, apps, onDelete,
                      }: {
    status: AppStatus; label: string; color: string;
    apps: Application[]; onDelete: (id: number) => void;
}) {
    return (
        <div className="flex flex-col min-w-[200px] w-full">
            <div className={`border-t-2 ${color} bg-gray-50 rounded-t-lg px-3 pt-3 pb-2`}>
                <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-700">{label}</span>
                    <span className="text-xs bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full">
            {apps.length}
          </span>
                </div>
            </div>
            <div className="flex-1 bg-gray-50/50 border border-t-0 border-gray-200 rounded-b-lg p-2 space-y-2 min-h-[120px]">
                {apps.length === 0 ? (
                    <p className="text-gray-300 text-xs text-center pt-4">Empty</p>
                ) : (
                    apps.map((app) => (
                        <AppCard key={app.id} app={app} onDelete={onDelete} />
                    ))
                )}
            </div>
        </div>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
    const [apps, setApps] = useState<Application[]>([]);
    const [summary, setSummary] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch("/api/applications")
            .then((r) => {
                if (!r.ok) throw new Error(`API error ${r.status}`);
                return r.json();
            })
            .then(({ applications, summary }) => {
                setApps(applications);
                setSummary(summary);
            })
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, []);

    function handleDelete(id: number) {
        const deleted = apps.find((a) => a.id === id);
        setApps((prev) => prev.filter((a) => a.id !== id));
        // Update summary count optimistically
        if (deleted) {
            setSummary((prev) => ({
                ...prev,
                [deleted.current_status]: Math.max(0, (prev[deleted.current_status] ?? 1) - 1),
            }));
        }
    }

    const appsByStatus = (status: AppStatus) =>
        apps.filter((a) => a.current_status === status);

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <p className="text-gray-400 animate-pulse">Loading applications…</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <p className="text-red-400">Error: {error}</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900 p-6 space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold tracking-tight">👻 Ghosted</h1>
                <p className="text-gray-400 text-sm mt-1">
                    {apps.length} application{apps.length !== 1 ? "s" : ""} tracked
                </p>
            </div>

            {/* Funnel chart */}
            <FunnelChart summary={summary} total={apps.length} />

            {/* Kanban board */}
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {COLUMNS.map(({ status, label, color }) => (
                    <KanbanColumn
                        key={status}
                        status={status}
                        label={label}
                        color={color}
                        apps={appsByStatus(status)}
                        onDelete={handleDelete}
                    />
                ))}
            </div>
        </div>
    );
}