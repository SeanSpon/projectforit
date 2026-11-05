# Roomie delivery and verification — November 5, 2026

Live app: https://projectforit-three.vercel.app/

Implementation commit: `343099beef31aaf69a2b990809921ccdc2757d01`  
Production deployment: `dpl_HM35nJELKbjGFodxyZPfzTcXZNrS` — READY. This implementation reached the existing production domain. A later documentation-only commit may deploy identical application code.

## What changed in this delivery

1. Removed the obsolete production `/prototype/index.html` entry point. Verified that it returns HTTP 404. Preserved all 10 historical class screenshots under `docs/ra-prototype/screenshots/` and replaced their outdated instructions with an archive notice.
2. Kept optional Demo Mode in the same app, labeled **DEMO MODE · FICTIONAL DATA**. Demo changes stay in memory. Removed the default demo-member context from real room rendering; production rooms load actual members and state.
3. Added a database trigger that rotates room invitations when a resident leaves, is removed, or is deleted. A removed resident cannot use their previously known code to regain access.
4. Ownership transfers now rotate invitations, disable aggregate chore sharing, and cancel pending floor connections made by the previous owner. Non-owners cannot cancel another owner's connection request.
5. Vacated assigned rooms now receive a fresh household ID, empty private state, and a new invitation. The previous household history is preserved as inaccessible archived data. New occupants cannot inherit prior expenses, individual chores, or private chats. Sole-resident account deletion also preserves a fresh assigned slot for the floor.
6. Request updates now require the author to remain a current resident, unless the actor is the current connected floor manager. Former residents cannot keep updating private help after removal.
7. Existing independent rooms can request an unused RA-created room slot. Approval replaces only a still-empty placeholder, revokes its old invitation, and preserves the independent room's state. Approval fails if the placeholder was claimed in the meantime. Normalized room-label uniqueness remains enforced in PostgreSQL.
8. Student room selection, room views, floor selection, and floor sections now synchronize with the URL, so refreshing can restore the selected database-backed view. Fixed sign-in routing to use the account's saved role preference.
9. Added resident search by name, room, bio, or shared email; added request filtering by Open, In progress, and Resolved. Added phone layout fixes for long contacts, controls, room invitations, and access to Rooms & profile / Sign out.
10. Improved save/sync feedback and prevented duplicate submissions. A failed refresh no longer produces a success message. Improved message loading, polling, and handling when a send succeeds but reloading fails. Copy-code controls only enable for actual invitation codes. Room-rule agreement counts now consider current roommates rather than departed members' votes.
11. Added confirmation dialogs for room ownership transfer, leaving, member removal, and floor disconnection. Existing password-plus-DELETE account deletion remains.
12. Added repeatable lifecycle regressions and a production Next.js HTTP test runner. Expanded verification to rejection of floor connections, departed-member access, vacant-room privacy, and assigned-slot approval races. Updated project documentation.

## Current functional features

“Verified” below means the operation executed against the isolated Neon branch using actual application handlers or the production Next.js HTTP server. It does not mean every signed-in screen has completed manual browser testing.

| Feature | Current behavior | Verification |
| --- | --- | --- |
| Accounts | Signup, login, logout, profile/bio/phone, contact preferences, role correction | Real sessions and Neon persistence exercised |
| Independent rooms | Create, invite roommates, join, rotate/revoke invitations | HTTP suite |
| Room ownership | Transfer to a current roommate, remove residents, leave, block owner deletion/leave until shared-room ownership is transferred | HTTP + lifecycle suites |
| Account deletion | Password and DELETE confirmation; delete profile/sessions and authored requests/messages; preserve other residents' rooms | HTTP + lifecycle suites |
| Chores | Add, complete/reopen, rotate assignments | Database-backed household actions exercised |
| Expenses | Add payer-owned expenses, equal shares, self-settlement | HTTP suite; ledger only, no payments |
| Shared spaces | Reserve/cancel own bookings, reject overlap | HTTP suite |
| Room rules | Propose and vote | HTTP suite; current-member vote display corrected |
| Roommate messages | Read/send private room conversation | HTTP persistence + RA/outsider denials |
| Floor groups | Normal accounts create groups without admin or activation code | HTTP suite; role does not grant authorization |
| Assigned rooms | RA creates unique labeled rooms; first invited student becomes owner | HTTP suite; duplicate concurrent creation tested |
| Independent-room floor connection | Owner requests; RA approves/rejects; unused assigned slots supported | HTTP + lifecycle suites |
| Floor directory | Resident name/bio and only explicitly shared contacts; search/filter | SQL/API privacy verified; search rendering reviewed |
| Announcements/floor rules | RA posts; connected residents read | HTTP suite |
| Maintenance | Internal requests, private stored photos, Open/In progress/Resolved, updates | HTTP suite |
| Private help | Author and current connected manager; roommates/other RAs excluded | HTTP + lifecycle suites |
| Chore privacy | Private by default; owner can opt in to aggregate totals; any roommate can revoke | HTTP suite; no individual assignment data in RA response |
| Floor disconnection | Room member or floor owner disconnects; aggregate sharing resets | HTTP suite |

## Database and preservation

Used the existing Neon project `roomie` and existing production database. Created only an isolated test branch, `roomie-finish-20261105`, for test accounts, destructive deletion cases, and migrations before production.

