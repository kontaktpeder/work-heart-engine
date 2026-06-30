import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import {
  fetchOrganizations,
  fetchProjects,
  fetchTimeEntries,
  entryMinutes,
  formatDuration,
  formatNok,
  type TimeEntry,
} from "@/lib/work-core";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  previousWeek,
  previousMonth,
} from "@/lib/time-utils";
import { TimeEntrySheet } from "@/components/time-entry-sheet";

export const Route = createFileRoute("/_authenticated/timeliste")({
  head: () => ({ meta: [{ title: "Timer · Work Core" }] }),
  component: Timeliste,
});

type Period = "week" | "lastweek" | "month" | "lastmonth" | "all";

function Timeliste() {
  const [period, setPeriod] = useState<Period>("week");
  const [orgFilter, setOrgFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<TimeEntry | null>(null);

  const range = useMemo(() => {
    if (period === "week") return { from: startOfWeek(), to: endOfWeek() };
    if (period === "lastweek") return previousWeek();
    if (period === "month") return { from: startOfMonth(), to: endOfMonth() };
    if (period === "lastmonth") return previousMonth();
    return {};
  }, [period]);

  const entriesQ = useQuery({
    queryKey: ["entries", period, orgFilter, projectFilter],
    queryFn: () => fetchTimeEntries({
      from: range.from,
      to: range.to,
      orgId: orgFilter || undefined,
      projectId: projectFilter || undefined,
    }),
  });
  const orgsQ = useQuery({ queryKey: ["orgs"], queryFn: fetchOrganizations });
  const projectsQ = useQuery({ queryKey: ["projects-all"], queryFn: () => fetchProjects() });

  const projById = useMemo(() => new Map((projectsQ.data ?? []).map((p) => [p.id, p])), [projectsQ.data]);
  const orgById = useMemo(() => new Map((orgsQ.data ?? []).map((o) => [o.id, o])), [orgsQ.data]);

  const entries = entriesQ.data ?? [];
  const totalMin = entries.reduce((s, e) => s + entryMinutes(e), 0);
  const totalAmount = entries.reduce((s, e) => s + (e.amount ?? 0), 0);
  const anyAmount = entries.some((e) => e.amount != null);

  function openNew() { setEditing(null); setSheetOpen(true); }
  function openEdit(e: TimeEntry) { setEditing(e); setSheetOpen(true); }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Timer</h1>
        <button onClick={openNew} className="tap-target bg-primary text-primary-foreground h-11 px-4">
          <Plus className="w-5 h-5 mr-1" />
          Legg til
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-muted text-xs">
        {([
          ["week", "Denne uka"],
          ["lastweek", "Forrige uke"],
          ["month", "Måned"],
          ["lastmonth", "Forr. måned"],
          ["all", "Alle"],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setPeriod(k)}
            className={`py-2 font-medium rounded-lg ${period === k ? "bg-card" : "text-muted-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)} className="h-11 px-3 rounded-xl bg-input border border-border text-sm">
          <option value="">Alle organisasjoner</option>
          {(orgsQ.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="h-11 px-3 rounded-xl bg-input border border-border text-sm">
          <option value="">Alle prosjekter</option>
          {(projectsQ.data ?? []).filter((p) => !orgFilter || p.organization_id === orgFilter).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      <div className="surface-card flex items-baseline justify-between">
        <span className="text-sm text-muted-foreground">Totalt</span>
        <div className="text-right">
          <div className="text-2xl font-bold tabular-nums">{formatDuration(totalMin)}</div>
          {anyAmount && <div className="text-sm text-muted-foreground tabular-nums">{formatNok(totalAmount)}</div>}
        </div>
      </div>

      <div className="space-y-2">
        {entries.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-12">Ingen timer registrert.</p>
        )}
        {entries.map((e) => {
          const start = e.started_at ? new Date(e.started_at) : null;
          const end = e.ended_at ? new Date(e.ended_at) : null;
          const proj = e.project_id ? projById.get(e.project_id) : null;
          return (
            <button
              key={e.id}
              onClick={() => openEdit(e)}
              className="w-full surface-card flex items-start justify-between gap-3 p-4 text-left hover:border-primary/40 transition"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{start?.toLocaleDateString("nb-NO", { weekday: "short", day: "numeric", month: "short" })}</span>
                  <span>·</span>
                  <span>{orgById.get(e.organization_id)?.name ?? "—"}</span>
                </div>
                <div className="mt-1 font-medium">
                  {start?.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}
                  {" – "}
                  {end?.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}
                  {e.break_minutes ? <span className="text-muted-foreground text-sm"> · {e.break_minutes} min pause</span> : null}
                </div>
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  {proj && <span className="text-xs px-2 py-0.5 rounded-full bg-accent">{proj.name}</span>}
                  <span className="text-sm font-semibold tabular-nums">{formatDuration(entryMinutes(e))}</span>
                  {e.amount != null && (
                    <span className="text-sm text-muted-foreground tabular-nums">· {formatNok(e.amount)}</span>
                  )}
                </div>
                {e.comment && <p className="mt-1 text-sm text-muted-foreground">{e.comment}</p>}
              </div>
            </button>
          );
        })}
      </div>

      <TimeEntrySheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        entry={editing}
        defaultOrgId={orgFilter || undefined}
      />
    </div>
  );
}
