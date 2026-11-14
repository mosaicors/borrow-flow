import { type DayRange, type IsoDay, isIsoDay, rangeLength, rangesOverlap } from "./dates";

export const REQUEST_STATUSES = ["pending", "accepted", "declined"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const DECISIONS = ["accepted", "declined"] as const;
export type Decision = (typeof DECISIONS)[number];

/** Longest period a neighbour can ask for in one request. */
export const MAX_BORROW_DAYS = 14;

export type RuleCode =
  | "INVALID_RANGE"
  | "IN_THE_PAST"
  | "TOO_LONG"
  | "OWN_ITEM"
  | "DATES_TAKEN"
  | "ALREADY_REQUESTED"
  | "NOT_OWNER"
  | "NOT_PENDING";

const RULE_MESSAGES: Record<RuleCode, string> = {
  INVALID_RANGE: "Pick a start day and an end day, with the end on or after the start.",
  IN_THE_PAST: "The borrow period cannot start in the past.",
  TOO_LONG: `You can borrow this for up to ${MAX_BORROW_DAYS} days at a time.`,
  OWN_ITEM: "This is your own item, so there is nothing to request.",
  DATES_TAKEN: "Someone else already has this item on one of those days.",
  ALREADY_REQUESTED: "You already have a pending request that covers some of those days.",
  NOT_OWNER: "Only the owner of the item can answer this request.",
  NOT_PENDING: "This request has already been answered.",
};

/** A broken business rule. The API layer maps the code to an HTTP-style error. */
export class BorrowRuleError extends Error {
  readonly code: RuleCode;

  constructor(code: RuleCode) {
    super(RULE_MESSAGES[code]);
    this.name = "BorrowRuleError";
    this.code = code;
  }
}

export function assertValidRange(range: DayRange, today: IsoDay): void {
  if (!isIsoDay(range.startDate) || !isIsoDay(range.endDate) || range.endDate < range.startDate) {
    throw new BorrowRuleError("INVALID_RANGE");
  }
  if (range.startDate < today) throw new BorrowRuleError("IN_THE_PAST");
  if (rangeLength(range) > MAX_BORROW_DAYS) throw new BorrowRuleError("TOO_LONG");
}

type RequestCheck = {
  itemOwnerId: string;
  requesterId: string;
  range: DayRange;
  today: IsoDay;
  /** Periods already promised to someone (accepted requests). */
  acceptedRanges: DayRange[];
  /** The requester's own requests that are still waiting for an answer. */
  ownPendingRanges: DayRange[];
};

/** Checks everything that must hold before a new borrow request is stored. */
export function assertCanRequest(check: RequestCheck): void {
  if (check.requesterId === check.itemOwnerId) throw new BorrowRuleError("OWN_ITEM");
  assertValidRange(check.range, check.today);
  if (check.acceptedRanges.some((taken) => rangesOverlap(taken, check.range))) {
    throw new BorrowRuleError("DATES_TAKEN");
  }
  if (check.ownPendingRanges.some((own) => rangesOverlap(own, check.range))) {
    throw new BorrowRuleError("ALREADY_REQUESTED");
  }
}

type DecisionCheck = {
  itemOwnerId: string;
  actorId: string;
  currentStatus: RequestStatus;
};

/** Only the owner may answer, and only while the request is still pending. */
export function assertCanDecide(check: DecisionCheck): void {
  if (check.actorId !== check.itemOwnerId) throw new BorrowRuleError("NOT_OWNER");
  if (check.currentStatus !== "pending") throw new BorrowRuleError("NOT_PENDING");
}

/**
 * Once a request is accepted, other pending requests for the same days can no
 * longer be fulfilled. Returns the ones that should be declined automatically.
 */
export function pendingRequestsToAutoDecline<T extends DayRange & { id: string }>(
  accepted: DayRange & { id: string },
  pending: T[],
): T[] {
  return pending.filter((other) => other.id !== accepted.id && rangesOverlap(other, accepted));
}
