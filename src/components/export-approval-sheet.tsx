import { useEffect, useMemo, useState } from "react";
import { ContentSheet } from "@/components/content-sheet";
import { SheetStickyFooter } from "@/components/sheet-sticky-footer";
import { sheetFieldClass } from "@/lib/sheetField";
import { entryMinutes, formatDuration, type TimeEntry } from "@/lib/work-core";
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
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  metaPreview?: { company: string; employee: string; manager: string };
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

function fmtClock(iso: string | null | undefined, fallback?: string | null): string {
  if (iso) {
    return new Date(iso).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
  }
  return (fallback ?? "").slice(0, 5);
}

function MonthGrid({
  year,
  monthIndex,
  worked,
  rangeFrom,
  rangeTo,
  onDayClick,
}: {
  year: number;
  monthIndex: number;
  worked: Set<string>;
  rangeFrom: string;
  rangeTo: string;
  onDayClick: (key: string) => void;
}) {
  const first = new Date(year, monthIndex, 1);
  const startPad = (first.getDay() + 6) % 7;
  const days = new Date(year, monthIndex + 1, 0).getDate();
  const label = first.toLocaleDateString("nb-NO", { month: "long", year: "numeric" });
  const cells: (number | null)[] = [
    ...Array(startPad).fill(null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];

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
            <button
              type="button"
              key={key}
              disabled={!hasWork}
              onClick={() => onDayClick(key)}
              className={`flex h-9 flex-col items-center justify-center rounded-lg text-xs tabular-nums ${
                inRange ? "bg-muted/60" : "opacity-40"
              } ${hasWork ? "active:scale-95" : ""}`}
            >
              <span>{day}</span>
              {hasWork ? (
                <span className="mt-0.5 h-1.5 w-1.5 bg-primary" />
              ) : (
                <span className="mt-0.5 h-1.5" />
              )}
            </button>
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
  confirmLabel,
  busy,
  onConfirm,
  metaPreview,
}: Props) {
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [peekDay, setPeekDay] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraftFrom(from);
      setDraftTo(to);
      setPeekDay(null);
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

  const peekEntries = useMemo(() => {
    if (!peekDay) return [];
    return entries.filter((e) => entryDay(e) === peekDay);
  }, [entries, peekDay]);

  const fromDate = new Date(draftFrom + "T00:00:00");
  const toDate = new Date(draftTo + "T00:00:00");
  const periodOk =
    !Number.isNaN(fromDate.getTime()) && !Number.isNaN(toDate.getTime()) && draftFrom <= draftTo;

  if (!open) return null;

  return (
    <ContentSheet onClose={onClose} title={title} zClassName="z-[80]" detents={["full"]}>
      <div
        data-sheet-scroll
        className="scroll-touch min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5"
      >
        <p className="text-sm text-muted-foreground">
          Bekreft perioden før eksport. Trykk en prikk-dato for kjapt referat.
        </p>

        {metaPreview ? (
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground space-y-0.5">
            <p>
              Firmanavn: <span className="text-foreground">{metaPreview.company || "—"}</span>
            </p>
            <p>
              Ansatt: <span className="text-foreground">{metaPreview.employee || "—"}</span>
            </p>
            <p>
              Leder: <span className="text-foreground">{metaPreview.manager || "—"}</span>
            </p>
          </div>
        ) : null}

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
          <p className="text-xs text-muted-foreground">
            {entries.length} føringer · prikk = jobbet
          </p>
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
              onDayClick={setPeekDay}
            />
          ))}
        </div>
      </div>

      <SheetStickyFooter>
        <button
          type="button"
          disabled={!periodOk || busy || entries.length === 0}
          onClick={onConfirm}
          className="tap-target cta-brand w-full bg-primary text-primary-foreground h-12 disabled:opacity-50"
        >
          {busy ? "Eksporterer…" : confirmLabel}
        </button>
      </SheetStickyFooter>

      {peekDay ? (
        <button
          type="button"
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 px-4 pb-10 sm:items-center"
          onClick={() => setPeekDay(null)}
          aria-label="Lukk referat"
        >
          <div
            className="w-full max-w-sm rounded-md border border-border bg-card p-4 text-left shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs text-muted-foreground">
              {new Date(peekDay + "T12:00:00").toLocaleDateString("nb-NO", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
            <div className="mt-3 space-y-3">
              {peekEntries.map((e) => (
                <div key={e.id} className="rounded-md border border-border/60 px-3 py-2">
                  <p className="font-medium tabular-nums">
                    {fmtClock(e.started_at, e.start_time)} – {fmtClock(e.ended_at, e.end_time)}
                    <span className="ml-2 text-sm text-muted-foreground">
                      {formatDuration(entryMinutes(e))}
                    </span>
                  </p>
                  {e.task ? <p className="mt-0.5 text-sm">{e.task}</p> : null}
                  {e.comment ? (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{e.comment}</p>
                  ) : null}
                </div>
              ))}
            </div>
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              Trykk utenfor for å lukke
            </p>
          </div>
        </button>
      ) : null}
    </ContentSheet>
  );
}
