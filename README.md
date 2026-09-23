# Roomie

A working roommate app concept for a semester project. Maple House is a fictional apartment with Alex, Jordan, Maya, and Eli.

## Features

- Dashboard with household progress and activity.
- Assign, complete, reopen, and rotate chores.
- Split expenses four ways with exact penny allocation; record settlements without sending money.
- Reserve shared spaces with server-enforced overlap checks.
- Propose house rules and record agreement.
- Email/password sign-in with one account per demo roommate; sessions use secure, HTTP-only cookies.
- Neon Postgres persistence, server validation, and version checks against lost updates across tabs.
- In-app **How to use** guide.

## How to use

Create an account and claim one available Maple House profile (Alex, Jordan, Maya, or Eli). Each profile can be claimed once. Sign in again with that email and password. All four profiles share the same saved household. Add and finish chores, record only expenses you paid, reserve spaces, and vote on rules. Settlement is only a ledger marker; pay each other outside the app.

The initial household records are fictional examples. This class-project version has one four-person household and no password-reset email flow. Use a password you do not use anywhere else.

## Run locally

Requires Node.js 22.13+ and pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
# Set DATABASE_URL in .env.local to your Neon connection string.
pnpm db:migrate # creates the household, user, and session tables
pnpm dev
```

```sh
pnpm typecheck
pnpm build
```

Built with React, TypeScript, Vinext (Next.js App Router APIs on Vite), Tailwind, shadcn/ui, Drizzle ORM, and Neon. The bundled runtime supports Cloudflare Workers / Sites; set DATABASE_URL as a server-side secret when deploying. Never expose it in a NEXT_PUBLIC variable or commit .env.local.

Schema: `db/schema.ts`. Migration: `drizzle-neon/`. API: `app/api/household/route.ts`. Domain validation: `lib/actions.ts`.

## Vercel

Import `SeanSpon/projectforit`. The checked-in `vercel.json` selects Next.js, builds with `pnpm run build:vercel`, and serves `.next`. The database adapter uses the server-only `DATABASE_URL` environment variable on Vercel. Add your Neon connection string under Project Settings → Environment Variables for Production and Preview, then redeploy. The existing Cloudflare build remains available through `pnpm build`.

Keep Vercel Deployment Protection enabled if you want access limited to invited viewers. App accounts still require access to the site itself.

## Prototype scope

This is a class demonstration with four fixed roommate slots and one shared fictional household. Initial votes are seeded examples. Settlement buttons update the ledger only. There is no payment processing, messaging, or AI service. Before using it for a real household, add invitations, password recovery, rate limiting, and separate household creation.
