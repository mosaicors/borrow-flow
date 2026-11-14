import { describe, expect, it } from "vitest";
import { addDays, daysInRange, isIsoDay, rangeLength, rangesOverlap, todayIso } from "./dates";

describe("isIsoDay", () => {
  it("accepts real calendar days", () => {
    expect(isIsoDay("2026-11-14")).toBe(true);
    expect(isIsoDay("2028-02-29")).toBe(true);
  });

  it("rejects malformed and impossible days", () => {
    expect(isIsoDay("2026-2-3")).toBe(false);
    expect(isIsoDay("14.11.2026")).toBe(false);
    expect(isIsoDay("2026-02-31")).toBe(false);
    expect(isIsoDay("2027-02-29")).toBe(false);
  });
});

describe("day arithmetic", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("counts both ends of a range", () => {
    expect(rangeLength({ startDate: "2026-11-14", endDate: "2026-11-14" })).toBe(1);
    expect(rangeLength({ startDate: "2026-11-14", endDate: "2026-11-20" })).toBe(7);
  });

  it("lists every day in a range", () => {
    expect(daysInRange({ startDate: "2026-11-29", endDate: "2026-12-02" })).toEqual([
      "2026-11-29",
      "2026-11-30",
      "2026-12-01",
      "2026-12-02",
    ]);
  });

  it("uses the UTC day as today", () => {
    expect(todayIso(new Date("2026-11-14T23:30:00Z"))).toBe("2026-11-14");
  });
});

describe("rangesOverlap", () => {
  const base = { startDate: "2026-11-10", endDate: "2026-11-15" };

  it("is true when ranges share at least one day", () => {
    expect(rangesOverlap(base, { startDate: "2026-11-15", endDate: "2026-11-20" })).toBe(true);
    expect(rangesOverlap(base, { startDate: "2026-11-05", endDate: "2026-11-10" })).toBe(true);
    expect(rangesOverlap(base, { startDate: "2026-11-12", endDate: "2026-11-13" })).toBe(true);
    expect(rangesOverlap(base, { startDate: "2026-11-01", endDate: "2026-11-30" })).toBe(true);
  });

  it("is false for back-to-back ranges", () => {
    expect(rangesOverlap(base, { startDate: "2026-11-16", endDate: "2026-11-20" })).toBe(false);
    expect(rangesOverlap(base, { startDate: "2026-11-01", endDate: "2026-11-09" })).toBe(false);
  });
});
