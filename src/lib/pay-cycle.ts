import { toDateInput } from "@/lib/time-utils";

const STORAGE_KEY = "work.payCycleAnchorDay";

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function clampAnchorDay(day: number): number {
  return Math.min(28, Math.max(1, Math.round(day)));
}

export function getPayCycleAnchorDay(orgId: string, fallback = 5): number {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}.${orgId}`);
    if (!raw) return fallback;
    return clampAnchorDay(Number(raw));
  } catch {
    return fallback;
  }
}

export function setPayCycleAnchorDay(orgId: string, day: number): void {
  try {
    localStorage.setItem(`${STORAGE_KEY}.${orgId}`, String(clampAnchorDay(day)));
  } catch {
    /* ignore */
  }
}

/** Anchor date in a given month (clamped to month length). */
function anchorInMonth(year: number, monthIndex: number, anchorDay: number): Date {
  const d = new Date(year, monthIndex, 1);
  d.setHours(0, 0, 0, 0);
  d.setDate(Math.min(clampAnchorDay(anchorDay), daysInMonth(year, monthIndex)));
  return d;
}

/**
 * Pay cycle containing `ref`: from anchorDay (inclusive) to day before next anchor (inclusive).
 * Example anchor 5: 5 Mar → 4 Apr.
 */
export function payCycleContaining(ref = new Date(), anchorDay = 5): { from: Date; to: Date } {
  const day = clampAnchorDay(anchorDay);
  const r = new Date(ref);
  r.setHours(0, 0, 0, 0);

  let start = anchorInMonth(r.getFullYear(), r.getMonth(), day);
  if (r < start) {
    const prev = new Date(r.getFullYear(), r.getMonth() - 1, 1);
    start = anchorInMonth(prev.getFullYear(), prev.getMonth(), day);
  }

  const nextMonth = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  const nextStart = anchorInMonth(nextMonth.getFullYear(), nextMonth.getMonth(), day);
  const to = new Date(nextStart);
  to.setDate(to.getDate() - 1);
  to.setHours(23, 59, 59, 999);

  return { from: start, to };
}

export function previousPayCycle(ref = new Date(), anchorDay = 5): { from: Date; to: Date } {
  const current = payCycleContaining(ref, anchorDay);
  const before = new Date(current.from);
  before.setDate(before.getDate() - 1);
  return payCycleContaining(before, anchorDay);
}

export function formatPeriodLabel(from: Date, to: Date): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${from.toLocaleDateString("nb-NO", opts)} – ${to.toLocaleDateString("nb-NO", opts)}`;
}

export function periodToInputs(from: Date, to: Date): { from: string; to: string } {
  return { from: toDateInput(from), to: toDateInput(to) };
}
