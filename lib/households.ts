import { and, eq } from "drizzle-orm";
import { getNeonDb } from "@/db/neon";
import { households, memberships, users } from "@/db/schema";
import { profilePerson } from "@/lib/roomie";
export async function readHouse(id: string, userId: string) {
  const db = getNeonDb();
  const [house] = await db.select({ id: households.id, name: households.name, inviteCode: households.inviteCode, state: households.state, version: households.version })
    .from(households).innerJoin(memberships, eq(memberships.householdId, households.id))
    .where(and(eq(households.id, id), eq(memberships.userId, userId)));
  if (!house) return null;
  const members = await db.select({ id: users.person, name: users.name, bio: users.bio }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.householdId, id)).orderBy(memberships.joinedAt, users.id);
  return { state: house.state, version: house.version, household: { id: house.id, name: house.name, inviteCode: house.inviteCode }, members: members.map((p,i) => profilePerson(p.id,p.name,i,p.bio)) };
}
