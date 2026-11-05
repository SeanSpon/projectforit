# Roomie

One roommate and floor-community app at `/`, preserving the original green Roomie interface. Existing Vercel project: `projectforit`; GitHub: `SeanSpon/projectforit`; production URL: https://projectforit-three.vercel.app.

## Student rooms

Create a normal account, create an independent room, or join an assigned room with a student invitation. Every newly issued invitation contains 128 random bits. A room owner can regenerate or revoke invitations, remove members, and transfer ownership to a current roommate. The first invited resident to enter an unclaimed floor room becomes its owner; floor organizers never become roommates automatically. Codes are bearer invitations: give them only to assigned residents.

The original chores, shared expenses, settlements, space reservations, rule proposals/votes, profiles, and demo remain. Private roommate messages are under **Messages**. Only current roommates can read private household data; a connected floor manager cannot join a managed room using its code.

**Rooms & profile** contains contact-sharing choices, role correction, room management, and permanent account deletion. Transfer shared rooms before deleting their owner account. Account deletion removes sessions, profile, authored requests/messages, and solo-owned rooms. Deleting a floor owner disbands their groups while preserving occupied student rooms and their private state.

## Optional floor groups

Any account can open the floor dashboard and create a group; there is no admin approval or RA activation code. The account role is a preference, not an authorization claim. Floor ownership is explicitly **unverified university RA status**.

A floor manager can create assigned rooms with unique student invitations and remove non-owner residents from connected rooms. Room owners must transfer ownership before removal; floor managers cannot transfer or claim ownership. To bring an existing independent room, its owner submits the separate floor connection code and an assigned room number. The floor manager must explicitly approve. Database uniqueness prevents two rooms claiming the same normalized label in one group. Approval can replace an empty assigned slot; if a resident claims it first, approval fails safely. Removing or leaving a room invalidates previously shared invitations. Ownership transfer also disables aggregate chore sharing and cancels pending floor requests. When the last resident leaves an assigned room, its previous private history is archived without access and the floor gets a fresh empty room and code. Any resident can disconnect their room; floor managers can disconnect managed rooms. Disconnection and reconnection reset room chore-sharing consent.

The integrated floor dashboard includes overview counts, room directory, resident names/bios and shared contacts, announcements, floor/room rules, maintenance photos/status/updates, private help, invitation management, and connection approvals. The app sends no email/SMS notifications; contact buttons open the device's email/phone application. Requests are internal Roomie records, not official university work orders.

## Privacy and authorization

- Expenses, financial information, private roommate messages, bookings, household activity, and individual chore assignments never enter the floor response.
- Email and phone sharing default off and are evaluated by SQL at read time. Residents control their own choices.
- A room owner can opt in to **aggregate** chore totals; any roommate can revoke. Individual chore detail sharing is deliberately unsupported.
- Private help is visible only to its author and current connected floor manager. Maintenance is shared with that room's residents and current floor manager.
- Session-derived actor IDs are supplied by server handlers. Client payloads cannot select an actor. Server-only Neon credentials are never exposed to the browser.
- PostgreSQL functions enforce actor checks, contact projection, request visibility, ownership changes, and atomic floor approvals. Triggers prevent floor owners joining managed rooms and reset sharing when floor links change. Internal functions are revoked from PUBLIC.
- Household mutations retain membership checks and optimistic version conflict protection. Membership and invitation mutations lock/version the household. Origin and input checks protect mutations.

Legacy RA-invitation and residence-message records are preserved by the migration. Legacy room-wide RA conversations are no longer exposed through the new private-help interface. Their historical visibility is ambiguous, so they are not automatically converted into private threads.

## Run and deploy

Node 24.x, pnpm 11.25.0. Set the existing server-only `DATABASE_URL` in ignored `.env.local`; never use a `NEXT_PUBLIC_` database secret.

```sh
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm dev
pnpm typecheck
pnpm run build:vercel
```

`db/schema.ts` and `drizzle-neon/` track schema changes. Migrations `0005` through `0009` add floor workflows and guards without resetting existing accounts or private household state. Labels on existing floor links are backfilled; preexisting duplicate labels receive an ID suffix to preserve both links.

Vercel uses the checked-in `vercel.json`, Next.js, and the existing production Neon connection. Apply migrations before releasing code. The retained Vinext/Cloudflare development build remains available through `pnpm build`. Do not create another Vercel project or a second Roomie app.

## Verification

Run only against a separate Neon branch containing the migrated schema:

```sh
ROOMIE_TEST_DB_HOST=your-isolated-branch-host node --env-file=.env.local scripts/test-full-system.mjs
```

Or use `node scripts/run-isolated-tests.mjs` and supply `{ "url": "<isolated connection>" }` on hidden stdin. The in-process harness adapts only Next's cookie request context; actual API handlers, session hashing, validation, and Neon SQL all execute. Results are written to ignored `.sites-runtime/full-system-test-results.json`. No user account or production data is used for destructive test cases.

Coverage includes normal signup/login session behavior, independent rooms, assigned-room claims, role correction, transfer/deletion, contact opt-in/revocation, permission denials, private-help isolation, maintenance attachments/updates/status, approval-based connections, code rotation/revocation, preserved household features, and state conflicts. Visual checks use fictional residents on the isolated branch.

## Limits

No university identity verification, email verification, password-reset email, push/email/SMS delivery, multi-manager floor delegation, individual chore sharing, or official campus maintenance integration. Photos are resized/re-encoded by the client and stored privately in Neon with the request (maximum about 500 KB after encoding). The full browser-to-production flow is checked separately from the isolated handler integration suite. See `docs/verification-2026-11-05.md` for the exact evidence and remaining verification limits.

## Additional regression and HTTP tests

`node scripts/run-isolated-tests.mjs` accepts hidden-stdin JSON with `url` and optional `suite: "lifecycle"`. The lifecycle suite tests invitation invalidation, vacant-room privacy, pending connection ownership, and empty assigned-slot approval races.

After `pnpm run build:vercel`, `node scripts/run-http-tests.mjs` accepts the same hidden-stdin `url` and starts a production Next.js server on loopback. It runs the full integration suite with real HTTP cookies against that isolated branch, then stops the server. Never supply the production database URL to either test runner.
