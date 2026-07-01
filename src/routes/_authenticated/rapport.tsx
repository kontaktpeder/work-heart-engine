import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText } from "lucide-react";
import {
  fetchDefaultOrgId,
  fetchOrganizations,
  fetchProjects,
  fetchRates,
  fetchTimeEntries,
  entryMinutes,
  formatDuration,
  formatNok,
  setDefaultOrgId,
} from "@/lib/work-core";
import { startOfMonth, endOfMonth, toDateInput } from "@/lib/time-utils";
import { buildCsv, buildPdf, buildRows } from "@/lib/export";

export const Route = createFileRoute("/_authenticated/rapport")({
  head: () => ({ meta: [{ title: "Rapport · Work Core" }] }),
  component: Rapport,
});

function Rapport() {
  const qc = useQueryClient();
  const [from, setFrom] = useState(toDateInput(startOfMonth()));
  const [to, setTo] = useState(toDateInput(endOfMonth()));
  const [orgId, setOrgId] = useState("");
  const [orgTouched, setOrgTouched] = useState(false);
  const [projectId, setProjectId] = useState("");

  const defaultOrgQ = useQuery({ queryKey: ["default-org"], queryFn: fetchDefaultOrgId });
  useEffect(() => {
    if (!orgTouched && !orgId && defaultOrgQ.data) setOrgId(defaultOrgQ.data);
  }, [defaultOrgQ.data, orgId, orgTouched]);

  const orgsQ = useQuery({ queryKey: ["orgs"], queryFn: fetchOrganizations });
  const projectsQ = useQuery({
    queryKey: ["projects-all"],
    queryFn: () => fetchProjects(undefined, true),
  });
  const ratesQ = useQuery({
    queryKey: ["rates-all"],
    queryFn: () => fetchRates(undefined, true),
  });

  const fromDate = new Date(from + "T00:00:00");
  const toDate = new Date(to + "T23:59:59");

  const entriesQ = useQuery({
    queryKey: ["entries", "report", from, to, orgId, projectId],
    queryFn: () =>
      fetchTimeEntries({
        from: fromDate,
        to: toDate,
        orgId: orgId || undefined,
        projectId: projectId || undefined,
      }),
  });

  const entries = entriesQ.data ?? [];
  const projById = useMemo(
    () => new Map((projectsQ.data ?? []).map((p) => [p.id, p])),
    [projectsQ.data],
  );
  const rateById = useMemo(
    () => new Map((ratesQ.data ?? []).map((r) => [r.id, r])),
    [ratesQ.data],
  );

  const totalMin = entries.reduce((s, e) => s + entryMinutes(e), 0);
  const totalAmount = entries.reduce((s, e) => s + (e.amount ?? 0), 0);
  const anyAmount = entries.some((e) => e.amount != null);

  const byProject = useMemo(() => {
    const m = new Map<string, { min: number; amount: number; name: string }>();
    for (const e of entries) {
      const name = e.project_id ? (projById.get(e.project_id)?.name ?? "—") : "—";
      const key = e.project_id ?? "—";
      const cur = m.get(key) ?? { min: 0, amount: 0, name };
      cur.min += entryMinutes(e);
      cur.amount += e.amount ?? 0;
      m.set(key, cur);
    }
    return [...m.values()].sort((a, b) => b.min - a.min);
  }, [entries, projById]);

  const byRate = useMemo(() => {
    const m = new Map<string, { min: number; amount: number; name: string }>();
    for (const e of entries) {
      if (!e.rate_id) continue;
      const name = rateById.get(e.rate_id)?.name ?? "—";
      const cur = m.get(e.rate_id) ?? { min: 0, amount: 0, name };
      cur.min += entryMinutes(e);
      cur.amount += e.amount ?? 0;
      m.set(e.rate_id, cur);
    }
    return [...m.values()].sort((a, b) => b.min - a.min);
  }, [entries, rateById]);

  function exportCsv() {
    const rows = buildRows(entries, projById, rateById);
    buildCsv(rows, `timer_${from}_${to}.csv`);
  }
  function exportPdf() {
    const rows = buildRows(entries, projById, rateById);
    const orgName = orgId
      ? orgsQ.data?.find((o) => o.id === orgId)?.name
      : "Alle organisasjoner";
    buildPdf(rows, {
      title: "Timeoppgave",
      periodLabel: `${orgName} · ${from} – ${to}`,
      filename: `timer_${from}_${to}.pdf`,
    });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Rapport</h1>

      <div className="surface-card space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground">Fra</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full h-11 px-3 rounded-xl bg-input border border-border"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Til</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full h-11 px-3 rounded-xl bg-input border border-border"
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Organisasjon</label>
          <select
            value={orgId}
            onChange={(e) => {
              const v = e.target.value;
              setOrgTouched(true);
              setOrgId(v);
              if (v) setDefaultOrgId(v).then(() => qc.invalidateQueries({ queryKey: ["default-org"] }));
            }}
            className="w-full h-11 px-3 rounded-xl bg-input border border-border"
          >
            <option value="">Alle</option>
            {(orgsQ.data ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Prosjekt</label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full h-11 px-3 rounded-xl bg-input border border-border"
          >
            <option value="">Alle</option>
            {(projectsQ.data ?? [])
              .filter((p) => !orgId || p.organization_id === orgId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </div>
      </div>

      <div className="surface-card space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">Total tid</span>
          <span className="text-2xl font-bold tabular-nums">{formatDuration(totalMin)}</span>
        </div>
        {anyAmount && (
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">Total beløp</span>
            <span className="text-xl font-bold tabular-nums">{formatNok(totalAmount)}</span>
          </div>
        )}
      </div>

      {byProject.length > 0 && (
        <div className="surface-card">
          <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">
            Per prosjekt
          </h2>
          <div className="space-y-2">
            {byProject.map((p) => (
              <div key={p.name} className="flex items-baseline justify-between">
                <span className="truncate">{p.name}</span>
                <div className="text-right">
                  <div className="tabular-nums font-medium">{formatDuration(p.min)}</div>
                  {p.amount > 0 && (
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {formatNok(p.amount)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {byRate.length > 0 && (
        <div className="surface-card">
          <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">
            Per sats
          </h2>
          <div className="space-y-2">
            {byRate.map((r) => (
              <div key={r.name} className="flex items-baseline justify-between">
                <span className="truncate">{r.name}</span>
                <div className="text-right">
                  <div className="tabular-nums font-medium">{formatDuration(r.min)}</div>
                  {r.amount > 0 && (
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {formatNok(r.amount)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={exportCsv}
          disabled={!entries.length}
          className="tap-target bg-secondary text-secondary-foreground h-12 disabled:opacity-50"
        >
          <Download className="w-4 h-4 mr-2" />
          CSV
        </button>
        <button
          onClick={exportPdf}
          disabled={!entries.length}
          className="tap-target bg-primary text-primary-foreground h-12 disabled:opacity-50"
        >
          <FileText className="w-4 h-4 mr-2" />
          PDF
        </button>
      </div>
    </div>
  );
}
