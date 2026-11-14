import { z } from "zod";
import { DECISIONS } from "@/domain/borrow";
import { isIsoDay } from "@/domain/dates";
import {
  type BorrowRequestView,
  NotFoundError,
  createRequest,
  decideRequest,
  getBookedDays,
  listRequestsByRequester,
  listRequestsForOwner,
} from "../borrow-service";
import type { BorrowEvent } from "../events";
import { authedProcedure, publicProcedure, router } from "../trpc";

const isoDay = z.string().refine(isIsoDay, "Expected a calendar day as YYYY-MM-DD.");
const itemInput = z.object({ itemId: z.string().min(1) });

/** What a connected browser is told when something changes. */
export type LiveUpdate =
  | { type: "request"; change: BorrowEvent["change"]; request: BorrowRequestView }
  /** Sent to people who are not part of the request, so they only refresh the calendar. */
  | { type: "availability" };

export const appRouter = router({
  users: router({
    /** The seeded neighbours, for the "browsing as" switcher. */
    list: publicProcedure.query(async ({ ctx }) => {
      const users = await ctx.collections.users.find().sort({ name: 1 }).toArray();
      return users.map((user) => ({ id: user._id, name: user.name, street: user.street }));
    }),
  }),

  item: router({
    get: publicProcedure.input(itemInput).query(async ({ ctx, input }) => {
      const item = await ctx.collections.items.findOne({ _id: input.itemId });
      if (!item) throw new NotFoundError("The item");
      const owner = await ctx.collections.users.findOne({ _id: item.ownerId });
      return {
        id: item._id,
        title: item.title,
        category: item.category,
        description: item.description,
        owner: {
          id: item.ownerId,
          name: owner?.name ?? "Unknown neighbour",
          street: owner?.street ?? "",
        },
      };
    }),

    /** Days already promised to someone. Anyone may see when the item is free. */
    bookedDays: publicProcedure
      .input(itemInput)
      .query(({ ctx, input }) => getBookedDays(ctx.collections, input.itemId)),
  }),

  requests: router({
    /** The caller's own requests for the item. */
    mine: authedProcedure
      .input(itemInput)
      .query(({ ctx, input }) =>
        listRequestsByRequester(ctx.collections, input.itemId, ctx.user._id),
      ),

    /** All requests for the item. Owner only. */
    incoming: authedProcedure
      .input(itemInput)
      .query(({ ctx, input }) => listRequestsForOwner(ctx.collections, input.itemId, ctx.user._id)),

    create: authedProcedure
      .input(
        z.object({
          itemId: z.string().min(1),
          startDate: isoDay,
          endDate: isoDay,
          message: z.string().trim().max(280).default(""),
        }),
      )
      .mutation(({ ctx, input }) =>
        createRequest(ctx, {
          itemId: input.itemId,
          requesterId: ctx.user._id,
          range: { startDate: input.startDate, endDate: input.endDate },
          message: input.message,
        }),
      ),

    /** The owner accepts or declines a pending request. */
    decide: authedProcedure
      .input(z.object({ requestId: z.string().min(1), decision: z.enum(DECISIONS) }))
      .mutation(({ ctx, input }) =>
        decideRequest(ctx, {
          requestId: input.requestId,
          actorId: ctx.user._id,
          decision: input.decision,
        }),
      ),

    /**
     * Live feed over WebSocket. The requester and the item owner get the full
     * request; everyone else only learns that availability changed, so request
     * details never reach people who are not part of it.
     */
    onChange: authedProcedure.input(itemInput).subscription(async function* ({
      ctx,
      input,
      signal,
    }): AsyncGenerator<LiveUpdate> {
      for await (const event of ctx.events.subscribe(signal)) {
        if (event.itemId !== input.itemId) continue;

        const isParty =
          ctx.user._id === event.itemOwnerId || ctx.user._id === event.request.requesterId;
        if (isParty) {
          yield { type: "request", change: event.change, request: event.request };
        } else if (event.change === "accepted") {
          yield { type: "availability" };
        }
      }
    }),
  }),
});

export type AppRouter = typeof appRouter;
