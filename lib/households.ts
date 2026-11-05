import { and, eq, sql } from "drizzle-orm";
import { getNeonDb } from "@/db/neon";
import { households, memberships, users } from "@/db/schema";
import { profilePerson } from "@/lib/roomie";
export async function readHouse(id: string, userId: string) {
  const db = getNeonDb();
  const [house] = await db
    .select({
      id: households.id,
      name: households.name,
      inviteCode: sql<string>`CASE WHEN ${households.ownerId}=${userId} AND ${households.inviteEnabled} THEN ${households.inviteCode} ELSE 'Ask your room owner' END`,
      state: households.state,
      version: households.version,
    })
    .from(households)
    .innerJoin(memberships, eq(memberships.householdId, households.id))
    .where(
      and(
        eq(households.id, id),
        eq(memberships.userId, userId),
        sql`NOT EXISTS(SELECT 1 FROM roomie_group_rooms gr JOIN roomie_residence_groups g ON g.id=gr.group_id WHERE gr.household_id=${households.id} AND g.owner_id=${userId})`,
      ),
    );
  if (!house) return null;
  const members = await db
    .select({ id: users.person, name: users.name, bio: users.bio })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.householdId, id))
    .orderBy(memberships.joinedAt, users.id);
  return {
    state: house.state,
    version: house.version,
    household: { id: house.id, name: house.name, inviteCode: house.inviteCode },
    members: members.map((p, i) => profilePerson(p.id, p.name, i, p.bio)),
  };
}

export async function listRooms(userId: string) {
  const rooms = await getNeonDb()
    .select({
      id: households.id,
      name: households.name,
      ownerId: households.ownerId,
      inviteCode: sql<
        string | null
      >`CASE WHEN ${households.ownerId}=${userId} THEN ${households.inviteCode} ELSE NULL END`,
      inviteEnabled: households.inviteEnabled,
      shareChores: households.shareChores,
      members: sql<
        { id: string; name: string }[]
      >`(SELECT coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.name)),'[]'::jsonb) FROM roomie_memberships mm JOIN roomie_users u ON u.id=mm.user_id WHERE mm.household_id=${households.id})`,
    })
    .from(households)
    .innerJoin(memberships, eq(memberships.householdId, households.id))
    .where(
      sql`${memberships.userId}=${userId} AND NOT EXISTS(SELECT 1 FROM roomie_group_rooms gr JOIN roomie_residence_groups g ON g.id=gr.group_id WHERE gr.household_id=${households.id} AND g.owner_id=${userId})`,
    );

  return rooms;
}
