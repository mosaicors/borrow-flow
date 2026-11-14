import { TRPCError } from "@trpc/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addDays, todayIso } from "@/domain/dates";
import { DEMO_ITEM_ID } from "@/shared";
import { type Database, connectDatabase } from "./db";
import { type BorrowEvent, BorrowEvents } from "./events";
import { appRouter } from "./routers/app";
import { SEED_OWNER_ID, seedIfEmpty } from "./seed";
import { type Context, createCallerFactory } from "./trpc";

/**
 * End-to-end tests of the API against a real (in-memory) MongoDB: the same
 * router, rules and indexes as the running app, without the network layer.
 */
const NOW = new Date("2026-11-14T10:00:00Z");
const TODAY = todayIso(NOW);
const OWNER = SEED_OWNER_ID;
const TOM = "user-tom";
const PRIYA = "user-priya";

const createCaller = createCallerFactory(appRouter);

let database: Database;
let events: BorrowEvents;

function as(userId: string | null, signal?: AbortSignal) {
  const ctx: Context = { collections: database.collections, events, now: () => NOW, userId };
  return createCaller(ctx, { signal });
}

/** Free days well after the seeded requests, so tests do not collide with them. */
function days(fromOffset: number, toOffset: number) {
  return { startDate: addDays(TODAY, fromOffset), endDate: addDays(TODAY, toOffset) };
}

async function errorCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "OK";
  } catch (error) {
    if (error instanceof TRPCError) return error.code;
    throw error;
  }
}

beforeAll(async () => {
  database = await connectDatabase("");
});

afterAll(async () => {
  await database.close();
});

beforeEach(async () => {
  const { users, items, requests, bookedDays } = database.collections;
  await Promise.all([
    users.deleteMany({}),
    items.deleteMany({}),
    requests.deleteMany({}),
    bookedDays.deleteMany({}),
  ]);
  await seedIfEmpty(database.collections, NOW);
  events = new BorrowEvents();
});

describe("sending a borrow request", () => {
  it("stores it as pending and shows it to the requester and the owner", async () => {
    const created = await as(TOM).requests.create({
      itemId: DEMO_ITEM_ID,
      ...days(20, 22),
      message: "  For a weekend project.  ",
    });

    expect(created).toMatchObject({
      status: "pending",
      requesterName: "Tom B.",
      message: "For a weekend project.",
      ...days(20, 22),
    });

    const mine = await as(TOM).requests.mine({ itemId: DEMO_ITEM_ID });
    expect(mine.map((request) => request.id)).toContain(created.id);

    const incoming = await as(OWNER).requests.incoming({ itemId: DEMO_ITEM_ID });
    expect(incoming.map((request) => request.id)).toContain(created.id);
  });

  it("rejects days that are already promised to someone", async () => {
    // The seed has an accepted borrow on days +3 to +5.
    const code = await errorCode(as(TOM).requests.create({ itemId: DEMO_ITEM_ID, ...days(5, 6) }));
    expect(code).toBe("CONFLICT");
  });

  it("rejects the owner, past days, malformed days and unknown callers", async () => {
    const create = (userId: string | null, range: { startDate: string; endDate: string }) =>
      errorCode(as(userId).requests.create({ itemId: DEMO_ITEM_ID, ...range }));

    expect(await create(OWNER, days(20, 21))).toBe("BAD_REQUEST");
    expect(await create(TOM, days(-2, 1))).toBe("BAD_REQUEST");
    expect(await create(TOM, { startDate: "2026-02-31", endDate: "2026-03-01" })).toBe(
      "BAD_REQUEST",
    );
    expect(await create(null, days(20, 21))).toBe("UNAUTHORIZED");
    expect(await create("user-nobody", days(20, 21))).toBe("UNAUTHORIZED");
  });

  it("hides the list of all requests from people who are not the owner", async () => {
    expect(await errorCode(as(TOM).requests.incoming({ itemId: DEMO_ITEM_ID }))).toBe("FORBIDDEN");
  });
});

