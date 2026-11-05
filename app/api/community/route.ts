import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getNeonDb } from "@/db/neon";
import { residenceGroups as groups } from "@/db/schema";
import { currentUser } from "@/lib/auth";
import {
  reply,
  apiError,
  parseRequest,
  short,
  body,
  id,
  code,
  invitation,
} from "@/lib/api";
const photo = z
  .string()
  .max(700000)
  .regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/)
  .optional();
const schema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("create_group"),
      name: short,
      building: short,
      floor: z.string().trim().min(1).max(20),
    })
    .strict(),
  z
    .object({
      type: z.literal("create_room"),
      groupId: id,
      name: short,
      roomLabel: short,
    })
    .strict(),
  z
    .object({
      type: z.literal("connect_room"),
      householdId: id,
      code,
      roomLabel: short,
    })
    .strict(),
  ...(["approve_connection", "reject_connection"] as const).map((type) =>
    z.object({ type: z.literal(type), requestId: id }).strict(),
  ),
  ...(["disconnect", "cancel_connection"] as const).map((type) =>
    z.object({ type: z.literal(type), householdId: id }).strict(),
  ),
  z
    .object({
      type: z.literal("report"),
      householdId: id,
      title: short,
      body,
      category: z.enum(["Maintenance", "Private help"]),
      photo,
    })
    .strict(),
  z
    .object({
      type: z.literal("status"),
      reportId: id,
      status: z.enum(["Open", "In progress", "Resolved"]),
    })
    .strict(),
  z.object({ type: z.literal("update_request"), reportId: id, body }).strict(),
  z
    .object({ type: z.literal("announce"), groupId: id, title: short, body })
    .strict(),
  z
    .object({
      type: z.literal("floor_rules"),
      groupId: id,
      body: z.string().trim().max(4000),
    })
    .strict(),
  ...(["rotate_group", "revoke_group"] as const).map((type) =>
    z.object({ type: z.literal(type), groupId: id }).strict(),
  ),
]);
export async function GET(request: Request) {
  try {
    const user = await currentUser();
    if (!user) return reply({ error: "Sign in first." }, 401);
    const db = getNeonDb(),
      params = new URL(request.url).searchParams,
      room = params.get("room"),
      group = params.get("group");
    if (!room && !group)
      return reply({
        groups: await db
          .select({
            id: groups.id,
            name: groups.name,
            building: groups.building,
            floor: groups.floor,
            inviteCode: groups.inviteCode,
            inviteEnabled: groups.inviteEnabled,
          })
          .from(groups)
          .where(eq(groups.ownerId, user.id)),
      });
    if (
      (room && !id.safeParse(room).success) ||
      (group && !id.safeParse(group).success)
    )
      return reply({ error: "Invalid room or floor." }, 400);
    const result = await db.execute(
      sql`SELECT roomie_community_snapshot(${user.id},${group},${room}) AS result`,
    );
    return reply(result.rows[0].result);
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  try {
    const { user, data } = await parseRequest(request, schema, 720000);
    const payload = {
      ...data,
      ...(["create_group", "create_room", "rotate_group"].includes(data.type)
        ? { code: invitation() }
        : {}),
    };
    const result = await getNeonDb().execute(
      sql`SELECT roomie_community_action(${user.id},${JSON.stringify(payload)}::jsonb) AS result`,
    );
    return reply(
      result.rows[0].result,
      ["create_group", "create_room", "report"].includes(data.type) ? 201 : 200,
    );
  } catch (e) {
    return apiError(e);
  }
}
