# Roomie

A roommate and residential-community app for a semester project. Real accounts create private rooms; RAs manage connected room groups. A separate demo uses fictional Maple House residents.

## Features

- Dashboard with household progress and activity.
- Assign, complete, reopen, and rotate chores.
- Split expenses among current roommates with exact penny allocation; record settlements without sending money.
- Reserve shared spaces with server-enforced overlap checks.
- Propose house rules and record agreement.
- Email/password sign-in with individual accounts; sessions use secure, HTTP-only cookies.
- Neon Postgres persistence, server validation, and version checks against lost updates across tabs.
- In-app **How to use** guide.

## How to use

Create an account with your name, email, and password. Create your own household or join one with a roommate's 16-character invite code. Each household keeps its chores, expenses, reservations and agreements separate. Edit your profile and switch rooms from **Rooms & profile**.

The **Try the full demo** button opens sample household data without saving it to your real account. There is no password-reset email flow yet.

## Run locally

Requires Node.js 24.x and pnpm 11.25.0.

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

Import `SeanSpon/projectforit`. The checked-in `vercel.json` selects Next.js, builds with `pnpm run build:vercel`, and serves `.next`. The database adapter uses the server-only `DATABASE_URL` environment variable on Vercel. Set Production DATABASE_URL to the production Neon branch and Preview DATABASE_URL to an isolated preview branch, then redeploy. The existing Cloudflare build remains available through `pnpm build`.

Keep Vercel Deployment Protection enabled if you want access limited to invited viewers. App accounts still require access to the site itself.

## Live student and RA communities

The signed-in app now uses Neon for RA groups, room connections, announcements, room conversations, issue reports, and role invitations. Both Vercel projects build this GitHub repository from `main`. Use `projectforit-three.vercel.app` as the main address; the existing `projectforit-64zu.vercel.app` deployment remains supported.

### Students

1. Create an account and a room, or join a roommate using the room's invite code.
2. Open the room and choose **Your RA & community**.
3. The room creator enters the **RA group code** supplied by the RA. All room members are then connected to that group.
4. Send room messages, submit reports, and read floor announcements. Reports and conversations are shared with that room's residents and assigned RA.

### RAs

RA status is invitation-only. The app owner issues an invitation to a specific email from a trusted terminal with production database access:

```sh
node --env-file=.env.local scripts/invite-ra.mjs person@example.com
```

The one-use code expires after seven days. The recipient signs in with the invited email, opens **Activate RA account** under **Rooms & profile**, and enters the code. They then open **RA dashboard**, create a group such as **Morgens 900 RA**, and share its group connection code with room creators. The account's role does not itself grant access to rooms; it can manage only groups it owns and rooms explicitly connected to those groups. This establishes app-owner authorization, not university identity verification.

The RA sees room residents/contact details, submitted reports, room conversations and group announcements. Chores, private household expenses, bookings and house rules remain restricted to household members. Messages stay in the app; this app does not send email/SMS or process payments. Reports are not monitored for emergencies.

### Sync and deployment

Community screens and household data refresh every 15 seconds while the page is visible. Actions save before reporting success; existing household writes retain optimistic version checks. Vercel uses the server-only `DATABASE_URL`. Production must point to the production Neon branch; preview/development should use an isolated branch. Run `pnpm db:migrate` before deploying schema changes. Migrations add tables/columns without resetting existing accounts or household data.

### Verification

`pnpm typecheck` and `pnpm run build:vercel` check the production build. The API integration suite exercises the actual route handlers and real Neon data; its in-process mode adapts Next's request-cookie context for isolated execution:

```sh
# Use an isolated Neon branch in .env.local, never production.
ROOMIE_TEST_IN_PROCESS=1 ROOMIE_TEST_DB_HOST=your-test-branch-host node --env-file=.env.local scripts/test-community.mjs
```

The suite covers signups, sessions, single-use email-bound RA invitations, group creation, room owner connection, messages, status changes, announcements, database persistence, cross-room isolation, and rejection of unauthorized writes. Test records stay on the isolated branch.

### Design prototype

The original browser-local prototype remains at `/prototype/index.html`, with its original ten screenshots under `docs/ra-prototype/`. It is labeled as a prototype and does not connect to live accounts; use the signed-in app for real rooms and RA communication.
