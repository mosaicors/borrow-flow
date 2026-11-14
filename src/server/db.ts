import { type Collection, MongoClient } from "mongodb";
import type { RequestStatus } from "@/domain/borrow";
import type { IsoDay } from "@/domain/dates";

export type UserDoc = {
  _id: string;
  name: string;
  street: string;
};

export type ItemDoc = {
  _id: string;
  ownerId: string;
  title: string;
  category: string;
  description: string;
};

export type BorrowRequestDoc = {
  _id: string;
  itemId: string;
  requesterId: string;
  startDate: IsoDay;
  endDate: IsoDay;
  message: string;
  status: RequestStatus;
  /** True when the system declined it because the days went to someone else. */
  autoDeclined: boolean;
  createdAt: Date;
  decidedAt: Date | null;
};

/**
 * One document per item per promised day. The `_id` is `${itemId}:${day}`, so
 * MongoDB's unique `_id` index makes a double booking impossible to store,
 * even if two requests are accepted at the same moment.
 */
export type BookedDayDoc = {
  _id: string;
  itemId: string;
  day: IsoDay;
  requestId: string;
};

export type Collections = {
  users: Collection<UserDoc>;
  items: Collection<ItemDoc>;
  requests: Collection<BorrowRequestDoc>;
  bookedDays: Collection<BookedDayDoc>;
};

export type Database = {
  collections: Collections;
  /** Human-readable description of where the data lives, for the startup log. */
  description: string;
  close: () => Promise<void>;
};

export function bookedDayId(itemId: string, day: IsoDay): string {
  return `${itemId}:${day}`;
}

/**
 * Connects to `MONGODB_URI` when it is set. Without it, starts a throwaway
 * in-memory MongoDB so the project runs with a single command and no setup.
 */
export async function connectDatabase(uri = process.env.MONGODB_URI): Promise<Database> {
  let stopMemoryServer: (() => Promise<unknown>) | undefined;
  let description = uri ?? "";

  if (!uri) {
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    const memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri();
    stopMemoryServer = () => memoryServer.stop();
    description = "in-memory MongoDB (data resets on restart; set MONGODB_URI to persist)";
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB ?? "borrow_flow");

  const collections: Collections = {
    users: db.collection<UserDoc>("users"),
    items: db.collection<ItemDoc>("items"),
    requests: db.collection<BorrowRequestDoc>("requests"),
    bookedDays: db.collection<BookedDayDoc>("bookedDays"),
  };

  await Promise.all([
    collections.requests.createIndex({ itemId: 1, status: 1 }),
    collections.requests.createIndex({ itemId: 1, requesterId: 1 }),
    collections.bookedDays.createIndex({ itemId: 1, day: 1 }),
    collections.bookedDays.createIndex({ requestId: 1 }),
  ]);

  return {
    collections,
    description,
    close: async () => {
      await client.close();
      await stopMemoryServer?.();
    },
  };
}