describe("answering a borrow request", () => {
  it("lets the owner accept, which books the days", async () => {
    const request = await as(TOM).requests.create({ itemId: DEMO_ITEM_ID, ...days(20, 22) });
    const decided = await as(OWNER).requests.decide({ requestId: request.id, decision: "accepted" });

    expect(decided.status).toBe("accepted");
    expect(decided.decidedAt).toBe(NOW.toISOString());

    const booked = await as(PRIYA).item.bookedDays({ itemId: DEMO_ITEM_ID });
    expect(booked).toEqual(expect.arrayContaining([addDays(TODAY, 20), addDays(TODAY, 22)]));
  });

  it("lets the owner decline, which leaves the days free", async () => {
    const request = await as(TOM).requests.create({ itemId: DEMO_ITEM_ID, ...days(20, 22) });
    const decided = await as(OWNER).requests.decide({ requestId: request.id, decision: "declined" });

    expect(decided).toMatchObject({ status: "declined", autoDeclined: false });
    const booked = await as(TOM).item.bookedDays({ itemId: DEMO_ITEM_ID });
    expect(booked).not.toContain(addDays(TODAY, 20));
  });

  it("stops anyone but the owner from answering, and stops a second answer", async () => {
    const request = await as(TOM).requests.create({ itemId: DEMO_ITEM_ID, ...days(20, 22) });
    const decide = (userId: string) =>
      errorCode(as(userId).requests.decide({ requestId: request.id, decision: "accepted" }));

    expect(await decide(TOM)).toBe("FORBIDDEN");
    expect(await decide(PRIYA)).toBe("FORBIDDEN");
    expect(await decide(OWNER)).toBe("OK");
    expect(await decide(OWNER)).toBe("CONFLICT");
  });

  it("declines other pending requests for the same days when one is accepted", async () => {
    const winner = await as(TOM).requests.create({ itemId: DEMO_ITEM_ID, ...days(20, 22) });
    const overlapping = await as(PRIYA).requests.create({ itemId: DEMO_ITEM_ID, ...days(22, 24) });
    const separate = await as(PRIYA).requests.create({ itemId: DEMO_ITEM_ID, ...days(30, 31) });

    await as(OWNER).requests.decide({ requestId: winner.id, decision: "accepted" });

    const priyas = await as(PRIYA).requests.mine({ itemId: DEMO_ITEM_ID });
    const byId = new Map(priyas.map((request) => [request.id, request]));
    expect(byId.get(overlapping.id)).toMatchObject({ status: "declined", autoDeclined: true });
    expect(byId.get(separate.id)).toMatchObject({ status: "pending" });
  });

  it("never double-books when two overlapping requests are accepted at the same moment", async () => {
    const first = await as(TOM).requests.create({ itemId: DEMO_ITEM_ID, ...days(20, 23) });
    const second = await as(PRIYA).requests.create({ itemId: DEMO_ITEM_ID, ...days(22, 25) });

    const results = await Promise.allSettled([
      as(OWNER).requests.decide({ requestId: first.id, decision: "accepted" }),
      as(OWNER).requests.decide({ requestId: second.id, decision: "accepted" }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);

    const all = await as(OWNER).requests.incoming({ itemId: DEMO_ITEM_ID });
    const accepted = all.filter(
      (request) => request.id === first.id || request.id === second.id,
    );
    expect(accepted.map((request) => request.status).sort()).toEqual(["accepted", "declined"]);

    // Every booked day belongs to exactly one request.
    const booked = await database.collections.bookedDays.find({ itemId: DEMO_ITEM_ID }).toArray();
    expect(new Set(booked.map((day) => day.day)).size).toBe(booked.length);
  });
});

describe("live updates", () => {
  /** Collects what a user's open subscription receives until `stop` is called. */
  function listen(userId: string) {
    const controller = new AbortController();
    const received: unknown[] = [];
    const done = (async () => {
      const feed = await as(userId, controller.signal).requests.onChange({
        itemId: DEMO_ITEM_ID,
      });
      for await (const update of feed) received.push(update);
    })();
    return {
      received,
      stop: async () => {
        controller.abort();
        await done;
      },
    };
  }

  /** Lets queued microtasks and event deliveries run. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

  it("tells the requester about the answer and the owner about new requests", async () => {
    const owner = listen(OWNER);
    const tom = listen(TOM);
    const priya = listen(PRIYA);
    await settle();

    const request = await as(TOM).requests.create({ itemId: DEMO_ITEM_ID, ...days(20, 22) });
    await as(OWNER).requests.decide({ requestId: request.id, decision: "accepted" });
    await settle();
    await Promise.all([owner.stop(), tom.stop(), priya.stop()]);

    const changes = (received: unknown[]) =>
      received.map((update) => {
        const typed = update as { type: string; change?: BorrowEvent["change"] };
        return typed.type === "request" ? typed.change : typed.type;
      });

    expect(changes(owner.received)).toEqual(["created", "accepted"]);
    expect(changes(tom.received)).toEqual(["created", "accepted"]);
    // Priya is not part of the request: she only learns the calendar changed.
    expect(priya.received).toEqual([{ type: "availability" }]);
  });
});
