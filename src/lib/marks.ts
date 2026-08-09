import { toDateInput, toTimeInput } from "@/lib/time-utils";
import type { TimeEntryMark } from "@/lib/work-core";

/** Round to nearest `step` minutes (default 5) so marks land on clean clock times. */
export function roundToNearestMinutes(d: Date, step = 5): Date {
  const x = new Date(d);
  x.setSeconds(0, 0);
  const mins = x.getMinutes();
  const rounded = Math.round(mins / step) * step;
  if (rounded === 60) {
    x.setHours(x.getHours() + 1);
    x.setMinutes(0);
  } else {
    x.setMinutes(rounded);
  }
  return x;
}

export function markFormDefaults(mark?: TimeEntryMark | null, now = new Date()) {
  const at = mark ? new Date(mark.marked_at) : roundToNearestMinutes(now);
  return {
    date: toDateInput(at),
    time: toTimeInput(null, at.toISOString()),
    note: mark?.note ?? "",
  };
}

/** Local date + HH:MM → ISO timestamptz */
export function localDateTimeToIso(date: string, time: string): string {
  const t = time.length === 5 ? `${time}:00` : time;
  return new Date(`${date}T${t}`).toISOString();
}

export function formatMarkTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("nb-NO", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Multiline log for timer cards / export comment cells */
export function formatMarksTimeline(marks: TimeEntryMark[]): string {
  return marks
    .slice()
    .sort((a, b) => a.marked_at.localeCompare(b.marked_at))
    .map((m) => `${formatMarkTime(m.marked_at)}  ${m.note.trim()}`)
    .join("\n");
}

export function combineCommentAndMarks(
  comment: string | null | undefined,
  marks: TimeEntryMark[],
): string {
  const timeline = formatMarksTimeline(marks);
  const c = (comment ?? "").trim();
  if (c && timeline) return `${c}\n\n${timeline}`;
  return c || timeline;
}
