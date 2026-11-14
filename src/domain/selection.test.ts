import { describe, expect, it } from "vitest";
import { MAX_BORROW_DAYS } from "./borrow";
import { addDays } from "./dates";
import { pickDay } from "./selection";

const NONE = new Set<string>();

describe("pickDay", () => {
  it("starts with a single day", () => {
    expect(pickDay(null, "2026-11-20", NONE)).toEqual({
      selection: { startDate: "2026-11-20", endDate: null },
      problem: null,
    });
  });

  it("completes the range on a later day, or the same day", () => {
    const started = { startDate: "2026-11-20", endDate: null };
    expect(pickDay(started, "2026-11-23", NONE).selection).toEqual({
      startDate: "2026-11-20",
      endDate: "2026-11-23",
    });
    expect(pickDay(started, "2026-11-20", NONE).selection).toEqual({
      startDate: "2026-11-20",
      endDate: "2026-11-20",
    });
  });

  it("starts over on an earlier day or after a finished range", () => {
    const started = { startDate: "2026-11-20", endDate: null };
    expect(pickDay(started, "2026-11-18", NONE).selection).toEqual({
      startDate: "2026-11-18",
      endDate: null,
    });
    const finished = { startDate: "2026-11-20", endDate: "2026-11-22" };
    expect(pickDay(finished, "2026-11-25", NONE).selection).toEqual({
      startDate: "2026-11-25",
      endDate: null,
    });
  });

  it("refuses a range that crosses a booked day", () => {
    const started = { startDate: "2026-11-20", endDate: null };
    const result = pickDay(started, "2026-11-24", new Set(["2026-11-22"]));
    expect(result).toEqual({
      selection: { startDate: "2026-11-24", endDate: null },
      problem: "CROSSES_BOOKED",
    });
  });

  it("refuses a range longer than the limit", () => {
    const started = { startDate: "2026-11-20", endDate: null };
    const lastAllowed = addDays("2026-11-20", MAX_BORROW_DAYS - 1);
    expect(pickDay(started, lastAllowed, NONE).problem).toBeNull();
    expect(pickDay(started, addDays(lastAllowed, 1), NONE).problem).toBe("TOO_LONG");
  });
});
