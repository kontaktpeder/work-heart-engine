import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { TimeEntry, Project, TimeEntryMark, Organization } from "./work-core";
import { entryMinutes, sumPauseMinutes } from "./work-core";
import { reportNotes } from "./marks";

export type ReportMeta = {
  companyName: string;
  employeeName: string;
  managerName: string;
  periodLabel: string;
};

export type ExportRow = {
  date: string;
  customer: string;
  project: string;
  task: string;
  start: string;
  end: string;
  pauseMin: number;
  hours: number;
  notes: string;
};

function fmtHours(min: number): string {
  return (min / 60).toLocaleString("nb-NO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function buildReportMeta(
  org: Pick<Organization, "name" | "report_company_name">,
  periodLabel: string,
  names: { employeeName?: string | null; managerName?: string | null } = {},
): ReportMeta {
  return {
    companyName: (org.report_company_name || org.name || "").trim(),
    employeeName: (names.employeeName || "").trim(),
    managerName: (names.managerName || "").trim(),
    periodLabel,
  };
}

export function buildRows(
  entries: TimeEntry[],
  projectsById: Map<string, Project>,
  marksByEntry: Map<string, TimeEntryMark[]> = new Map(),
): ExportRow[] {
  return entries.map((e) => {
    const min = entryMinutes(e);
    const start = e.started_at ? new Date(e.started_at) : null;
    const end = e.ended_at ? new Date(e.ended_at) : null;
    const marks = marksByEntry.get(e.id) ?? [];
    const pauseFromMarks = sumPauseMinutes(marks);
    return {
      date: start ? start.toLocaleDateString("nb-NO") : (e.date ?? ""),
      customer: (e.customer ?? "").trim(),
      project: e.project_id ? (projectsById.get(e.project_id)?.name ?? "—") : "—",
      task: (e.task ?? "").trim(),
      start: start
        ? start.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })
        : (e.start_time ?? "").slice(0, 5),
      end: end
        ? end.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })
        : (e.end_time ?? "").slice(0, 5),
      pauseMin: pauseFromMarks || e.break_minutes || 0,
      hours: min / 60,
      notes: reportNotes(e.comment, marks),
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

export function buildCsv(rows: ExportRow[], meta: ReportMeta, filename = "prosjekttimeliste.csv") {
  const lines: string[] = [
    ["Firmanavn", meta.companyName].map(csvEscape).join(";"),
    ["Ansatt", meta.employeeName].map(csvEscape).join(";"),
    ["Periode", meta.periodLabel].map(csvEscape).join(";"),
    ["Leder", meta.managerName].map(csvEscape).join(";"),
    "",
    [
      "Dato",
      "Kunde",
      "Prosjekt",
      "Oppgave",
      "Starttid",
      "Sluttid",
      "Pause",
      "Arbeidede timer",
      "Notater",
    ]
      .map(csvEscape)
      .join(";"),
  ];

  for (const r of rows) {
    lines.push(
      [
        r.date,
        r.customer,
        r.project,
        r.task,
        r.start,
        r.end,
        r.pauseMin,
        fmtHours(Math.round(r.hours * 60)),
        r.notes,
      ]
        .map(csvEscape)
        .join(";"),
    );
  }

  const totalMin = Math.round(rows.reduce((s, r) => s + r.hours * 60, 0));
  lines.push("");
  lines.push(
    ["", "", "", "", "", "", "Prosjekt totalt", fmtHours(totalMin), ""].map(csvEscape).join(";"),
  );

  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, filename);
}

export function buildPdf(
  rows: ExportRow[],
  meta: ReportMeta,
  opts: { title?: string; filename?: string } = {},
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  doc.setFontSize(16);
  doc.text(opts.title ?? "Prosjekttimeliste", 40, 36);
  doc.setFontSize(10);
  doc.setTextColor(80);
  let y = 56;
  for (const [label, value] of [
    ["Firmanavn", meta.companyName],
    ["Ansatt", meta.employeeName],
    ["Periode", meta.periodLabel],
    ["Leder", meta.managerName],
  ] as const) {
    doc.text(`${label}: ${value || "—"}`, 40, y);
    y += 14;
  }
  doc.setTextColor(0);

  const head = [
    ["Dato", "Kunde", "Prosjekt", "Oppgave", "Start", "Slutt", "Pause", "Timer", "Notater"],
  ];
  const body = rows.map((r) => [
    r.date,
    r.customer,
    r.project,
    r.task,
    r.start,
    r.end,
    String(r.pauseMin),
    fmtHours(Math.round(r.hours * 60)),
    r.notes,
  ]);

  const totalMin = Math.round(rows.reduce((s, r) => s + r.hours * 60, 0));
  const foot = [["", "", "", "", "", "", "Totalt", fmtHours(totalMin), ""]];

  autoTable(doc, {
    head,
    body,
    foot,
    startY: y + 8,
    styles: { fontSize: 8, cellPadding: 4, valign: "top" },
    columnStyles: { 8: { cellWidth: 160 } },
    headStyles: { fillColor: [34, 120, 60] },
    footStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: "bold" },
  });

  doc.save(opts.filename ?? "prosjekttimeliste.pdf");
}
