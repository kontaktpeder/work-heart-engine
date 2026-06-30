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
  return d.toISOString().slice(0, 10);
}
