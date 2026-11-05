import { and, eq, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { getNeonDb } from "@/db/neon";
import { residenceGroups as groups, groupRooms, households, memberships, users, residenceMessages as messages, residenceReports as reports, residenceAnnouncements as notices } from "@/db/schema";
import { currentUser, sameOrigin } from "@/lib/auth";
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const id = z.string().uuid();
const short = z.string().trim().min(1).max(80);
const body = z.string().trim().min(1).max(2000);
const schema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("activate"), code: z.string().trim().regex(/^[A-Fa-f0-9]{32}$/) }).strict(),
  z.object({ type: z.literal("create_group"), name: short, building: short, floor: z.string().trim().min(1).max(20) }).strict(),
  z.object({ type: z.literal("connect_room"), householdId: id, code: z.string().trim().toUpperCase().regex(/^[A-F0-9]{16}$/) }).strict(),
  z.object({ type: z.literal("message"), householdId: id, body }).strict(),
  z.object({ type: z.literal("report"), householdId: id, title: short, body, category: z.enum(["Maintenance", "Roommate concern", "Question", "Other"]) }).strict(),
  z.object({ type: z.literal("status"), reportId: id, status: z.enum(["Open", "In progress", "Resolved"]) }).strict(),
  z.object({ type: z.literal("announce"), groupId: id, title: short, body }).strict(),
]);
async function accessRoom(householdId: string, userId: string) {
  const db = getNeonDb();
  const [link] = await db.select({ groupId: groups.id, ownerId: groups.ownerId, householdId: households.id }).from(groupRooms)
    .innerJoin(groups, eq(groups.id, groupRooms.groupId)).innerJoin(households, eq(households.id, groupRooms.householdId)).where(eq(households.id, householdId));
  if (!link) return null;
  if (link.ownerId === userId) return { ...link, isRA: true };
  const [member] = await db.select().from(memberships).where(and(eq(memberships.householdId, householdId), eq(memberships.userId, userId)));
  return member ? { ...link, isRA: false } : null;
}
export async function GET(request: Request) {
  try {
    const user = await currentUser(); if (!user) return reply({ error: "Sign in first." }, 401);
    const db = getNeonDb(), params = new URL(request.url).searchParams;
    const householdId = params.get("room"), groupId = params.get("group");
    if (!householdId && !groupId) {
      const owned = user.role === "ra" ? await db.select({ id: groups.id, name: groups.name, building: groups.building, floor: groups.floor, inviteCode: groups.inviteCode }).from(groups).where(eq(groups.ownerId, user.id)) : [];
      return reply({ groups: owned, role: user.role });
    }
    let selectedId: string, isRA: boolean;
    if (householdId) {
      const [member] = await db.select().from(memberships).where(and(eq(memberships.householdId, householdId), eq(memberships.userId, user.id)));
      if (!member) return reply({ error: "Room not found." }, 404);
      const link = await accessRoom(householdId, user.id);
      if (!link) return reply({ group: null, rooms: [], messages: [], reports: [], announcements: [], isRA: false });
      selectedId = link.groupId; isRA = false;
    } else {
      const [owned] = await db.select().from(groups).where(and(eq(groups.id, groupId!), eq(groups.ownerId, user.id)));
      if (!owned || user.role !== "ra") return reply({ error: "Group not found." }, 404);
      selectedId = owned.id; isRA = true;
    }
    const [group] = await db.select({ id: groups.id, name: groups.name, building: groups.building, floor: groups.floor, inviteCode: groups.inviteCode, raName: users.name }).from(groups).innerJoin(users, eq(users.id, groups.ownerId)).where(eq(groups.id, selectedId));
    // Residents never receive the RA's group connection code or other rooms' data.
    const roomFilter = isRA ? eq(groupRooms.groupId, selectedId) : and(eq(groupRooms.groupId, selectedId), eq(groupRooms.householdId, householdId!));
    const roomRows = await db.select({ id: households.id, name: households.name }).from(groupRooms).innerJoin(households, eq(households.id, groupRooms.householdId)).where(roomFilter);
    const residents = await db.select({ roomId: memberships.householdId, id: users.id, name: users.name, email: users.email }).from(groupRooms).innerJoin(memberships, eq(memberships.householdId, groupRooms.householdId)).innerJoin(users, eq(users.id, memberships.userId)).where(roomFilter);
    const messageFilter = isRA ? eq(messages.groupId, selectedId) : and(eq(messages.groupId, selectedId), eq(messages.householdId, householdId!));
    const reportFilter = isRA ? eq(reports.groupId, selectedId) : and(eq(reports.groupId, selectedId), eq(reports.householdId, householdId!));
    const [chat, issues, announcements] = await Promise.all([
      db.select({ id: messages.id, roomId: messages.householdId, senderId: messages.senderId, sender: users.name, body: messages.body, createdAt: messages.createdAt }).from(messages).innerJoin(users, eq(users.id, messages.senderId)).where(messageFilter).orderBy(desc(messages.createdAt), desc(messages.id)).limit(200),
      db.select().from(reports).where(reportFilter).orderBy(desc(reports.createdAt)).limit(200),
      db.select().from(notices).where(eq(notices.groupId, selectedId)).orderBy(desc(notices.createdAt)).limit(50),
    ]);
    return reply({ group: { ...group, inviteCode: isRA ? group.inviteCode : undefined }, isRA, rooms: roomRows.map(r => ({ ...r, residents: residents.filter(p => p.roomId === r.id) })), messages: chat.reverse(), reports: issues, announcements });
  } catch { return reply({ error: "Could not load your community. Try again." }, 503); }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return reply({ error: "Request origin is not allowed." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply({ error: "JSON required." }, 415);
  let input; try { const raw = await request.text(); if (raw.length > 12000) return reply({ error: "Request too large." }, 413); input = schema.safeParse(JSON.parse(raw)); } catch { return reply({ error: "Invalid JSON." }, 400); }
  if (!input.success) return reply({ error: input.error.issues[0]?.message ?? "Invalid input." }, 400);
  try {
    const user = await currentUser(); if (!user) return reply({ error: "Sign in first." }, 401);
    const data = input.data, db = getNeonDb();
    if (data.type === "activate") {
      const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data.code.toLowerCase())));
      const hash = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
      const result = await db.execute(sql`WITH claimed AS (UPDATE roomie_ra_invites SET consumed_at=now() WHERE code_hash=${hash} AND email=${user.email} AND consumed_at IS NULL AND expires_at>now() RETURNING email) UPDATE roomie_users SET role='ra' WHERE id=${user.id} AND email IN (SELECT email FROM claimed) RETURNING id`);
      if (!result.rows.length) return reply({ error: "That RA invitation is invalid, expired, already used, or belongs to another email." }, 403);
      return reply({ ok: true, role: "ra" });
    }
    if (data.type === "create_group") {
      if (user.role !== "ra") return reply({ error: "An RA invitation is required." }, 403);
      const groupId = crypto.randomUUID(), inviteCode = crypto.randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase();
      await db.insert(groups).values({ id: groupId, name: data.name, building: data.building, floor: data.floor, ownerId: user.id, inviteCode });
      return reply({ ok: true, id: groupId }, 201);
    }
    if (data.type === "connect_room") {
      const [room] = await db.select().from(households).where(and(eq(households.id, data.householdId), eq(households.ownerId, user.id)));
      if (!room) return reply({ error: "Only the room creator can connect its RA group." }, 403);
      const [group] = await db.select().from(groups).where(eq(groups.inviteCode, data.code));
      if (!group) return reply({ error: "No RA group matches that code." }, 404);
      const inserted = await db.insert(groupRooms).values({ householdId: room.id, groupId: group.id }).onConflictDoNothing().returning();
      if (!inserted.length) return reply({ error: "This room is already connected to an RA group." }, 409);
      return reply({ ok: true });
    }
    if (data.type === "announce") {
      const [group] = await db.select().from(groups).where(and(eq(groups.id, data.groupId), eq(groups.ownerId, user.id)));
      if (!group || user.role !== "ra") return reply({ error: "Only the assigned RA can post here." }, 403);
      await db.insert(notices).values({ id: crypto.randomUUID(), groupId: group.id, authorId: user.id, title: data.title, body: data.body });
    } else if (data.type === "status") {
      const [issue] = await db.select({ id: reports.id }).from(reports).innerJoin(groups, eq(groups.id, reports.groupId)).where(and(eq(reports.id, data.reportId), eq(groups.ownerId, user.id)));
      if (!issue || user.role !== "ra") return reply({ error: "Only the assigned RA can update that report." }, 403);
      await db.update(reports).set({ status: data.status }).where(eq(reports.id, issue.id));
    } else {
      const access = await accessRoom(data.householdId, user.id);
      if (!access) return reply({ error: "Room not found or no RA is connected." }, 404);
      if (data.type === "message") await db.insert(messages).values({ id: crypto.randomUUID(), groupId: access.groupId, householdId: data.householdId, senderId: user.id, body: data.body });
      else {
        if (access.isRA) return reply({ error: "Residents submit reports from their own room." }, 403);
        await db.insert(reports).values({ id: crypto.randomUUID(), groupId: access.groupId, householdId: data.householdId, authorId: user.id, title: data.title, body: data.body, category: data.category });
      }
    }
    return reply({ ok: true });
  } catch { return reply({ error: "Could not save your community update. Try again." }, 503); }
}
