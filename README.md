# Roomie

A working roommate app concept for a semester project. Maple House is a fictional apartment with Alex, Jordan, Maya, and Eli.

## Features

- Dashboard with household progress and activity.
- Assign, complete, reopen, and rotate chores.
- Split expenses four ways with exact penny allocation; record settlements without sending money.
- Reserve shared spaces with server-enforced overlap checks.
- Propose house rules and record agreement.
- Neon Postgres persistence, server validation, and version checks against lost updates across tabs.

## Run locally

Requires Node.js 22.13+ and pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
# Set DATABASE_URL in .env.local to your Neon connection string.
pnpm db:migrate
pnpm dev
```

```sh
pnpm typecheck
pnpm build
```

Built with React, TypeScript, Vinext (Next.js App Router APIs on Vite), Tailwind, shadcn/ui, Drizzle ORM, and Neon. The bundled runtime supports Cloudflare Workers / Sites; set DATABASE_URL as a server-side secret when deploying. Never expose it in a NEXT_PUBLIC variable or commit .env.local.

Schema: `db/schema.ts`. Migration: `drizzle-neon/`. API: `app/api/household/route.ts`. Domain validation: `lib/actions.ts`.

## Prototype scope

This is a private demonstration. Every visitor acts as Alex in one shared fictional household; other roommates' votes are seeded examples. The calendar uses a labeled sample week in September 2026. Settlement buttons update the ledger only. There is no payment processing, messaging, or AI service.

Keep the hosted concept behind owner-only access. Before a public deployment with real data, add authentication, household membership authorization, rate limiting, and per-household storage. The current API does not provide those controls by itself.
