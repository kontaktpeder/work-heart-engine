import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { TimeEntry, Project } from "./work-core";
import { entryMinutes, formatNok } from "./work-core";

export type ExportRow = {
  date: string;
  start: string;
  end: string;
  breakMin: number;
  hours: number;
  project: string;
  comment: string;
  rate: number | null;
  amount: number | null;
};

function fmtHours(min: number): string {
  return (min / 60).toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function buildRows(
  entries: TimeEntry[],
  projectsById: Map<string, Project>,
): ExportRow[] {
  return entries.map((e) => {
    const min = entryMinutes(e);
    const start = e.started_at ? new Date(e.started_at) : null;
    const end = e.ended_at ? new Date(e.ended_at) : null;
    return {
      date: start ? start.toLocaleDateString("nb-NO") : e.date ?? "",
      start: start ? start.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" }) : (e.start_time ?? "").slice(0, 5),
      end: end ? end.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" }) : (e.end_time ?? "").slice(0, 5),
      breakMin: e.break_minutes ?? 0,
      hours: min / 60,
      project: e.project_id ? projectsById.get(e.project_id)?.name ?? "—" : "—",
      comment: e.comment ?? "",
      rate: e.hourly_rate,
      amount: e.amount,
    };
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvEscape(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(";") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildCsv(rows: ExportRow[], filename = "timer.csv") {
  const anyRate = rows.some((r) => r.rate != null);
  const header = ["Dato", "Fra", "Til", "Pause (min)", "Timer", "Prosjekt", "Kommentar"];
  if (anyRate) header.push("Sats", "Beløp");
  const lines = [header.join(";")];
  for (const r of rows) {
    const base = [
      r.date,
      r.start,
      r.end,
      r.breakMin,
      fmtHours(Math.round(r.hours * 60)),
      r.project,
      r.comment,
    ].map(csvEscape);
    if (anyRate) {
      base.push(csvEscape(r.rate ?? ""), csvEscape(r.amount ?? ""));
    }
    lines.push(base.join(";"));
  }
  // Totals
  const totalMin = Math.round(rows.reduce((s, r) => s + r.hours * 60, 0));
  const totalAmount = rows.reduce((s, r) => s + (r.amount ?? 0), 0);
  lines.push("");
  lines.push(["Sum", "", "", "", fmtHours(totalMin), "", ""].concat(anyRate ? ["", String(totalAmount.toFixed(2))] : []).map(csvEscape).join(";"));

  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, filename);
}

export function buildPdf(
  rows: ExportRow[],
  opts: { title: string; periodLabel: string; filename?: string },
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const anyRate = rows.some((r) => r.rate != null);

  doc.setFontSize(16);
  doc.text(opts.title, 40, 40);
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(opts.periodLabel, 40, 58);
  doc.setTextColor(0);

  const head = [["Dato", "Fra", "Til", "Pause", "Timer", "Prosjekt", "Kommentar"]];
  if (anyRate) head[0].push("Sats", "Beløp");

  const body = rows.map((r) => {
    const base = [
      r.date,
      r.start,
      r.end,
      String(r.breakMin),
      fmtHours(Math.round(r.hours * 60)),
      r.project,
      r.comment,
    ];
    if (anyRate) base.push(r.rate != null ? String(r.rate) : "", r.amount != null ? formatNok(r.amount) : "");
    return base;
  });

  const totalMin = Math.round(rows.reduce((s, r) => s + r.hours * 60, 0));
  const totalAmount = rows.reduce((s, r) => s + (r.amount ?? 0), 0);
  const foot = [["Sum", "", "", "", fmtHours(totalMin), "", ""]];
  if (anyRate) foot[0].push("", formatNok(totalAmount));

  autoTable(doc, {
    head,
    body,
    foot,
    startY: 75,
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [30, 30, 30] },
    footStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: "bold" },
  });

  // Per-project breakdown
  const byProject = new Map<string, { min: number; amount: number }>();
  for (const r of rows) {
    const cur = byProject.get(r.project) ?? { min: 0, amount: 0 };
    cur.min += r.hours * 60;
    cur.amount += r.amount ?? 0;
    byProject.set(r.project, cur);
  }
  if (byProject.size > 0) {
    autoTable(doc, {
      head: [["Prosjekt", "Timer", ...(anyRate ? ["Beløp"] : [])]],
      body: [...byProject.entries()].map(([name, v]) => [
        name,
        fmtHours(Math.round(v.min)),
        ...(anyRate ? [formatNok(v.amount)] : []),
      ]),
      startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20,
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [60, 60, 60] },
    });
  }

  doc.save(opts.filename ?? "timer.pdf");
}
