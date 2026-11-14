import { randomUUID } from "node:crypto";
import { MongoBulkWriteError } from "mongodb";
import {
  BorrowRuleError,
  type Decision,
  type RequestStatus,
  assertCanDecide,
  assertCanRequest,
  pendingRequestsToAutoDecline,
} from "@/domain/borrow";
import { type DayRange, type IsoDay, daysInRange, todayIso } from "@/domain/dates";
import { type BorrowRequestDoc, type Collections, type ItemDoc, bookedDayId } from "./db";
import type { BorrowEvents } from "./events";

const DUPLICATE_KEY = 11000;

/** A borrow request as the API returns it. */
export type BorrowRequestView = {
  id: string;
  itemId: string;
  requesterId: string;
  requesterName: string;
  startDate: IsoDay;
  endDate: IsoDay;
  message: string;
  status: RequestStatus;
  autoDeclined: boolean;
  createdAt: string;
  decidedAt: string | null;
};

export type ServiceDeps = {
  collections: Collections;
  events: BorrowEvents;
  now: () => Date;
};

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} was not found.`);
    this.name = "NotFoundError";
  }
}

async function requireItem(collections: Collections, itemId: string): Promise<ItemDoc> {
  const item = await collections.items.findOne({ _id: itemId });
  if (!item) throw new NotFoundError("The item");
  return item;
}

async function toViews(
  collections: Collections,
  docs: BorrowRequestDoc[],
): Promise<BorrowRequestView[]> {
  const requesterIds = [...new Set(docs.map((doc) => doc.requesterId))];
  const users = await collections.users.find({ _id: { $in: requesterIds } }).toArray();
  const names = new Map(users.map((user) => [user._id, user.name]));

  return docs.map((doc) => ({
    id: doc._id,
    itemId: doc.itemId,
    requesterId: doc.requesterId,
    requesterName: names.get(doc.requesterId) ?? "Unknown neighbour",
    startDate: doc.startDate,
    endDate: doc.endDate,
    message: doc.message,
    status: doc.status,
    autoDeclined: doc.autoDeclined,
    createdAt: doc.createdAt.toISOString(),
    decidedAt: doc.decidedAt ? doc.decidedAt.toISOString() : null,
  }));
}

async function toView(collections: Collections, doc: BorrowRequestDoc): Promise<BorrowRequestView> {
  const [view] = await toViews(collections, [doc]);
  return view;
}

/** Days that are already promised to someone, sorted. */
export async function getBookedDays(collections: Collections, itemId: string): Promise<IsoDay[]> {
  const docs = await collections.bookedDays.find({ itemId }).sort({ day: 1 }).toArray();
  return docs.map((doc) => doc.day);
}

/** Requests the given neighbour has sent for the item, newest first. */
export async function listRequestsByRequester(
  collections: Collections,
  itemId: string,
  requesterId: string,
): Promise<BorrowRequestView[]> {
  const docs = await collections.requests
    .find({ itemId, requesterId })
    .sort({ createdAt: -1 })
    .toArray();
  return toViews(collections, docs);
}

/** Every request for the item, newest first. Only the owner may see this list. */
export async function listRequestsForOwner(
  collections: Collections,
  itemId: string,
  actorId: string,
): Promise<BorrowRequestView[]> {
  const item = await requireItem(collections, itemId);
  if (item.ownerId !== actorId) throw new BorrowRuleError("NOT_OWNER");
  const docs = await collections.requests.find({ itemId }).sort({ createdAt: -1 }).toArray();
  return toViews(collections, docs);
}

export async function createRequest(
  deps: ServiceDeps,
  input: { itemId: string; requesterId: string; range: DayRange; message: string },
): Promise<BorrowRequestView> {
  const { collections, events, now } = deps;
  const item = await requireItem(collections, input.itemId);

  const open = await collections.requests
    .find({ itemId: item._id, status: { $in: ["pending", "accepted"] } })
    .toArray();

  assertCanRequest({
    itemOwnerId: item.ownerId,
    requesterId: input.requesterId,
    range: input.range,
    today: todayIso(now()),
    acceptedRanges: open.filter((doc) => doc.status === "accepted"),
    ownPendingRanges: open.filter(
      (doc) => doc.status === "pending" && doc.requesterId === input.requesterId,
    ),
  });

  const doc: BorrowRequestDoc = {
    _id: randomUUID(),
    itemId: item._id,
    requesterId: input.requesterId,
    startDate: input.range.startDate,
    endDate: input.range.endDate,
    message: input.message,
    status: "pending",
    autoDeclined: false,
    createdAt: now(),
    decidedAt: null,
  };
  await collections.requests.insertOne(doc);

  const view = await toView(collections, doc);
  events.publish({ change: "created", itemId: item._id, itemOwnerId: item.ownerId, request: view });
  return view;
}

/**
 * Reserves every day of the range for the request. The unique `_id` of a booked
 * day is what guarantees no double booking: if any day is already taken the
 * insert fails, the days reserved so far are released and DATES_TAKEN is thrown.
 */
async function reserveDays(collections: Collections, request: BorrowRequestDoc): Promise<void> {
  try {
    await collections.bookedDays.insertMany(
      daysInRange(request).map((day) => ({
        _id: bookedDayId(request.itemId, day),
        itemId: request.itemId,
        day,
        requestId: request._id,
      })),
    );
  } catch (error) {
    await releaseDays(collections, request._id);
    if (error instanceof MongoBulkWriteError && error.code === DUPLICATE_KEY) {
      throw new BorrowRuleError("DATES_TAKEN");
    }
    throw error;
  }
}

async function releaseDays(collections: Collections, requestId: string): Promise<void> {
  await collections.bookedDays.deleteMany({ requestId });
}

/**
 * Moves a request from pending to the given status. The filter on
 * `status: "pending"` makes the transition atomic: of two simultaneous answers
 * only one finds the document, and the other gets `null`.
 */
async function transition(
  deps: ServiceDeps,
  requestId: string,
  status: Decision,
  autoDeclined: boolean,
): Promise<BorrowRequestDoc | null> {
  return deps.collections.requests.findOneAndUpdate(
    { _id: requestId, status: "pending" },
    { $set: { status, autoDeclined, decidedAt: deps.now() } },
    { returnDocument: "after" },
  );
}

export async function decideRequest(
  deps: ServiceDeps,
  input: { requestId: string; actorId: string; decision: Decision },
): Promise<BorrowRequestView> {
  const { collections, events } = deps;
  const request = await collections.requests.findOne({ _id: input.requestId });
  if (!request) throw new NotFoundError("The request");
  const item = await requireItem(collections, request.itemId);

  assertCanDecide({
    itemOwnerId: item.ownerId,
    actorId: input.actorId,
    currentStatus: request.status,
  });

  if (input.decision === "accepted") await reserveDays(collections, request);

  const updated = await transition(deps, request._id, input.decision, false);
  if (!updated) {
    // Someone answered it between our read and our write.
    if (input.decision === "accepted") await releaseDays(collections, request._id);
    throw new BorrowRuleError("NOT_PENDING");
  }

  const view = await toView(collections, updated);
  events.publish({
    change: input.decision,
    itemId: item._id,
    itemOwnerId: item.ownerId,
    request: view,
  });

  if (input.decision === "accepted") await declineOverlappingPending(deps, item, updated);
  return view;
}

/** After an accept, pending requests for the same days can no longer be fulfilled. */
async function declineOverlappingPending(
  deps: ServiceDeps,
  item: ItemDoc,
  accepted: BorrowRequestDoc,
): Promise<void> {
  const { collections, events } = deps;
  const pending = await collections.requests.find({ itemId: item._id, status: "pending" }).toArray();
  const losers = pendingRequestsToAutoDecline(
    { id: accepted._id, startDate: accepted.startDate, endDate: accepted.endDate },
    pending.map((doc) => ({ id: doc._id, startDate: doc.startDate, endDate: doc.endDate })),
  );

  for (const loser of losers) {
    const declined = await transition(deps, loser.id, "declined", true);
    if (!declined) continue;
    events.publish({
      change: "declined",
      itemId: item._id,
      itemOwnerId: item.ownerId,
      request: await toView(collections, declined),
    });
  }
}
