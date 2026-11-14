import { describe, expect, it } from "vitest";
import {
  BorrowRuleError,
  MAX_BORROW_DAYS,
  type RuleCode,
  assertCanDecide,
  assertCanRequest,
  assertValidRange,
  pendingRequestsToAutoDecline,
} from "./borrow";
import { addDays } from "./dates";

const TODAY = "2026-11-14";

function ruleCode(run: () => void): RuleCode | "OK" {
  try {
    run();
    return "OK";
  } catch (error) {
    if (error instanceof BorrowRuleError) return error.code;
    throw error;
  }
}

describe("assertValidRange", () => {
  it("accepts a period that starts today", () => {
    expect(ruleCode(() => assertValidRange({ startDate: TODAY, endDate: TODAY }, TODAY))).toBe("OK");
  });

  it("rejects an end before the start and malformed days", () => {
    expect(
      ruleCode(() => assertValidRange({ startDate: "2026-11-20", endDate: "2026-11-18" }, TODAY)),
    ).toBe("INVALID_RANGE");
    expect(
      ruleCode(() => assertValidRange({ startDate: "tomorrow", endDate: "2026-11-18" }, TODAY)),
    ).toBe("INVALID_RANGE");
  });

  it("rejects a period that starts in the past", () => {
    expect(
      ruleCode(() => assertValidRange({ startDate: "2026-11-13", endDate: "2026-11-15" }, TODAY)),
    ).toBe("IN_THE_PAST");
  });

  it("allows the maximum length and rejects one day more", () => {
    const start = "2026-12-01";
    const longest = { startDate: start, endDate: addDays(start, MAX_BORROW_DAYS - 1) };
    const tooLong = { startDate: start, endDate: addDays(start, MAX_BORROW_DAYS) };
    expect(ruleCode(() => assertValidRange(longest, TODAY))).toBe("OK");
    expect(ruleCode(() => assertValidRange(tooLong, TODAY))).toBe("TOO_LONG");
  });
});

describe("assertCanRequest", () => {
  const base = {
    itemOwnerId: "owner",
    requesterId: "neighbour",
    range: { startDate: "2026-11-20", endDate: "2026-11-22" },
    today: TODAY,
    acceptedRanges: [],
    ownPendingRanges: [],
  };

  it("lets a neighbour request free days", () => {
    expect(ruleCode(() => assertCanRequest(base))).toBe("OK");
  });

  it("stops the owner from requesting their own item", () => {
    expect(ruleCode(() => assertCanRequest({ ...base, requesterId: "owner" }))).toBe("OWN_ITEM");
  });

  it("rejects days that overlap an accepted borrow", () => {
    const acceptedRanges = [{ startDate: "2026-11-22", endDate: "2026-11-25" }];
    expect(ruleCode(() => assertCanRequest({ ...base, acceptedRanges }))).toBe("DATES_TAKEN");
  });

  it("allows days right after an accepted borrow", () => {
    const acceptedRanges = [{ startDate: "2026-11-17", endDate: "2026-11-19" }];
    expect(ruleCode(() => assertCanRequest({ ...base, acceptedRanges }))).toBe("OK");
  });

  it("rejects a second pending request by the same person for the same days", () => {
    const ownPendingRanges = [{ startDate: "2026-11-21", endDate: "2026-11-21" }];
    expect(ruleCode(() => assertCanRequest({ ...base, ownPendingRanges }))).toBe(
      "ALREADY_REQUESTED",
    );
  });
});

describe("assertCanDecide", () => {
  it("lets the owner answer a pending request", () => {
    expect(
      ruleCode(() =>
        assertCanDecide({ itemOwnerId: "owner", actorId: "owner", currentStatus: "pending" }),
      ),
    ).toBe("OK");
  });

  it("stops anyone else from answering", () => {
    expect(
      ruleCode(() =>
        assertCanDecide({ itemOwnerId: "owner", actorId: "neighbour", currentStatus: "pending" }),
      ),
    ).toBe("NOT_OWNER");
  });

  it("stops a request from being answered twice", () => {
    for (const currentStatus of ["accepted", "declined"] as const) {
      expect(
        ruleCode(() => assertCanDecide({ itemOwnerId: "owner", actorId: "owner", currentStatus })),
      ).toBe("NOT_PENDING");
    }
  });
});

describe("pendingRequestsToAutoDecline", () => {
  it("picks only the other pending requests that overlap the accepted one", () => {
    const accepted = { id: "a", startDate: "2026-11-20", endDate: "2026-11-22" };
    const pending = [
      accepted,
      { id: "b", startDate: "2026-11-22", endDate: "2026-11-24" },
      { id: "c", startDate: "2026-11-23", endDate: "2026-11-24" },
      { id: "d", startDate: "2026-11-18", endDate: "2026-11-20" },
    ];
    expect(pendingRequestsToAutoDecline(accepted, pending).map((r) => r.id)).toEqual(["b", "d"]);
  });
});
