import { sql } from "drizzle-orm";
import { z } from "zod";
import { getNeonDb } from "@/db/neon";
import { currentUser } from "@/lib/auth";
import { readHouse } from "@/lib/households";
import { reply, apiError, parseRequest, id, body } from "@/lib/api";
export async function GET(request: Request) {
  try {
    const user = await currentUser();
    if (!user) return reply({ error: "Sign in first." }, 401);
    const room = new URL(request.url).searchParams.get("room") || "";
    if (!(await readHouse(room, user.id)))
      return reply({ error: "Room not found." }, 404);
    const result = await getNeonDb().execute(
      sql`SELECT m.id,m.body,u.name AS sender,m.sender_id AS "senderId",m.created_at AS "createdAt" FROM roomie_room_messages m JOIN roomie_users u ON u.id=m.sender_id WHERE m.household_id=${room} ORDER BY m.created_at DESC,m.id DESC LIMIT 200`,
    );
    return reply({ messages: result.rows.reverse() });
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  try {
    const { user, data } = await parseRequest(
      request,
      z.object({ householdId: id, body }).strict(),
    );
    const result = await getNeonDb().execute(
      sql`WITH allowed AS (SELECT h.id FROM roomie_households h JOIN roomie_memberships m ON m.household_id=h.id WHERE h.id=${data.householdId} AND m.user_id=${user.id} AND NOT EXISTS(SELECT 1 FROM roomie_group_rooms gr JOIN roomie_residence_groups g ON g.id=gr.group_id WHERE gr.household_id=h.id AND g.owner_id=${user.id}) FOR UPDATE OF h) INSERT INTO roomie_room_messages(id,household_id,sender_id,body) SELECT ${crypto.randomUUID()},id,${user.id},${data.body} FROM allowed RETURNING id`,
    );
    return result.rows.length
      ? reply({ ok: true }, 201)
      : reply({ error: "Only current roommates can send messages." }, 403);
  } catch (e) {
    return apiError(e);
  }
}
