import { EventEmitter, on } from "node:events";
import type { BorrowRequestView } from "./borrow-service";

export type BorrowEvent = {
  /** What just happened to the request. */
  change: "created" | "accepted" | "declined";
  itemId: string;
  itemOwnerId: string;
  request: BorrowRequestView;
};

const CHANNEL = "borrow";

/**
 * In-process publish/subscribe for request changes. Mutations publish here and
 * WebSocket subscriptions listen. It lives in memory, so it works for a single
 * API process; with several instances this would become Redis pub/sub or
 * MongoDB change streams behind the same two methods.
 */
export class BorrowEvents {
  private readonly emitter = new EventEmitter();

  constructor() {
    // One listener per open subscription, so the default limit of 10 is too low.
    this.emitter.setMaxListeners(0);
  }

  publish(event: BorrowEvent): void {
    this.emitter.emit(CHANNEL, event);
  }

  /** Yields every event until `signal` aborts (the client unsubscribed or disconnected). */
  async *subscribe(signal: AbortSignal | undefined): AsyncGenerator<BorrowEvent> {
    try {
      for await (const [event] of on(this.emitter, CHANNEL, { signal })) {
        yield event as BorrowEvent;
      }
    } catch (error) {
      if (signal?.aborted) return;
      throw error;
    }
  }
}
