"use client";

import { useEffect, useState } from "react";

type AppStatus = "applied" | "interview" | "offer" | "rejection" | "ghosted";

interface Event {
    id: number;
    application_id: number;
    raw_email_id: string | null;
    event_type: AppStatus;
    timestamp: string;
}

interface Funnel {
    applied: number;
    interview: number;
    offer: number;
}

interface Application {
    id: number;
    company: string;
    role: string | null;
    current_status: AppStatus;
    last_updated_at: string;
    events: Event[];
}

const COLUMNS: { status: AppStatus; label: string; dot: string }[] = [
    { status: "applied",   label: "Applied",   dot: "bg-blue-400" },
    { status: "interview", label: "Interview",  dot: "bg-amber-400" },
    { status: "offer",     label: "Offer",      dot: "bg-emerald-400" },
    { status: "rejection", label: "Rejected",   dot: "bg-rose-400" },
    { status: "ghosted",   label: "Ghosted",    dot: "bg-zinc-300" },
];

const FUNNEL_STEPS: { status: AppStatus; label: string; bar: string }[] = [
    { status: "applied",   label: "Applied",   bar: "bg-blue-400" },
    { status: "interview", label: "Interview",  bar: "bg-amber-400" },
    { status: "offer",     label: "Offer",      bar: "bg-emerald-400" },
];

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function FunnelChart({ funnel, summary, total }: { funnel: Funnel; summary: Record<string, number>; total: number }) {
    const applied = funnel.applied;

    return (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-5">Pipeline</p>

            <div className="space-y-4">
                {FUNNEL_STEPS.map(({ status, label, bar }) => {
                    const count = funnel[status as keyof Funnel] ?? 0;
                    const pct = applied === 0 ? 0 : Math.max(3, Math.round((count / applied) * 100));
                    const convPct = applied === 0 ? 0 : Math.round((count / applied) * 100);
                    return (
                        <div key={status} className="flex items-center gap-4">
                            <span className="text-sm text-gray-500 w-20 shrink-0">{label}</span>
                            <div className="flex-1 bg-gray-100 rounded-sm h-1.5">
                                <div className={`${bar} h-1.5 rounded-sm transition-all duration-700`} style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-sm text-gray-400 w-16 text-right tabular-nums">
                {count}{status !== "applied" && applied > 0 ? ` · ${convPct}%` : ""}
              </span>
                        </div>
                    );
                })}
            </div>

            <div className="mt-6 pt-5 border-t border-gray-100 grid grid-cols-3 gap-4">
                {[
                    { label: "Ghosted",       value: summary["ghosted"] ?? 0,   color: "text-zinc-400" },
                    { label: "Rejected",      value: summary["rejection"] ?? 0,  color: "text-rose-400" },
                    { label: "Response rate", value: applied === 0 ? "—" : `${Math.round((funnel.interview / applied) * 100)}%`, color: "text-emerald-500" },
                ].map(({ label, value, color }) => (
                    <div key={label}>
                        <p className={`text-2xl font-semibold ${color}`}>{value}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{label}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}

function AppCard({ app, onDelete }: { app: Application; onDelete: (id: number) => void }) {
    const [deleting, setDeleting] = useState(false);

    async function handleDelete() {
        if (!confirm(`Remove ${app.company}?`)) return;
        setDeleting(true);
        try {
            await fetch(`/api/applications/${app.id}`, { method: "DELETE" });
            onDelete(app.id);
        } catch {
            alert("Failed to delete.");
            setDeleting(false);
        }
    }

    return (
        <div className="group bg-white border border-gray-200 hover:border-gray-300 rounded-md px-3 py-2.5 transition-colors relative">
            <button
                onClick={handleDelete}
                disabled={deleting}
                className="absolute top-2 right-2 text-gray-300 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity text-xs leading-none"
                aria-label="Delete"
            >✕</button>
            <p className="text-sm font-medium text-gray-800 pr-4 leading-snug">{app.company}</p>
            <p className="text-xs text-gray-400 mt-0.5 truncate">{app.role ?? "Unknown role"}</p>
            <p className="text-xs text-gray-300 mt-2">{formatDate(app.last_updated_at)}</p>
        </div>
    );
}

function KanbanColumn({ status, label, dot, apps, onDelete }: {
    status: AppStatus; label: string; dot: string;
    apps: Application[]; onDelete: (id: number) => void;
}) {
    return (
        <div className="flex flex-col min-w-[180px]">
            <div className="flex items-center gap-2 mb-3">
                <span className={`w-2 h-2 rounded-full ${dot}`} />
                <span className="text-xs font-medium text-gray-600">{label}</span>
                <span className="text-xs text-gray-300 ml-auto">{apps.length}</span>
            </div>
            <div className="space-y-2 min-h-[80px]">
                {apps.length === 0
                    ? <p className="text-xs text-gray-200 pt-2">—</p>
                    : apps.map((app) => <AppCard key={app.id} app={app} onDelete={onDelete} />)
                }
            </div>
        </div>
    );
}

export default function DashboardPage() {
    const [apps, setApps] = useState<Application[]>([]);
    const [summary, setSummary] = useState<Record<string, number>>({});
    const [funnel, setFunnel] = useState<Funnel>({ applied: 0, interview: 0, offer: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch("/api/applications")
            .then((r) => { if (!r.ok) throw new Error(`API error ${r.status}`); return r.json(); })
            .then(({ applications, summary, funnel }) => { setApps(applications); setSummary(summary); setFunnel(funnel); })
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, []);

    function handleDelete(id: number) {
        const deleted = apps.find((a) => a.id === id);
        setApps((prev) => prev.filter((a) => a.id !== id));
        if (deleted) setSummary((prev) => ({
            ...prev,
            [deleted.current_status]: Math.max(0, (prev[deleted.current_status] ?? 1) - 1),
        }));
    }

    if (loading) return (
        <div className="min-h-screen bg-white flex items-center justify-center">
            <p className="text-sm text-gray-300 animate-pulse">Loading…</p>
        </div>
    );

    if (error) return (
        <div className="min-h-screen bg-white flex items-center justify-center">
            <p className="text-sm text-rose-400">{error}</p>
        </div>
    );

    return (
        <div className="min-h-screen bg-white">
            <div className="max-w-6xl mx-auto px-8 py-12 space-y-10">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">👻 Ghosted</h1>
                    <p className="text-sm text-gray-400 mt-1">{apps.length} application{apps.length !== 1 ? "s" : ""}</p>
                </div>

                <FunnelChart funnel={funnel} summary={summary} total={apps.length} />

                <div className="border-t border-gray-100" />

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6">
                    {COLUMNS.map(({ status, label, dot }) => (
                        <KanbanColumn
                            key={status}
                            status={status}
                            label={label}
                            dot={dot}
                            apps={apps.filter((a) => a.current_status === status)}
                            onDelete={handleDelete}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}