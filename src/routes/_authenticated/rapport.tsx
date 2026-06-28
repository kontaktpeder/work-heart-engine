import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchOrganizations,
  fetchTimeEntries,
  fetchWorkTypes,
  entryMinutes,
  formatDuration,
  startOfWeek,
} from "@/lib/work-core";

export const Route = createFileRoute("/_authenticated/rapport")({
  head: () => ({ meta: [{ title: "Rapport · Work Core" }] }),
  component: Report,
});

function Report() {
  const from = startOfWeek();
  const entriesQ = useQuery({ queryKey: ["entries", "report-week"], queryFn: () => fetchTimeEntries(from) });
  const orgsQ = useQuery({ queryKey: ["orgs"], queryFn: fetchOrganizations });
  const typesQ = useQuery({ queryKey: ["types-all"], queryFn: () => fetchWorkTypes() });

  const entries = entriesQ.data ?? [];
  const total = entries.reduce((s, e) => s + entryMinutes(e), 0);

  const byOrg = useMemo(() => groupBy(entries, "organization_id"), [entries]);
  const byType = useMemo(() => groupBy(entries, "work_type_id"), [entries]);
  const byDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) {
      const day = new Date(e.started_at).toLocaleDateString("nb-NO", { weekday: "short", day: "numeric" });
      map.set(day, (map.get(day) ?? 0) + entryMinutes(e));
    }
    return [...map.entries()];
  }, [entries]);

  const orgName = (id: string) => orgsQ.data?.find((o) => o.id === id)?.name ?? "—";
  const typeName = (id: string | null) => (id ? typesQ.data?.find((t) => t.id === id)?.name : null) ?? "Uten type";

  const max = Math.max(1, ...byDay.map(([, v]) => v));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Denne uka</h1>

      <div className="surface-card text-center">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Totalt</p>
        <p className="mt-1 text-4xl font-bold tabular-nums">{formatDuration(total)}</p>
      </div>

      <div className="surface-card">
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">Per dag</h2>
        <div className="space-y-2">
          {byDay.length === 0 && <p className="text-sm text-muted-foreground">Ingen aktivitet.</p>}
          {byDay.map(([day, min]) => (
            <div key={day}>
              <div className="flex justify-between text-sm mb-1">
                <span className="capitalize">{day}</span>
                <span className="tabular-nums text-muted-foreground">{formatDuration(min)}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${(min / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <Section title="Per organisasjon" rows={Object.entries(byOrg).map(([k, v]) => ({ label: orgName(k), minutes: sum(v) }))} />
      <Section title="Per arbeidstype" rows={Object.entries(byType).map(([k, v]) => ({ label: typeName(k === "null" ? null : k), minutes: sum(v) }))} />
    </div>
  );
}

function Section({ title, rows }: { title: string; rows: { label: string; minutes: number }[] }) {
  const sorted = [...rows].sort((a, b) => b.minutes - a.minutes);
  return (
    <div className="surface-card">
      <h2 className="text-sm font-semibold text-muted-foreground mb-3">{title}</h2>
      {sorted.length === 0 && <p className="text-sm text-muted-foreground">Ingen data.</p>}
      <div className="space-y-2">
        {sorted.map((r) => (
          <div key={r.label} className="flex justify-between text-sm">
            <span>{r.label}</span>
            <span className="font-semibold tabular-nums">{formatDuration(r.minutes)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function groupBy<T extends Record<string, unknown>>(items: T[], key: keyof T): Record<string, T[]> {
  return items.reduce((acc, item) => {
    const k = String(item[key] ?? "null");
    (acc[k] ||= []).push(item);
    return acc;
  }, {} as Record<string, T[]>);
}
function sum(items: { ended_at: string; started_at: string; break_minutes: number }[]): number {
  return items.reduce((s, e) => s + Math.max(0, Math.round((new Date(e.ended_at).getTime() - new Date(e.started_at).getTime()) / 60000) - (e.break_minutes ?? 0)), 0);
}
