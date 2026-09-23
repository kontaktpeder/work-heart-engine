/** Clock and break helpers shared by the schedule API and tests. */

export function normalizeClock(value) {
  const t = String(value ?? "").trim();
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(t);
  if (!match) return null;
  return `${match[1]}:${match[2]}:${match[3] ?? "00"}`;
}

export function clockInputValue(value) {
  const normalized = normalizeClock(value);
  return normalized ? normalized.slice(0, 5) : "";
}

/**
 * Each assignment keeps its own window. Missing fields inherit the production day.
 */
export function inheritShiftWindow(day, assignment = {}) {
  const start = normalizeClock(assignment.start_time) ?? normalizeClock(day.start_time);
  const end = normalizeClock(assignment.end_time) ?? normalizeClock(day.end_time);
  const rawBreak = assignment.break_minutes ?? day.break_minutes ?? 0;
  const breakMinutes = Number.isFinite(Number(rawBreak)) ? Math.trunc(Number(rawBreak)) : 0;
  return {
    start_time: start,
    end_time: end,
    break_minutes: breakMinutes,
  };
}
