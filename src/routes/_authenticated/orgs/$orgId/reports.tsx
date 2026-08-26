import { createFileRoute, redirect, getRouteApi, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, FileText, Send } from "lucide-react";
import {
  fetchProjects,
  fetchRates,
  fetchTimeEntries,
  fetchMarksForEntries,
  fetchMyOrgMembership,
  groupMarksByEntryId,
  entryMinutes,
  formatDuration,
  formatNok,
} from "@/lib/work-core";
import { startOfMonth, endOfMonth, toDateInput } from "@/lib/time-utils";
import { buildCsv, buildPdf, buildReportMeta, buildRows } from "@/lib/export";
import { countExportableEntries, exportTimeEntriesToFinance } from "@/lib/finance-export.functions";
import { sheetFieldClass } from "@/lib/sheetField";
import {
  formatPeriodLabel,
  getPayCycleAnchorDay,
  payCycleContaining,
  periodToInputs,
  previousPayCycle,
  setPayCycleAnchorDay,
} from "@/lib/pay-cycle";
import { ExportApprovalSheet } from "@/components/export-approval-sheet";
import { tryOpenSheet } from "@/lib/sheetGate";
import { hasRequiredEmployeeName, isOrgAdmin, type OrgMembership } from "@/lib/org-access";

export const Route = createFileRoute("/_authenticated/orgs/$orgId/reports")({
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/orgs/$orgId/start",
      params: { orgId: params.orgId },
      search: { ...(search as object), sheet: "reports" },
    });
  },
  component: () => null,
});

const orgRoute = getRouteApi("/_authenticated/orgs/$orgId");

type PeriodPreset = "current" | "previous" | "month" | "custom";
type PendingExport = "csv" | "pdf" | "finance" | null;

