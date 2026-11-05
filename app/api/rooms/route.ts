import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getNeonDb } from "@/db/neon";
import { households, memberships } from "@/db/schema";
import { listRooms } from "@/lib/households";
import { currentUser } from "@/lib/auth";
import {
  reply,
  apiError,
  parseRequest,
  short,
  id,
  code,
  invitation,
} from "@/lib/api";
const schema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("create"), name: short }).strict(),
  z.object({ type: z.literal("join"), code }).strict(),
  ...(["rotate_invite", "revoke_invite", "leave"] as const).map((type) =>
    z.object({ type: z.literal(type), householdId: id }).strict(),
  ),
  z
    .object({ type: z.literal("transfer"), householdId: id, userId: id })
    .strict(),
  z
    .object({ type: z.literal("remove_member"), householdId: id, userId: id })
    .strict(),
  z
    .object({
      type: z.literal("share_chores"),
      householdId: id,
      enabled: z.boolean(),
    })
    .strict(),
]);
export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return reply({ error: "Sign in first." }, 401);
    const rooms = await listRooms(user.id);
    return reply({ rooms });
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  try {
    const { user, data } = await parseRequest(request, schema);
    const payload = {
      ...data,
      ...(data.type === "create" || data.type === "rotate_invite"
        ? { code: invitation() }
        : {}),
    };
    const result = await getNeonDb().execute(
      sql`SELECT roomie_room_action(${user.id},${JSON.stringify(payload)}::jsonb) AS result`,
    );
    return reply(result.rows[0].result, data.type === "create" ? 201 : 200);
  } catch (e) {
    return apiError(e);
  }
}
