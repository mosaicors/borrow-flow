/**
 * Calendar days are plain `YYYY-MM-DD` strings everywhere (database, API, UI).
 * A borrow period is about whole days, not instants, so keeping days as strings
 * avoids time zone drift and makes ranges comparable with `<` and `>`.
 */
export type IsoDay = string;

export type DayRange = {
  /** First day of the borrow, inclusive. */
  startDate: IsoDay;
  /** Last day of the borrow, inclusive. */
  endDate: IsoDay;
};

const ISO_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function isIsoDay(value: string): value is IsoDay {
  if (!ISO_DAY_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  // Rejects impossible dates such as 2026-02-31, which Date would roll over.
  return !Number.isNaN(date.getTime()) && toIsoDay(date) === value;
}

export function toIsoDay(date: Date): IsoDay {
  return date.toISOString().slice(0, 10);
}

function toUtcMs(day: IsoDay): number {
  return Date.parse(`${day}T00:00:00Z`);
}

export function addDays(day: IsoDay, amount: number): IsoDay {
  return toIsoDay(new Date(toUtcMs(day) + amount * MS_PER_DAY));
}

/** Number of days in the range, counting both ends. */
export function rangeLength(range: DayRange): number {
  return Math.round((toUtcMs(range.endDate) - toUtcMs(range.startDate)) / MS_PER_DAY) + 1;
}

/** Every day in the range, both ends included. */
export function daysInRange(range: DayRange): IsoDay[] {
  const days: IsoDay[] = [];
  for (let day = range.startDate; day <= range.endDate; day = addDays(day, 1)) {
    days.push(day);
  }
  return days;
}

export function rangesOverlap(a: DayRange, b: DayRange): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

/** "Today" is the current UTC day on both server and client, so they always agree. */
export function todayIso(now: Date = new Date()): IsoDay {
  return toIsoDay(now);
}
