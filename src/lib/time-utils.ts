import type { TimeEntry } from "./work-core";

export function startOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function startOfWeek(d = new Date()): Date {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7; // monday=0
  x.setDate(x.getDate() - day);
  return x;
}

export function endOfWeek(d = new Date()): Date {
  const x = startOfWeek(d);
  x.setDate(x.getDate() + 7);
  return x;
}

export function startOfMonth(d = new Date()): Date {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

export function endOfMonth(d = new Date()): Date {
  const x = startOfMonth(d);
  x.setMonth(x.getMonth() + 1);
  return x;
}

export function previousWeek(d = new Date()): { from: Date; to: Date } {
  const from = startOfWeek(d);
  from.setDate(from.getDate() - 7);
  const to = new Date(from);
  to.setDate(to.getDate() + 7);
  return { from, to };
}

export function previousMonth(d = new Date()): { from: Date; to: Date } {
  const from = startOfMonth(d);
  from.setMonth(from.getMonth() - 1);
  const to = startOfMonth(d);
  return { from, to };
}

export function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function toTimeInput(value: string | null | undefined, fallbackIso?: string | null): string {
  if (value && value.length >= 5) return value.slice(0, 5);
  if (fallbackIso) {
    return new Date(fallbackIso).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  return "09:00";
}

export function entryFormDefaults(entry: TimeEntry | null | undefined, defaultOrgId?: string) {
  if (!entry) {
    return {
      orgId: defaultOrgId ?? "",
      date: toDateInput(new Date()),
      start: "09:00",
      end: "17:00",
      breakMin: 0,
      projectId: null as string | null,
      rateId: null as string | null,
      comment: "",
    };
  }
  return {
    orgId: entry.organization_id,
    date:
      entry.date ??
      (entry.started_at ? toDateInput(new Date(entry.started_at)) : toDateInput(new Date())),
    start: toTimeInput(entry.start_time, entry.started_at),
    end: toTimeInput(entry.end_time, entry.ended_at),
    breakMin: entry.break_minutes ?? 0,
    projectId: entry.project_id ?? null,
    rateId: entry.rate_id ?? null,
    comment: entry.comment ?? "",
  };
}
