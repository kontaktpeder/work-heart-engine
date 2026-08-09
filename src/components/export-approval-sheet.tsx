import { useEffect, useMemo, useState } from "react";
import { ContentSheet } from "@/components/content-sheet";
import { SheetStickyFooter } from "@/components/sheet-sticky-footer";
import { sheetFieldClass } from "@/lib/sheetField";
import { formatDuration, formatNok, type TimeEntry } from "@/lib/work-core";
import { formatPeriodLabel } from "@/lib/pay-cycle";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  from: string;
  to: string;
  onChangePeriod: (from: string, to: string) => void;
  entries: TimeEntry[];
  totalMin: number;
  totalAmount: number;
  anyAmount: boolean;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
};

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function entryDay(e: TimeEntry): string | null {
  if (e.date) return e.date.slice(0, 10);
  if (e.started_at) return e.started_at.slice(0, 10);
  return null;
}

function MonthGrid({
  year,
  monthIndex,
  worked,
  rangeFrom,
  rangeTo,
}: {
  year: number;
  monthIndex: number;
  worked: Set<string>;
  rangeFrom: string;
  rangeTo: string;
}) {
  const first = new Date(year, monthIndex, 1);
  const startPad = (first.getDay() + 6) % 7; // Monday=0
  const days = new Date(year, monthIndex + 1, 0).getDate();
  const label = first.toLocaleDateString("nb-NO", { month: "long", year: "numeric" });
  const cells: (number | null)[] = [...Array(startPad).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold capitalize">{label}</p>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground">
        {["ma", "ti", "on", "to", "fr", "lø", "sø"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} />;
          const key = dateKey(new Date(year, monthIndex, day));
          const inRange = key >= rangeFrom && key <= rangeTo;
          const hasWork = worked.has(key);
          return (
            <div
              key={key}
              className={`flex h-9 flex-col items-center justify-center rounded-lg text-xs tabular-nums ${
                inRange ? "bg-muted/60" : "opacity-40"
              }`}
            >
              <span>{day}</span>
              {hasWork ? <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary" /> : <span className="mt-0.5 h-1.5" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ExportApprovalSheet({
  open,
  onClose,
  title,
  from,
  to,
  onChangePeriod,
  entries,
  totalMin,
  totalAmount,
  anyAmount,
  confirmLabel,
  busy,
  onConfirm,
}: Props) {
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);

  useEffect(() => {
    if (open) {
      setDraftFrom(from);
      setDraftTo(to);
    }
  }, [open, from, to]);

  const worked = useMemo(() => {
    const s = new Set<string>();
    for (const e of entries) {
      const d = entryDay(e);
      if (d) s.add(d);
    }
    return s;
  }, [entries]);

  const months = useMemo(() => {
    const start = new Date(draftFrom + "T12:00:00");
    const end = new Date(draftTo + "T12:00:00");
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
    const list: { year: number; month: number }[] = [];
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    const last = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cur <= last && list.length < 3) {
      list.push({ year: cur.getFullYear(), month: cur.getMonth() });
      cur.setMonth(cur.getMonth() + 1);
    }
    return list;
  }, [draftFrom, draftTo]);

  const fromDate = new Date(draftFrom + "T00:00:00");
  const toDate = new Date(draftTo + "T00:00:00");
  const periodOk = !Number.isNaN(fromDate.getTime()) && !Number.isNaN(toDate.getTime()) && draftFrom <= draftTo;

  if (!open) return null;

  return (
    <ContentSheet onClose={onClose} title={title} zClassName="z-[80]" detents={["full"]}>
      <div
        data-sheet-scroll
        className="scroll-touch min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5"
      >
        <p className="text-sm text-muted-foreground">
          Bekreft perioden før eksport. Juster datoene hvis timer fra feil periode er med.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <label className="text-xs text-muted-foreground">Fra</label>
            <input
              type="date"
              value={draftFrom}
              onChange={(e) => {
                setDraftFrom(e.target.value);
                onChangePeriod(e.target.value, draftTo);
              }}
              className={`${sheetFieldClass} mt-1`}
            />
          </div>
          <div className="min-w-0">
            <label className="text-xs text-muted-foreground">Til</label>
            <input
              type="date"
              value={draftTo}
              onChange={(e) => {
                setDraftTo(e.target.value);
                onChangePeriod(draftFrom, e.target.value);
              }}
              className={`${sheetFieldClass} mt-1`}
            />
          </div>
        </div>

        {periodOk ? (
          <p className="text-sm font-medium">{formatPeriodLabel(fromDate, toDate)}</p>
        ) : null}

        <div className="surface-card space-y-2 !p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">Timer i perioden</span>
            <span className="text-xl font-bold tabular-nums">{formatDuration(totalMin)}</span>
          </div>
          {anyAmount ? (
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Beløp</span>
              <span className="text-lg font-bold tabular-nums">{formatNok(totalAmount)}</span>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">{entries.length} føringer · prikk = jobbet</p>
        </div>

        <div className="space-y-5">
          {months.map((m) => (
            <MonthGrid
              key={`${m.year}-${m.month}`}
              year={m.year}
              monthIndex={m.month}
              worked={worked}
              rangeFrom={draftFrom}
              rangeTo={draftTo}
            />
          ))}
        </div>
      </div>

      <SheetStickyFooter>
        <button
          type="button"
          disabled={!periodOk || busy || entries.length === 0}
          onClick={onConfirm}
          className="tap-target w-full bg-primary text-primary-foreground h-12 disabled:opacity-50"
        >
          {busy ? "Eksporterer…" : confirmLabel}
        </button>
      </SheetStickyFooter>
    </ContentSheet>
  );
}
