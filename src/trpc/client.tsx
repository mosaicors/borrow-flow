"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createWSClient, httpBatchLink, splitLink, wsLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { type ReactNode, useState } from "react";
import type { AppRouter } from "@/server/routers/app";
import { API_PORT } from "@/shared";

export const trpc = createTRPCReact<AppRouter>();

type Outputs = inferRouterOutputs<AppRouter>;
export type BorrowRequest = Outputs["requests"]["mine"][number];
export type Neighbour = Outputs["users"]["list"][number];
export type Item = Outputs["item"]["get"];

function webSocketUrl(): string {
  if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${window.location.hostname}:${API_PORT}`;
}

/**
 * tRPC + React Query for one user. Queries and mutations go over HTTP,
 * subscriptions over a WebSocket. Render it with `key={userId}` so switching
 * user starts from an empty cache and a fresh socket.
 */
export function TRPCProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [clients] = useState(() => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: 5_000, retry: 1 } },
    });

    // Lazy: the socket opens with the first subscription and closes by itself
    // once nothing is subscribed, so there is nothing to clean up on unmount.
    const wsClient = createWSClient({
      url: webSocketUrl,
      connectionParams: () => ({ userId }),
      lazy: { enabled: true, closeMs: 1_000 },
    });

    const trpcClient = trpc.createClient({
      links: [
        splitLink({
          condition: (op) => op.type === "subscription",
          true: wsLink({ client: wsClient }),
          false: httpBatchLink({ url: "/api/trpc", headers: () => ({ "x-user-id": userId }) }),
        }),
      ],
    });

    return { queryClient, trpcClient };
  });

  return (
    <trpc.Provider client={clients.trpcClient} queryClient={clients.queryClient}>
      <QueryClientProvider client={clients.queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
