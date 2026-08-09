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

export function markFormDefaults(
  mark?: TimeEntryMark | null,
  now = new Date(),
  kind: "note" | "pause" = "note",
) {
  const at = mark ? new Date(mark.marked_at) : roundToNearestMinutes(now);
  return {
    date: toDateInput(at),
    time: toTimeInput(null, at.toISOString()),
    note: mark?.note ?? "",
    kind: (mark?.kind ?? kind) as "note" | "pause",
    pauseMinutes: mark?.pause_minutes ?? 30,
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

export function formatMarkLabel(m: TimeEntryMark): string {
  if (m.kind === "pause") {
    return `Pause ${m.pause_minutes ?? 0} min`;
  }
  return m.note.trim();
}

/** Multiline log for timer cards / export Notater (notes only, not pauses) */
export function formatMarksTimeline(marks: TimeEntryMark[]): string {
  return marks
    .slice()
    .sort((a, b) => a.marked_at.localeCompare(b.marked_at))
    .map((m) => {
      const time = formatMarkTime(m.marked_at);
      if (m.kind === "pause") return `${time}  Pause ${m.pause_minutes ?? 0} min`;
      return `${time}  ${m.note.trim()}`;
    })
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

export function reportNotes(
  comment: string | null | undefined,
  marks: TimeEntryMark[],
): string {
  const noteMarks = marks.filter((m) => m.kind === "note");
  const timeline = formatMarksTimeline(noteMarks);
  const parts = [comment?.trim(), timeline].filter(Boolean);
  return parts.join("\n\n");
}