Applied tracked migrations `0008_membership_lifecycle_privacy.sql` and `0009_existing_room_assigned_slot.sql`. They replace server functions and triggers; they do not reset existing production rows.

| Production record count | Before | After migrations and browser Demo Mode checks |
| --- | ---: | ---: |
| Accounts | 7 | 7 |
| Households | 4 | 4 |
| Memberships | 3 | 3 |
| Private room messages | 0 | 0 |
| Requests | 0 | 0 |
| Applied migrations | 8 | 10 |

No replacement database or Vercel project was created. Production credentials were not added to source or included in this delivery. The test branch remains available for review; destructive tests did not run against production.

The backend uses authenticated session actor IDs, SQL permission checks, membership restrictions, unique indexes, locking, and household version checks. There is no browser database credential. The floor API projects an explicit safe subset; it does not return household state, expenses, private messages, individual chores, or unshared contacts.

## Test results and limits

| Check | Result |
| --- | --- |
| Dependency installation using the frozen lockfile | Passed |
| TypeScript `pnpm typecheck` | Passed |
| Next.js production build `pnpm run build:vercel` | Passed |
| Full integration suite through route handlers | 146 checks passed |
| Full suite through a real production Next.js HTTP server, real cookies, and isolated Neon | 146 checks passed on the final implementation |
| Lifecycle/approval regression suite | 69 checks passed |
| ESLint on changed frontend/action files | Zero errors; one warning for the existing private attachment `<img>` |
| Live deployment `/api/health` | HTTP 200, database connected, community ready |
| Removed prototype URL | HTTP 404 as expected |
| Live browser entry screens and Demo Mode | Opened, screenshots captured; demo chore/message submissions and navigation exercised |

Use **215 checks** for the final HTTP + lifecycle total. The separate 146-handler run repeats much of the HTTP coverage; it is not another set of unique scenarios.

Initial type checking found a missing search-result variable; it was corrected. Initial linting reported effect/navigation issues; errors were corrected. An early test process was interrupted by the execution environment; clean reruns completed successfully. Two full-page screenshot attempts timed out; viewport capture succeeded. No final automated test failed.

Authenticated Student/RA browser interaction and dedicated mobile viewport testing were **not completed**. The signed-in workflows above were exercised through actual HTTP requests on the isolated branch. The supplied browser screenshots show production entry forms and optional Demo Mode, not signed-in RA dashboard evidence. A preview browser was unavailable for further interaction; no browser restriction was bypassed.

## Remaining future or demo-only features

- Password-reset email and email verification are not configured. No email-delivery service credentials were available for this task.
- Email, SMS, and push delivery remain future features. The app updates while open through 15-second polling.
- There is no official university identity/RA verification or campus maintenance integration. A floor group is self-organized; its creator is not represented as a verified university RA.
- Multi-manager floor delegation is not implemented. Individual chore sharing remains deliberately unsupported.
- Legacy RA activation-invitation and residence-message records remain preserved but are not used as active onboarding/private-help features.
- Demo Mode is fictional and in-memory. Real users' rooms and floor workflows use Neon. Expense settlements are bookkeeping; Roomie does not send money.
- Maintenance photos are stored in Neon as private encoded images, with a roughly 500 KB encoded-image budget after client resizing. There is no separate external upload/notification service.

## Simple app flows

**Student:** Create an account → create your room or join with a student code → invite roommates → manage chores, expenses, reservations, messages, and room rules. Set your profile and contact-sharing preferences in Rooms & profile. A room owner can optionally request a floor connection using its separate code and assigned room number. After RA approval, use Your RA & community for announcements, floor rules, maintenance, and private help. Transfer ownership before leaving or deleting an account that owns a room with other residents.

**RA / floor organizer:** Create a normal account → open the floor dashboard → create a floor group → create assigned rooms → share each room's unique student code. Residents join their rooms independently. Review connection requests for existing rooms and approve/reject them. Use Residents, Announcements, Room & floor rules, Maintenance, Private help, and Rooms & invitations. Only explicitly shared contacts and opted-in aggregate chore totals appear. You cannot read private roommate expenses, conversations, or individual chore assignments.

## Screenshot index

All screenshots were captured from the deployed app after implementation commit `343099b`. No old prototype screenshot is presented as a current screen. Screens 04–10 use the explicitly labeled optional Demo Mode and fictional Maple House residents. Screens 01–03 contain empty production entry forms. No real resident profile or private data is included.

1. **Student sign-in** — `01-student-login.jpg` — Production entry screen.
2. **Account creation** — `02-account-creation.jpg` — Production form; empty fields.
3. **RA portal entry** — `03-ra-login.jpg` — Production sign-in; RA status unverified.
4. **Household overview** — `04-demo-overview.jpg` — Demo Mode · fictional data.
5. **Chores and assignments** — `05-demo-chores.jpg` — Demo Mode · fictional data.
6. **Shared expenses** — `06-demo-expenses.jpg` — Demo Mode · fictional data.
7. **Shared-space reservations** — `07-demo-shared-spaces.jpg` — Demo Mode · fictional data.
8. **Room rules and voting** — `08-demo-house-rules.jpg` — Demo Mode · fictional data.
9. **Private roommate messages** — `09-demo-private-messages.jpg` — Demo Mode · fictional data.
10. **User guide** — `10-demo-user-guide.jpg` — Demo Mode · fictional data.
