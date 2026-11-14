import type { NextConfig } from "next";

// Where the tRPC API process listens (see src/server/index.ts).
const apiOrigin = process.env.API_ORIGIN ?? "http://localhost:3001";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // The browser calls /api/trpc on the same origin; Next.js forwards it to the
  // API process, so there is no CORS setup. WebSockets connect to it directly.
  async rewrites() {
    return [{ source: "/api/trpc/:path*", destination: `${apiOrigin}/:path*` }];
  },
};

export default nextConfig;