export function ReportsPane() {
  const {
    org,
    orgId,
    membership: initialMembership,
  } = orgRoute.useRouteContext() as {
    org: { name: string; report_company_name: string | null };
    orgId: string;
    membership: OrgMembership | null;
  };
  const search = orgRoute.useSearch();
  const navigate = useNavigate();
  const membershipQ = useQuery({
    queryKey: ["org-membership", orgId],
    queryFn: () => fetchMyOrgMembership(orgId),
    initialData: initialMembership ?? undefined,
  });
  const membership = membershipQ.data;
  const canFinanceExport = isOrgAdmin(membership?.role);
  const employeeName = membership?.report_employee_name ?? "";
  const managerName = membership?.report_manager_name ?? "";
  const [anchorDay, setAnchorDay] = useState(() => getPayCycleAnchorDay(orgId));
  const initialCycle = payCycleContaining(new Date(), getPayCycleAnchorDay(orgId));
  const initial = periodToInputs(initialCycle.from, initialCycle.to);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [preset, setPreset] = useState<PeriodPreset>("current");
  const [projectId, setProjectId] = useState("");
  const [pendingExport, setPendingExport] = useState<PendingExport>(null);
  const [missingEmployee, setMissingEmployee] = useState(false);

  const projectsQ = useQuery({
    queryKey: ["projects", orgId, "include-inactive"],
    queryFn: () => fetchProjects(orgId, true),
  });
  const ratesQ = useQuery({
    queryKey: ["rates", orgId, "include-inactive"],
    queryFn: () => fetchRates(orgId, true),
  });

  const fromDate = new Date(from + "T00:00:00");
  const toDate = new Date(to + "T23:59:59");

  const entriesQ = useQuery({
    queryKey: ["entries", orgId, "report", from, to, projectId],
    queryFn: () =>
      fetchTimeEntries({
        from: fromDate,
        to: toDate,
        orgId,
        projectId: projectId || undefined,
      }),
  });

  const entries = entriesQ.data ?? [];
  const entryIds = useMemo(() => entries.map((e) => e.id), [entries]);
  const marksQ = useQuery({
    queryKey: ["marks", "report", orgId, from, to, projectId, entryIds.join(",")],
    queryFn: () => fetchMarksForEntries(entryIds),
    enabled: entryIds.length > 0,
  });
  const marksByEntry = useMemo(() => groupMarksByEntryId(marksQ.data ?? []), [marksQ.data]);

  const qc = useQueryClient();
  const countFn = useServerFn(countExportableEntries);
  const exportFn = useServerFn(exportTimeEntriesToFinance);

  const exportableQ = useQuery({
    queryKey: ["finance-exportable", orgId, from, to],
    queryFn: () => countFn({ data: { organizationId: orgId, from, to } }),
    enabled: canFinanceExport,
  });

  const exportMut = useMutation({
    mutationFn: () => exportFn({ data: { organizationId: orgId, from, to, dryRun: false } }),
    onSuccess: (res) => {
      setPendingExport(null);
      qc.invalidateQueries({ queryKey: ["finance-exportable", orgId] });
      qc.invalidateQueries({ queryKey: ["entries", orgId] });
      if (res.errors.length) {
        toast.error(
          `Exported ${res.exported}, ${res.errors.length} failed. See finance_export_log.`,
        );
      } else {
        toast.success(`Exported ${res.exported} entries to Finance`);
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Export failed"),
  });

  const projById = useMemo(
    () => new Map((projectsQ.data ?? []).map((p) => [p.id, p])),
    [projectsQ.data],
  );
  const rateById = useMemo(() => new Map((ratesQ.data ?? []).map((r) => [r.id, r])), [ratesQ.data]);

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

  const periodLabel = formatPeriodLabel(fromDate, toDate);
  const reportMeta = buildReportMeta(org, periodLabel, {
    employeeName,
    managerName,
  });

  function openReportForm() {
    void navigate({
      to: "/orgs/$orgId/start",
      params: { orgId },
      search: {
        return: search.return,
        sheet: "settings",
        section: "report",
      },
    });
  }

  function applyPeriod(next: PeriodPreset, day = anchorDay) {
    setPreset(next);
    if (next === "current") {
      const cycle = payCycleContaining(new Date(), day);
      const inputs = periodToInputs(cycle.from, cycle.to);
      setFrom(inputs.from);
      setTo(inputs.to);
      return;
    }
    if (next === "previous") {
      const cycle = previousPayCycle(new Date(), day);
      const inputs = periodToInputs(cycle.from, cycle.to);
      setFrom(inputs.from);
      setTo(inputs.to);
      return;
    }
    if (next === "month") {
      setFrom(toDateInput(startOfMonth()));
      setTo(toDateInput(endOfMonth()));
    }
  }

  function onAnchorChange(raw: string) {
    const day = Math.min(28, Math.max(1, parseInt(raw, 10) || 5));
    setAnchorDay(day);
    setPayCycleAnchorDay(orgId, day);
    if (preset === "current" || preset === "previous") {
      applyPeriod(preset, day);
    }
  }

  function exportCsv() {
    const rows = buildRows(entries, projById, marksByEntry);
    buildCsv(rows, reportMeta, `${org.name}_${from}_${to}.csv`);
    setPendingExport(null);
  }
  function exportPdf() {
    const rows = buildRows(entries, projById, marksByEntry);
    buildPdf(rows, reportMeta, {
      title: "Prosjekttimeliste",
      filename: `${org.name}_${from}_${to}.pdf`,
    });
    setPendingExport(null);
  }

  function requestExport(kind: NonNullable<PendingExport>) {
    if (membershipQ.isLoading && !membership) return;
    if (!hasRequiredEmployeeName(employeeName)) {
      setMissingEmployee(true);
      toast.error("Fyll inn ansattnavn før eksport", {
        action: {
          label: "Åpne skjema",
          onClick: openReportForm,
        },
      });
      return;
    }
    setMissingEmployee(false);
    tryOpenSheet(() => setPendingExport(kind));
  }

  const currentLabel = formatPeriodLabel(
    payCycleContaining(new Date(), anchorDay).from,
    payCycleContaining(new Date(), anchorDay).to,
  );
  const previousLabel = formatPeriodLabel(
    previousPayCycle(new Date(), anchorDay).from,
    previousPayCycle(new Date(), anchorDay).to,
  );

  const confirmLabel =
    pendingExport === "csv"
      ? "Bekreft og last ned CSV"
      : pendingExport === "pdf"
        ? "Bekreft og last ned PDF"
        : "Bekreft og eksporter til Finance";

  return (
    <div className="space-y-4">
      <div className="surface-card space-y-3">
        <div>
          <label className="text-xs text-muted-foreground">Lønnssyklus (fra dag)</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={28}
              value={anchorDay}
              onChange={(e) => onAnchorChange(e.target.value)}
              className={`${sheetFieldClass} w-20`}
            />
            <span className="text-sm text-muted-foreground">f.eks. 5. → 5. (som e-skjenk)</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {(
            [
              ["current", "Denne syklus", currentLabel],
              ["previous", "Forrige syklus", previousLabel],
              ["month", "Denne måned", null],
              ["custom", "Egendefinert", null],
            ] as const
          ).map(([key, label, hint]) => (
            <button
              key={key}
              type="button"
              onClick={() => applyPeriod(key)}
              className={`rounded-xl border px-3 py-2 text-left text-sm ${
                preset === key
                  ? "border-primary bg-primary/10 font-semibold"
                  : "border-border bg-card"
              }`}
            >
              <span className="block">{label}</span>
              {hint ? (
                <span className="block text-[11px] font-normal text-muted-foreground">{hint}</span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <label className="text-xs text-muted-foreground">Fra</label>
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setPreset("custom");
                setFrom(e.target.value);
              }}
              className={`${sheetFieldClass} mt-1`}
            />
          </div>
          <div className="min-w-0">
            <label className="text-xs text-muted-foreground">Til</label>
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setPreset("custom");
                setTo(e.target.value);
              }}
              className={`${sheetFieldClass} mt-1`}
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Prosjekt</label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className={`${sheetFieldClass} mt-1`}
          >
            <option value="">Alle</option>
            {(projectsQ.data ?? []).map((p) => (
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
          onClick={() => requestExport("csv")}
          disabled={!entries.length}
          className="tap-target bg-secondary text-secondary-foreground h-12 disabled:opacity-50"
        >
          <Download className="w-4 h-4 mr-2" />
          CSV
        </button>
        <button
          onClick={() => requestExport("pdf")}
          disabled={!entries.length}
          className="tap-target bg-primary text-primary-foreground h-12 disabled:opacity-50"
        >
          <FileText className="w-4 h-4 mr-2" />
          PDF
        </button>
      </div>

      {missingEmployee ? (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-medium">Ansattnavn mangler</p>
          <p className="mt-1 text-muted-foreground">
            Fyll inn navnet ditt på rapportskjemaet før du eksporterer.
          </p>
          <button
            type="button"
            onClick={openReportForm}
            className="mt-3 text-sm font-medium text-primary underline"
          >
            Åpne skjema for ansatt og leder
          </button>
        </div>
      ) : null}

      {canFinanceExport ? (
        <button
          onClick={() => requestExport("finance")}
          disabled={(exportableQ.data?.count ?? 0) === 0}
          className="tap-target w-full bg-primary text-primary-foreground h-12 disabled:opacity-50"
        >
          <Send className="w-4 h-4 mr-2" />
          {`Export to Finance (${exportableQ.data?.count ?? 0})`}
        </button>
      ) : null}

      <ExportApprovalSheet
        open={pendingExport != null}
        onClose={() => setPendingExport(null)}
        title={
          pendingExport === "finance"
            ? "Godkjenn Finance-eksport"
            : pendingExport === "pdf"
              ? "Godkjenn PDF"
              : "Godkjenn CSV"
        }
        from={from}
        to={to}
        onChangePeriod={(nextFrom, nextTo) => {
          setPreset("custom");
          setFrom(nextFrom);
          setTo(nextTo);
        }}
        entries={entries}
        totalMin={totalMin}
        confirmLabel={confirmLabel}
        busy={pendingExport === "finance" && exportMut.isPending}
        metaPreview={{
          company: reportMeta.companyName,
          employee: reportMeta.employeeName,
          manager: reportMeta.managerName,
        }}
        onConfirm={() => {
          if (pendingExport === "csv") exportCsv();
          else if (pendingExport === "pdf") exportPdf();
          else if (pendingExport === "finance") exportMut.mutate();
        }}
      />
    </div>
  );
}
