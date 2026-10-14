import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getNeonDb } from "@/db/neon";
import { households, memberships } from "@/db/schema";
import { currentUser, sameOrigin } from "@/lib/auth";
import { emptyState } from "@/lib/roomie";
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const schema = z.discriminatedUnion("type", [z.object({ type: z.literal("create"), name: z.string().trim().min(1).max(80) }).strict(),z.object({ type: z.literal("join"), code: z.string().trim().toUpperCase().regex(/^[A-F0-9]{16}$/, "Enter the 16-character invite code.") }).strict()]);
export async function GET() {
  try {
    const user = await currentUser(); if (!user) return reply({ error: "Sign in first." },401);
    const rooms = await getNeonDb().select({ id: households.id, name: households.name, inviteCode: households.inviteCode }).from(households).innerJoin(memberships,eq(memberships.householdId,households.id)).where(eq(memberships.userId,user.id));
    return reply({ rooms });
  } catch { return reply({ error: "Could not load your rooms." },503); }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return reply({ error: "Request origin is not allowed." },403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply({ error: "JSON required." },415);
  let input; try { const body = await request.text(); if(body.length > 2048) return reply({error:"Request too large."},413); input = schema.safeParse(JSON.parse(body)); } catch { return reply({error:"Invalid JSON."},400); }
  if (!input.success) return reply({error:input.error.issues[0]?.message},400);
  try {
    const user = await currentUser(); if(!user) return reply({error:"Sign in first."},401);
    const db = getNeonDb();
    if(input.data.type === "create") {
      const id=crypto.randomUUID(); const code=crypto.randomUUID().replaceAll("-","").slice(0,16).toUpperCase();
      // One statement makes house creation and owner membership atomic over HTTP.
      await db.execute(sql`WITH new_house AS (INSERT INTO roomie_households (id,name,invite_code,owner_id,state) VALUES (${id},${input.data.name},${code},${user.id},${JSON.stringify(emptyState())}::jsonb) RETURNING id) INSERT INTO roomie_memberships (household_id,user_id) SELECT id,${user.id} FROM new_house`);
      return reply({id},201);
    }
    const [house] = await db.select({id:households.id}).from(households).where(eq(households.inviteCode,input.data.code));
    if(!house) return reply({error:"No room matches that invite code."},404);
    // Lock the household when membership changes so expense creation uses a stable member list.
    await db.execute(sql`WITH bumped AS (UPDATE roomie_households SET version=version+1 WHERE id=${house.id} RETURNING id) INSERT INTO roomie_memberships (household_id,user_id) SELECT id,${user.id} FROM bumped ON CONFLICT DO NOTHING`);
    return reply({id:house.id});
  } catch { return reply({error:"Could not save your room. Try again."},503); }
}
