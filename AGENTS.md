<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Working in this repository

- Read `docs/spec.md` before changing behaviour. Update it in the same change when a rule changes.
- Business rules go in `src/domain` as pure functions with unit tests. Do not put rules in components or in the router.
- Database access goes through `src/server/borrow-service.ts`. Keep the no-double-booking guarantee in the `bookedDays` unique id, not in application checks alone.
- Days are `YYYY-MM-DD` strings. Do not convert them to `Date` for comparisons.
- Run `npm run check` (lint, type check, tests) before calling a change done. Add a test for every new rule or bug fix.
