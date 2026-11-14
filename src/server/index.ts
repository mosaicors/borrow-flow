import type { TRPCError } from "@trpc/server";
import { createHTTPServer } from "@trpc/server/adapters/standalone";
import { applyWSSHandler } from "@trpc/server/adapters/ws";
import { WebSocketServer } from "ws";
import { API_PORT } from "@/shared";
import { connectDatabase } from "./db";
import { BorrowEvents } from "./events";
import { appRouter } from "./routers/app";
import { seedIfEmpty } from "./seed";
import { createContextFactory } from "./trpc";

/**
 * The API process: tRPC over HTTP (queries and mutations) and over WebSocket
 * (subscriptions) on one port. Next.js proxies `/api/trpc/*` to it, see
 * next.config.ts. Keeping both in one process lets mutations notify open
 * subscriptions directly.
 */
async function main() {
  const port = Number(process.env.API_PORT ?? API_PORT);
  const database = await connectDatabase();
  const seeded = await seedIfEmpty(database.collections);

  const createContext = createContextFactory({
    collections: database.collections,
    events: new BorrowEvents(),
    now: () => new Date(),
  });

  // Rule violations are expected and reach the client; only real bugs are logged.
  const onError = ({ error, path }: { error: TRPCError; path?: string }) => {
    if (error.code === "INTERNAL_SERVER_ERROR") console.error(`[api] ${path ?? "?"} failed`, error);
  };

  const server = createHTTPServer({ router: appRouter, createContext, onError });
  const wss = new WebSocketServer({ server });
  const wsHandler = applyWSSHandler({
    wss,
    router: appRouter,
    createContext,
    onError,
    // Drops connections whose browser tab disappeared without closing the socket.
    keepAlive: { enabled: true, pingMs: 30_000, pongWaitMs: 5_000 },
  });

  server.listen(port, () => {
    console.log(`[api] tRPC over HTTP and WebSocket on port ${port}`);
    console.log(`[api] database: ${database.description}`);
    if (seeded) console.log("[api] empty database, added seed users, one item and two requests");
  });

  const shutdown = async () => {
    // Tells connected browsers to reconnect, which they do once the API is back.
    wsHandler.broadcastReconnectNotification();
    wss.close();
    server.close();
    await database.close();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("[api] failed to start", error);
  process.exit(1);
});
