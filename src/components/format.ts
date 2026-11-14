import { type DayRange, type IsoDay, rangeLength } from "@/domain/dates";

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const monthFormat = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function asDate(day: IsoDay): Date {
  return new Date(`${day}T00:00:00Z`);
}

/** "Mon 16 Nov" */
export function formatDay(day: IsoDay): string {
  return dayFormat.format(asDate(day));
}

/** "November 2026" */
export function formatMonth(day: IsoDay): string {
  return monthFormat.format(asDate(day));
}

/** "Mon 16 Nov" or "Mon 16 Nov to Wed 18 Nov" */
export function formatRange(range: DayRange): string {
  if (range.startDate === range.endDate) return formatDay(range.startDate);
  return `${formatDay(range.startDate)} to ${formatDay(range.endDate)}`;
}

/** "1 day" or "3 days" */
export function formatLength(range: DayRange): string {
  const length = rangeLength(range);
  return length === 1 ? "1 day" : `${length} days`;
}

/** "14 Nov, 22:41" in the viewer's own time zone. */
export function formatTimestamp(iso: string): string {
  return timeFormat.format(new Date(iso));
}
