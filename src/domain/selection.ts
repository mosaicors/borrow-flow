import { MAX_BORROW_DAYS } from "./borrow";
import { type IsoDay, daysInRange, rangeLength } from "./dates";

/** What the neighbour has picked in the calendar so far. One click gives a single day. */
export type Selection = { startDate: IsoDay; endDate: IsoDay | null } | null;

export type PickProblem = "CROSSES_BOOKED" | "TOO_LONG";

/**
 * Applies a click on a calendar day. The first click starts a selection, the
 * second one on a later day completes the range. A click that cannot complete
 * a valid range starts over from the clicked day and says why.
 */
export function pickDay(
  current: Selection,
  day: IsoDay,
  bookedDays: ReadonlySet<IsoDay>,
): { selection: Selection; problem: PickProblem | null } {
  const startOver = { startDate: day, endDate: null };

  if (!current || current.endDate !== null || day < current.startDate) {
    return { selection: startOver, problem: null };
  }

  const range = { startDate: current.startDate, endDate: day };
  if (rangeLength(range) > MAX_BORROW_DAYS) return { selection: startOver, problem: "TOO_LONG" };
  if (daysInRange(range).some((inside) => bookedDays.has(inside))) {
    return { selection: startOver, problem: "CROSSES_BOOKED" };
  }
  return { selection: range, problem: null };
}
