import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { mkdir, writeFile } from "node:fs/promises";
import { installRouteHarness } from "./test-route-harness.mjs";
if (
  !process.env.DATABASE_URL ||
  !process.env.ROOMIE_TEST_DB_HOST ||
  new URL(process.env.DATABASE_URL).hostname !== process.env.ROOMIE_TEST_DB_HOST
)
  throw Error("Use an explicitly selected isolated Neon test branch.");
const base = "http://roomie.integration.test";
await installRouteHarness(base);
const db = neon(process.env.DATABASE_URL),
  run = randomUUID().slice(0, 8);
let checks = 0;
const cases = [];
async function req(s, path, payload, status = 200) {
  const r = await fetch(base + path, {
    method: payload ? "POST" : "GET",
    headers: {
      origin: base,
      ...(payload ? { "Content-Type": "application/json" } : {}),
      ...(s.cookie ? { cookie: s.cookie } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const cookie = r.headers
    .getSetCookie()
    .find((c) => c.startsWith("roomie_session="));
  if (cookie) s.cookie = cookie.split(";")[0];
  const d = await r.json();
  assert.equal(
    r.status,
    status,
    `${path} ${payload?.type || "GET"}: ${JSON.stringify(d)}`,
  );
  checks++;
  return d;
}
function check(condition, message) {
  assert.ok(condition, message);
  checks++;
  cases.push(message);
}
async function account(name, role = "student") {
  const s = {
    email: `roomie-${name}-${run}@example.com`,
    password: randomBytes(20).toString("hex"),
  };
  const d = await req(
    s,
    "/api/auth",
    {
      type: "signup",
      email: s.email,
      password: s.password,
      name: "QA " + name,
      role,
    },
    201,
  );
  s.id = d.user.id;
  return s;
}
const ra = await account("floor-manager", "ra"),
  student = await account("resident"),
  mate = await account("roommate"),
  outsider = await account("outsider"),
  ra2 = await account("other-floor", "ra");
await req({}, "/api/community", undefined, 401);
await req({}, "/api/rooms", undefined, 401);
const group = await req(
  ra,
  "/api/community",
  {
    type: "create_group",
    name: "QA Morgens — Floor 9",
    building: "Morgens Hall",
    floor: "9",
  },
  201,
);
let listing = await req(ra, "/api/community");
let floorCode = listing.groups.find((g) => g.id === group.id).inviteCode;
check(/^[A-F0-9]{32}$/.test(floorCode), "Floor codes use 128 random bits.");
const studentGroup = await req(
  student,
  "/api/community",
  {
    type: "create_group",
    name: "No admin approval needed",
    building: "QA Hall",
    floor: "2",
  },
  201,
);
check(
  !!studentGroup.id,
  "Any normal account can create a floor group without an admin invitation.",
);
await req(ra, "/api/auth", { type: "role", role: "student" });
await req(ra, "/api/community?group=" + group.id);
await req(ra, "/api/auth", { type: "role", role: "ra" });
const signedInAgain = {};
await req(signedInAgain, "/api/auth", {
  type: "login",
  email: ra.email,
  password: ra.password,
});
await req(signedInAgain, "/api/auth", { type: "logout" });
await req(signedInAgain, "/api/community", undefined, 401);
check(true, "Existing accounts can log in and logout invalidates the session.");
const duplicateCreates = await Promise.all(
  [1, 2].map(() =>
    fetch(base + "/api/community", {
      method: "POST",
      headers: {
        origin: base,
        "Content-Type": "application/json",
        cookie: ra.cookie,
      },
      body: JSON.stringify({
        type: "create_room",
        groupId: group.id,
        name: "Concurrent room 950",
        roomLabel: "950",
      }),
    }),
  ),
);
check(
  duplicateCreates
    .map((r) => r.status)
    .sort()
    .join(",") === "201,409",
  "Concurrent duplicate room creation allows exactly one directory claim.",
);

check(
  true,
  "Role correction preserves floor ownership while granting no new permissions.",
);
const assigned = await req(
  ra,
  "/api/community",
  {
    type: "create_room",
    groupId: group.id,
    name: "Morgens 901",
    roomLabel: "901",
  },
  201,
);
await req(
  ra,
  "/api/community",
  {
    type: "create_room",
    groupId: group.id,
    name: "Duplicate 901",
    roomLabel: " 901 ",
  },
  409,
);
await req(
  ra2,
  "/api/community",
  {
    type: "create_room",
    groupId: group.id,
    name: "Unauthorized",
    roomLabel: "902",
  },
  403,
);
let data = await req(ra, "/api/community?group=" + group.id);
let roomCode = data.rooms.find((r) => r.id === assigned.id).inviteCode;
check(
  data.rooms[0].ownerId === null && data.rooms[0].residents.length === 0,
  "RA-created rooms start unclaimed and do not add the RA as a roommate.",
);
await req(ra, "/api/rooms", { type: "join", code: roomCode }, 403);
await req(student, "/api/rooms", { type: "join", code: roomCode });
await req(mate, "/api/rooms", { type: "join", code: roomCode });
let rooms = await req(student, "/api/rooms");
check(
  rooms.rooms.find((r) => r.id === assigned.id).ownerId === student.id,
  "First invited resident becomes the room owner.",
);
await req(ra, "/api/household?id=" + assigned.id, undefined, 404);
await req(ra2, "/api/community?group=" + group.id, undefined, 403);
await req(outsider, "/api/community?room=" + assigned.id, undefined, 403);
let house = await req(student, "/api/household?id=" + assigned.id);
const today = new Date().toISOString().slice(0, 10);
async function stateAction(s, action, status = 200) {
  const result = await req(
    s,
    "/api/household?id=" + assigned.id,
    { version: house.version, action },
    status,
  );
  if (status === 200) house = result;
  return result;
}
await stateAction(student, {
  type: "add_expense",
  title: "PRIVATE_FINANCIAL_SENTINEL",
  cents: 4357,
  paidBy: student.id,
  category: "Groceries",
});
await stateAction(student, {
  type: "add_chore",
  title: "PRIVATE_CHORE_SENTINEL",
  person: student.id,
  date: today,
  area: "Kitchen",
  minutes: 10,
});
await stateAction(student, {
  type: "add_rule",
  title: "Quiet hours",
  detail: "Headphones after 10 PM.",
  category: "Noise",
});
await stateAction(student, {
  type: "add_booking",
  title: "Study group",
  date: today,
  start: "16:00",
  end: "17:00",
  space: "Living room",
});
await stateAction(
  mate,
  {
    type: "add_booking",
    title: "Conflict",
    date: today,
    start: "16:30",
    end: "17:30",
    space: "Living room",
  },
  400,
);
await stateAction(mate, {
  type: "vote_rule",
  id: house.state.rules[0].id,
  agreed: true,
});
await stateAction(mate, {
  type: "settle_expense",
  id: house.state.expenses[0].id,
  settled: true,
});
await req(
  student,
  "/api/messages",
  { householdId: assigned.id, body: "PRIVATE_ROOMMATE_SENTINEL" },
  201,
);
let chat = await req(mate, "/api/messages?room=" + assigned.id);
check(
  chat.messages.some((m) => m.body === "PRIVATE_ROOMMATE_SENTINEL"),
  "Private roommate messages persist for room members.",
);
await req(ra, "/api/messages?room=" + assigned.id, undefined, 404);
await req(
  ra,
  "/api/messages",
  { householdId: assigned.id, body: "Intrusion" },
  403,
);
await req(outsider, "/api/household?id=" + assigned.id, undefined, 404);
data = await req(ra, "/api/community?group=" + group.id);
check(
  !JSON.stringify(data).includes("SENTINEL"),
  "RA response contains no expense, individual chore, activity, or private message data.",
);
check(
  data.rooms[0].choreSummary === null,
  "Chore completion defaults to private.",
);
check(
  data.rooms[0].rules[0].title === "Quiet hours",
  "Room rules appear in the floor projection.",
);
check(
  data.rooms[0].residents.every((r) => !r.email && !r.phone),
  "Resident email and phone default to private in SQL.",
);
check(
  data.group.verified === false,
  "Floor ownership never asserts verified university RA status.",
);
await req(student, "/api/auth", {
  type: "profile",
  name: "QA resident",
  bio: "IT student",
  phone: "555-0101",
  shareEmail: true,
  sharePhone: true,
});
data = await req(ra, "/api/community?group=" + group.id);
const contact = data.rooms[0].residents.find((r) => r.id === student.id);
check(
  contact.email === student.email && contact.phone === "555-0101",
  "Only opted-in contact information is returned to the RA.",
);
await req(student, "/api/auth", {
  type: "profile",
  name: "QA resident",
  bio: "IT student",
  shareEmail: false,
  sharePhone: false,
});
data = await req(ra, "/api/community?group=" + group.id);
check(
  data.rooms[0].residents.every((r) => !r.email && !r.phone),
  "Revoking contact sharing removes it from subsequent RA responses.",
);
await req(
  mate,
  "/api/rooms",
  { type: "share_chores", householdId: assigned.id, enabled: true },
  403,
);
await req(student, "/api/rooms", {
  type: "share_chores",
  householdId: assigned.id,
  enabled: true,
});
data = await req(ra, "/api/community?group=" + group.id);
check(
  data.rooms[0].choreSummary.total === 1 &&
    !JSON.stringify(data).includes("PRIVATE_CHORE_SENTINEL"),
  "Opt-in exposes only room-level chore totals.",
);
await req(mate, "/api/rooms", {
  type: "share_chores",
  householdId: assigned.id,
  enabled: false,
});
const photo =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6xWQAAAAASUVORK5CYII=";
const maintenance = await req(
  student,
  "/api/community",
  {
    type: "report",
    householdId: assigned.id,
    title: "Leaky faucet",
    body: "The kitchen tap drips.",
    category: "Maintenance",
    photo,
  },
  201,
);
const help = await req(
  student,
  "/api/community",
  {
    type: "report",
    householdId: assigned.id,
    title: "PRIVATE_HELP_SENTINEL",
    body: "Please talk privately.",
    category: "Private help",
  },
  201,
);
data = await req(mate, "/api/community?room=" + assigned.id);
check(
  data.reports.some((r) => r.id === maintenance.id) &&
    !data.reports.some((r) => r.id === help.id),
  "Roommates can see maintenance but cannot read another resident’s private help request.",
);
await req(
  mate,
  "/api/community",
  { type: "update_request", reportId: help.id, body: "Intrusion" },
  403,
);
await req(
  ra2,
  "/api/community",
  { type: "status", reportId: help.id, status: "Resolved" },
  403,
);
await req(
  student,
  "/api/community",
  { type: "status", reportId: maintenance.id, status: "Resolved" },
  403,
);
await req(ra, "/api/community", {
  type: "status",
  reportId: maintenance.id,
  status: "In progress",
});
await req(ra, "/api/community", {
  type: "update_request",
  reportId: maintenance.id,
  body: "Maintenance has been contacted.",
});
await req(ra, "/api/community", {
  type: "update_request",
  reportId: help.id,
  body: "Let’s meet tomorrow.",
});
await req(student, "/api/community", {
  type: "update_request",
  reportId: help.id,
  body: "Thank you.",
});
data = await req(student, "/api/community?room=" + assigned.id);
check(
  data.reports.find((r) => r.id === help.id).updates.length === 2,
  "Private help updates are visible to the authorized author and manager.",
);
check(
  data.reports.find((r) => r.id === maintenance.id).photo === photo &&
    data.reports.find((r) => r.id === maintenance.id).status === "In progress",
  "Maintenance photos, status, and updates persist in Neon.",
);
await req(ra, "/api/community", {
  type: "announce",
  groupId: group.id,
  title: "Floor meeting",
  body: "Thursday at 7 PM.",
});
await req(ra, "/api/community", {
  type: "floor_rules",
  groupId: group.id,
  body: "Respect quiet hours.",
});
data = await req(student, "/api/community?room=" + assigned.id);
check(
  data.announcements[0].title === "Floor meeting" &&
    data.group.rules === "Respect quiet hours.",
  "Residents receive floor announcements and floor rules.",
);
check(
  !data.group.inviteCode,
  "Residents never receive the floor connection code.",
);
await req(
  mate,
  "/api/rooms",
  { type: "transfer", householdId: assigned.id, userId: mate.id },
  403,
);
await req(
  student,
  "/api/rooms",
  { type: "leave", householdId: assigned.id },
  409,
);
await req(
  student,
  "/api/auth",
  {
    type: "delete_account",
    password: student.password,
    confirmation: "DELETE",
  },
  409,
);
const independent = await req(
  outsider,
  "/api/rooms",
  { type: "create", name: "Independent room 912" },
  201,
);
const independentBefore = await req(
  outsider,
  "/api/household?id=" + independent.id,
);
check(
  independentBefore.state.expenses.length === 0,
  "Independent room creation uses a real empty database-backed household.",
);
await req(
  outsider,
  "/api/community",
  {
    type: "connect_room",
    householdId: independent.id,
    code: floorCode,
    roomLabel: "901",
  },
  409,
);
await req(outsider, "/api/community", {
  type: "connect_room",
  householdId: independent.id,
  code: floorCode,
  roomLabel: "912",
});
data = await req(ra, "/api/community?group=" + group.id);
check(
  !data.rooms.some((r) => r.id === independent.id) &&
    data.connections.length === 1,
  "Existing-room connection remains pending until explicit approval.",
);
let connection = data.connections[0];
await req(
  ra2,
  "/api/community",
  { type: "approve_connection", requestId: connection.id },
  403,
);
await req(ra, "/api/community", {
  type: "approve_connection",
  requestId: connection.id,
});
data = await req(ra, "/api/community?group=" + group.id);
check(
  data.rooms.some((r) => r.id === independent.id),
  "Approving connects the existing room.",
);
const independentAfter = await req(
  outsider,
  "/api/household?id=" + independent.id,
);
check(
  JSON.stringify(independentBefore.state) ===
    JSON.stringify(independentAfter.state),
  "Connecting preserves existing household state.",
);
data = await req(outsider, "/api/community?room=" + independent.id);
check(
  !JSON.stringify(data).includes("PRIVATE_HELP_SENTINEL"),
  "Another room cannot read neighboring maintenance or help requests.",
);
await req(outsider, "/api/rooms", {
  type: "share_chores",
  householdId: independent.id,
  enabled: true,
});
await req(outsider, "/api/community", {
  type: "disconnect",
  householdId: independent.id,
});
data = await req(ra, "/api/community?group=" + group.id);
check(
  !data.rooms.some((r) => r.id === independent.id),
  "Disconnecting immediately removes the room from the floor directory.",
);
const afterDisconnect = await req(outsider, "/api/rooms");
check(
  afterDisconnect.rooms.find((r) => r.id === independent.id).shareChores ===
    false,
  "Disconnecting revokes aggregate chore-sharing consent in the database.",
);

await req(student, "/api/rooms", {
  type: "revoke_invite",
  householdId: assigned.id,
});
await req(outsider, "/api/rooms", { type: "join", code: roomCode }, 409);
await req(student, "/api/rooms", {
  type: "rotate_invite",
  householdId: assigned.id,
});
rooms = await req(student, "/api/rooms");
const newCode = rooms.rooms.find((r) => r.id === assigned.id).inviteCode;
check(
  newCode !== roomCode && newCode.length === 32,
  "Room invitation regeneration replaces the old random code.",
);
await req(outsider, "/api/rooms", { type: "join", code: roomCode }, 409);
await req(outsider, "/api/rooms", { type: "join", code: newCode });
await req(
  ra2,
  "/api/rooms",
  { type: "remove_member", householdId: assigned.id, userId: outsider.id },
  403,
);
await req(
  ra,
  "/api/rooms",
  { type: "remove_member", householdId: assigned.id, userId: student.id },
  409,
);
await req(ra, "/api/rooms", {
  type: "remove_member",
  householdId: assigned.id,
  userId: outsider.id,
});
await req(outsider, "/api/household?id=" + assigned.id, undefined, 404);
check(
  true,
  "Only the assigned manager can remove non-owner residents; room ownership remains protected.",
);
await req(ra, "/api/community", { type: "rotate_group", groupId: group.id });
await req(
  outsider,
  "/api/community",
  {
    type: "connect_room",
    householdId: independent.id,
    code: floorCode,
    roomLabel: "912",
  },
  409,
);
listing = await req(ra, "/api/community");
floorCode = listing.groups.find((g) => g.id === group.id).inviteCode;
await req(ra, "/api/community", { type: "revoke_group", groupId: group.id });
await req(
  outsider,
  "/api/community",
  {
    type: "connect_room",
    householdId: independent.id,
    code: floorCode,
    roomLabel: "912",
  },
  409,
);
await req(student, "/api/rooms", {
  type: "transfer",
  householdId: assigned.id,
  userId: mate.id,
});
await req(
  student,
  "/api/rooms",
  { type: "rotate_invite", householdId: assigned.id },
  403,
);
await req(mate, "/api/rooms", {
  type: "remove_member",
  householdId: assigned.id,
  userId: student.id,
});
await req(student, "/api/household?id=" + assigned.id, undefined, 404);
await req(student, "/api/messages?room=" + assigned.id, undefined, 404);
const stale = await req(mate, "/api/household?id=" + assigned.id);
await req(mate, "/api/rooms", {
  type: "rotate_invite",
  householdId: assigned.id,
});
await req(
  mate,
  "/api/household?id=" + assigned.id,
  {
    version: stale.version,
    action: { type: "set_chore", id: house.state.chores[0].id, done: true },
  },
  409,
);
check(
  true,
  "Room membership/invitation changes participate in optimistic state conflict protection.",
);
const doomed = await account("delete-me");
const doomedRoom = await req(
  doomed,
  "/api/rooms",
  { type: "create", name: "Disposable solo room" },
  201,
);
await req(
  doomed,
  "/api/auth",
  {
    type: "delete_account",
    password: "wrong password",
    confirmation: "DELETE",
  },
  403,
);
await req(doomed, "/api/auth", {
  type: "delete_account",
  password: doomed.password,
  confirmation: "DELETE",
});
await req(doomed, "/api/rooms", undefined, 401);
check(
  (await db`SELECT id FROM roomie_users WHERE id=${doomed.id}`).length === 0 &&
    (await db`SELECT id FROM roomie_households WHERE id=${doomedRoom.id}`)
      .length === 0,
  "Permanent account deletion removes the account, sessions, and sole-owned room.",
);
const ownerBeforeDelete = (await req(mate, "/api/household?id=" + assigned.id))
  .state;
await req(ra, "/api/auth", {
  type: "delete_account",
  password: ra.password,
  confirmation: "DELETE",
});
const preserved = (await req(mate, "/api/household?id=" + assigned.id)).state;
check(
  JSON.stringify(ownerBeforeDelete) === JSON.stringify(preserved),
  "Deleting a floor manager preserves occupied rooms and existing private room data.",
);
const cross = await fetch(base + "/api/rooms", {
  method: "POST",
  headers: {
    origin: "https://attacker.example",
    "Content-Type": "application/json",
    cookie: mate.cookie,
  },
  body: JSON.stringify({ type: "create", name: "CSRF" }),
});
check(cross.status === 403, "Cross-origin mutations are rejected.");
await req(mate, "/api/health");
await mkdir(".sites-runtime", { recursive: true });
const report = {
  date: new Date().toISOString(),
  branch: process.env.ROOMIE_TEST_DB_HOST,
  checks,
  cases,
  status: "passed",
};
await writeFile(
  ".sites-runtime/full-system-test-results.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
