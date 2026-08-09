import { createFileRoute, redirect, getRouteApi } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import {
  fetchProjects,
  fetchTimeEntries,
  fetchMarksForEntries,
  groupMarksByEntryId,
  entryMinutes,
  formatDuration,
  formatNok,
  type TimeEntry,
} from "@/lib/work-core";
import { startOfMonth, endOfMonth, toDateInput } from "@/lib/time-utils";
import {
  formatPeriodLabel,
  getPayCycleAnchorDay,
  payCycleContaining,
  previousPayCycle,
} from "@/lib/pay-cycle";
import { formatMarkTime } from "@/lib/marks";
import { TimeEntrySheet } from "@/components/time-entry-sheet";
import { tryOpenSheet } from "@/lib/sheetGate";
import { sheetFieldClass } from "@/lib/sheetField";

export const Route = createFileRoute("/_authenticated/orgs/$orgId/timer")({
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/orgs/$orgId/start",
      params: { orgId: params.orgId },
      search: { ...(search as object), sheet: "timer" },
    });
  },
  component: () => null,
});

const orgRoute = getRouteApi("/_authenticated/orgs/$orgId");

type Period = "current" | "previous" | "month" | "all";

export function TimerPane() {
  const { org, orgId } = orgRoute.useRouteContext();
  const anchorDay = getPayCycleAnchorDay(orgId);
  const [period, setPeriod] = useState<Period>("current");
  const [projectFilter, setProjectFilter] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<TimeEntry | null>(null);

  const range = useMemo<{ from?: Date; to?: Date }>(() => {
    if (period === "current") return payCycleContaining(new Date(), anchorDay);
    if (period === "previous") return previousPayCycle(new Date(), anchorDay);
    if (period === "month") return { from: startOfMonth(), to: endOfMonth() };
    return {};
  }, [period, anchorDay]);

  const periodHint = useMemo(() => {
    if (!range.from || !range.to) return null;
    return formatPeriodLabel(range.from, range.to);
  }, [range.from, range.to]);

  const entriesQ = useQuery({
    queryKey: [
      "entries",
      orgId,
      period,
      projectFilter,
      range.from ? toDateInput(range.from) : "all",
      range.to ? toDateInput(range.to) : "all",
    ],
    queryFn: () =>
      fetchTimeEntries({
        from: range.from,
        to: range.to,
        orgId,
        projectId: projectFilter || undefined,
      }),
  });
  const projectsQ = useQuery({
    queryKey: ["projects", orgId, "include-inactive"],
    queryFn: () => fetchProjects(orgId, true),
  });
  const projById = useMemo(
    () => new Map((projectsQ.data ?? []).map((p) => [p.id, p])),
    [projectsQ.data],
  );

  const entries = entriesQ.data ?? [];
  const entryIds = useMemo(() => entries.map((e) => e.id), [entries]);
  const marksQ = useQuery({
    queryKey: ["marks", "entries", orgId, period, projectFilter, entryIds.join(",")],
    queryFn: () => fetchMarksForEntries(entryIds),
    enabled: entryIds.length > 0,
  });
  const marksByEntry = useMemo(
    () => groupMarksByEntryId(marksQ.data ?? []),
    [marksQ.data],
  );

  const totalMin = entries.reduce((s, e) => s + entryMinutes(e), 0);
  const totalAmount = entries.reduce((s, e) => s + (e.amount ?? 0), 0);
  const anyAmount = entries.some((e) => e.amount != null);

  function openNew() {
    tryOpenSheet(() => {
      setEditing(null);
      setSheetOpen(true);
    });
  }
  function openEdit(e: TimeEntry) {
    tryOpenSheet(() => {
      setEditing(e);
      setSheetOpen(true);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <button
          onClick={openNew}
          className="tap-target bg-primary text-primary-foreground h-11 px-4"
        >
          <Plus className="w-5 h-5 mr-1" />
          Legg til
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-muted text-xs sm:grid-cols-4">
        {(
          [
            ["current", "Denne syklus"],
            ["previous", "Forrige syklus"],
            ["month", "Denne måned"],
            ["all", "Alle"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setPeriod(k)}
            className={`rounded-lg py-2 font-medium ${
              period === k ? "bg-card" : "text-muted-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {periodHint ? (
        <p className="-mt-2 text-center text-[11px] text-muted-foreground">{periodHint}</p>
      ) : null}

      <select
        value={projectFilter}
        onChange={(e) => setProjectFilter(e.target.value)}
        className={sheetFieldClass}
      >
        <option value="">Alle prosjekter</option>
        {(projectsQ.data ?? []).map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      <div className="surface-card flex items-baseline justify-between">
        <span className="text-sm text-muted-foreground">Totalt · {org.name}</span>
        <div className="text-right">
          <div className="text-2xl font-bold tabular-nums">{formatDuration(totalMin)}</div>
          {anyAmount && (
            <div className="text-sm text-muted-foreground tabular-nums">
              {formatNok(totalAmount)}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {entries.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-12">
            Ingen timer registrert.
          </p>
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
                <div className="text-xs text-muted-foreground">
                  {start?.toLocaleDateString("nb-NO", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })}
                </div>
                <div className="mt-1 font-medium">
                  {start?.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}
                  {" – "}
                  {end?.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}
                  {e.break_minutes ? (
                    <span className="text-muted-foreground text-sm">
                      {" "}
                      · {e.break_minutes} min pause
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  {proj && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-accent">{proj.name}</span>
                  )}
                  <span className="text-sm font-semibold tabular-nums">
                    {formatDuration(entryMinutes(e))}
                  </span>
                  {e.amount != null && (
                    <span className="text-sm text-muted-foreground tabular-nums">
                      · {formatNok(e.amount)}
                    </span>
                  )}
                </div>
                {e.comment && <p className="mt-1 text-sm text-muted-foreground">{e.comment}</p>}
                {(marksByEntry.get(e.id)?.length ?? 0) > 0 ? (
                  <ul className="mt-2 space-y-1 border-t border-border/50 pt-2">
                    {(marksByEntry.get(e.id) ?? []).map((m) => (
                      <li key={m.id} className="flex gap-2 text-sm text-muted-foreground">
                        <span className="shrink-0 font-medium tabular-nums text-foreground/80">
                          {formatMarkTime(m.marked_at)}
                        </span>
                        <span className="min-w-0">{m.note}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      <TimeEntrySheet
        key={editing?.id ?? "new"}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        entry={editing}
        orgId={orgId}
      />
    </div>
  );
}
