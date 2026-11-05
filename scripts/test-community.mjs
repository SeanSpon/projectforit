import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
const base = process.env.ROOMIE_TEST_URL || "http://127.0.0.1:4173";
if (!process.env.DATABASE_URL || !process.env.ROOMIE_TEST_DB_HOST || new URL(process.env.DATABASE_URL).hostname !== process.env.ROOMIE_TEST_DB_HOST) throw new Error("Set ROOMIE_TEST_DB_HOST to the isolated test branch host. Never use production.");
if (process.env.ROOMIE_TEST_IN_PROCESS === "1") {
  const { installRouteHarness } = await import("./test-route-harness.mjs"); await installRouteHarness(new URL(base).origin);
}
const db = neon(process.env.DATABASE_URL);
const run = randomUUID().slice(0, 8); let checks = 0;
async function request(session, path, payload, expected = 200) {
  const response = await fetch(base + path, { method: payload ? "POST" : "GET", headers: { origin: base, ...(payload ? { "Content-Type": "application/json" } : {}), ...(session.cookie ? { Cookie: session.cookie } : {}) }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
  const cookie = response.headers.getSetCookie().find(c => c.startsWith("roomie_session=")); if (cookie) session.cookie = cookie.split(";")[0];
  const data = await response.json();
  assert.equal(response.status, expected, `${path} ${payload?.type || "GET"}: ${JSON.stringify(data)}`); checks++; return data;
}
async function account(name) {
  const session = { email: `${name}-${run}@example.com` };
  const result = await request(session, "/api/auth", { type: "signup", email: session.email, password: randomBytes(24).toString("hex"), name: "QA " + name }, 201);
  assert.equal(result.user.role, "student"); session.id = result.user.id; return session;
}
async function invite(session) {
  const code = randomBytes(16).toString("hex"), hash = createHash("sha256").update(code).digest("hex");
  await db`INSERT INTO roomie_ra_invites (code_hash,email,expires_at) VALUES (${hash},${session.email},now()+interval '1 hour')`; return code;
}
await request({}, "/api/health");
await request({}, "/api/community", undefined, 401);
const ra = await account("ra"), resident = await account("resident"), roommate = await account("roommate"), outsider = await account("outsider"), otherRA = await account("other-ra");
await request(resident, "/api/community", { type: "create_group", name: "Unauthorized", building: "Test Hall", floor: "9" }, 403);
const code = await invite(ra);
await request(outsider, "/api/community", { type: "activate", code }, 403);
await request(ra, "/api/community", { type: "activate", code });
await request(ra, "/api/community", { type: "activate", code }, 403);
await request(otherRA, "/api/community", { type: "activate", code: await invite(otherRA) });
const group = await request(ra, "/api/community", { type: "create_group", name: "QA Morgens 900 RA", building: "Morgens Hall", floor: "9" }, 201);
const groups = await request(ra, "/api/community"); const connectionCode = groups.groups.find(g => g.id === group.id).inviteCode;
const room = await request(resident, "/api/rooms", { type: "create", name: "QA Room 904" }, 201);
const rooms = await request(resident, "/api/rooms"); const roomCode = rooms.rooms.find(r => r.id === room.id).inviteCode;
await request(roommate, "/api/rooms", { type: "join", code: roomCode });
await request(roommate, "/api/community", { type: "connect_room", householdId: room.id, code: connectionCode }, 403);
await request(resident, "/api/community", { type: "connect_room", householdId: room.id, code: connectionCode });
await request(resident, "/api/community", { type: "connect_room", householdId: room.id, code: connectionCode }, 409);
await request(resident, "/api/community", { type: "report", householdId: room.id, title: "Desk light", body: "Please inspect the desk light.", category: "Maintenance" });
await request(resident, "/api/community", { type: "message", householdId: room.id, body: "Hello RA" });
let data = await request(ra, `/api/community?group=${group.id}`);
assert.equal(data.reports.length, 1); assert.equal(data.messages[0].body, "Hello RA"); assert.equal(data.rooms[0].residents.length, 2);
const report = data.reports[0];
await request(resident, "/api/community", { type: "status", reportId: report.id, status: "Resolved" }, 403);
await request(otherRA, "/api/community", { type: "status", reportId: report.id, status: "Resolved" }, 403);
await request(otherRA, `/api/community?group=${group.id}`, undefined, 404);
await request(outsider, `/api/community?room=${room.id}`, undefined, 404);
await request(outsider, "/api/community", { type: "message", householdId: room.id, body: "Intrusion" }, 404);
await request(resident, "/api/community", { type: "announce", groupId: group.id, title: "Unauthorized", body: "No" }, 403);
await request(ra, "/api/community", { type: "status", reportId: report.id, status: "Resolved" });
await request(ra, "/api/community", { type: "message", householdId: room.id, body: "We will look into it." });
await request(ra, "/api/community", { type: "announce", groupId: group.id, title: "Floor meeting", body: "Thursday at 7 PM." });
data = await request(roommate, `/api/community?room=${room.id}`);
assert.equal(data.reports[0].status, "Resolved"); assert.equal(data.messages.at(-1).body, "We will look into it."); assert.equal(data.announcements[0].title, "Floor meeting"); assert.equal(data.group.inviteCode, undefined);
// A second room in the same group cannot read the first room's conversations.
const room2 = await request(outsider, "/api/rooms", { type: "create", name: "QA Room 905" }, 201);
await request(outsider, "/api/community", { type: "connect_room", householdId: room2.id, code: connectionCode });
data = await request(outsider, `/api/community?room=${room2.id}`);
assert.equal(data.messages.length, 0); assert.equal(data.reports.length, 0); assert.equal(data.rooms.length, 1); assert.equal(data.announcements.length, 1);
await request(ra, `/api/household?id=${room.id}`, undefined, 404); // RA role alone never grants access to chores/expenses.
const [persisted] = await db`SELECT status FROM roomie_residence_reports WHERE id=${report.id}`;
assert.equal(persisted.status, "Resolved");
console.log(`Passed ${checks} API status checks plus role, invitation, persistence, messaging, reporting, announcements and room-isolation assertions.`);
