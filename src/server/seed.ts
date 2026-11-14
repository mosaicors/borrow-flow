import { randomUUID } from "node:crypto";
import { addDays, daysInRange, todayIso } from "@/domain/dates";
import { DEMO_ITEM_ID } from "@/shared";
import { type BorrowRequestDoc, type Collections, bookedDayId } from "./db";

export const SEED_USERS = [
  { _id: "user-maya", name: "Maya R.", street: "12 Alder Street" },
  { _id: "user-tom", name: "Tom B.", street: "15 Alder Street" },
  { _id: "user-priya", name: "Priya S.", street: "3 Birch Lane" },
];

export const SEED_OWNER_ID = "user-maya";

/**
 * Fills an empty database with a few neighbours, one item, one accepted borrow
 * and one pending request, so there is something to look at and to answer.
 * Does nothing when users already exist.
 */
export async function seedIfEmpty(collections: Collections, now: Date = new Date()): Promise<boolean> {
  if ((await collections.users.estimatedDocumentCount()) > 0) return false;

  const today = todayIso(now);
  await collections.users.insertMany(SEED_USERS);
  await collections.items.insertOne({
    _id: DEMO_ITEM_ID,
    ownerId: SEED_OWNER_ID,
    title: "Cordless drill with bit set",
    category: "Tools",
    description:
      "18V drill with two batteries, a charger and a 40-piece bit set in a carry case. " +
      "Fine for shelves, flat-pack furniture and light masonry. Pick up from my porch.",
  });

  const accepted: BorrowRequestDoc = {
    _id: randomUUID(),
    itemId: DEMO_ITEM_ID,
    requesterId: "user-priya",
    startDate: addDays(today, 3),
    endDate: addDays(today, 5),
    message: "Putting up curtain rails this week.",
    status: "accepted",
    autoDeclined: false,
    createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
    decidedAt: new Date(now.getTime() - 60 * 60 * 1000),
  };
  const pending: BorrowRequestDoc = {
    _id: randomUUID(),
    itemId: DEMO_ITEM_ID,
    requesterId: "user-tom",
    startDate: addDays(today, 9),
    endDate: addDays(today, 10),
    message: "Need it to fix a garden gate.",
    status: "pending",
    autoDeclined: false,
    createdAt: new Date(now.getTime() - 20 * 60 * 1000),
    decidedAt: null,
  };

  await collections.requests.insertMany([accepted, pending]);
  await collections.bookedDays.insertMany(
    daysInRange(accepted).map((day) => ({
      _id: bookedDayId(DEMO_ITEM_ID, day),
      itemId: DEMO_ITEM_ID,
      day,
      requestId: accepted._id,
    })),
  );
  return true;
}
