export function normalizeClock(value: unknown): string | null;

export function clockInputValue(value: unknown): string;

export function inheritShiftWindow(
  day: {
    start_time?: string | null;
    end_time?: string | null;
    break_minutes?: number | null;
  },
  assignment?: {
    start_time?: string | null;
    end_time?: string | null;
    break_minutes?: number | null;
  },
): {
  start_time: string | null;
  end_time: string | null;
  break_minutes: number;
};
