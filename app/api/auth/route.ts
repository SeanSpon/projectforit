import { eq } from "drizzle-orm";
import { z } from "zod";
import { getNeonDb } from "@/db/neon";
import { users } from "@/db/schema";
import { currentUser, endSession, hashPassword, sameOrigin, startSession, verifyPassword } from "@/lib/auth";
import { people } from "@/lib/roomie";

const inputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("signup"), email: z.string().email().max(200), password: z.string().min(10).max(128), person: z.enum(["alex", "jordan", "maya", "eli"]) }),
  z.object({ type: z.literal("login"), email: z.string().email(), password: z.string() }),
  z.object({ type: z.literal("logout") }),
]);
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET() {
  try {
    const user = await currentUser();
    const claimed = await getNeonDb().select({ person: users.person }).from(users);
    return reply({ user, available: people.filter(p => !claimed.some(c => c.person === p.id)).map(p => p.id) });
  } catch { return reply({ error: "The database is unavailable." }, 503); }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return reply({ error: "Request origin is not allowed." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply({ error: "JSON required." }, 415);
  let raw: unknown;
  try { const body = await request.text(); if (body.length > 2048) return reply({ error: "Request too large." }, 413); raw = JSON.parse(body); }
  catch { return reply({ error: "Invalid JSON." }, 400); }
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return reply({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, 400);
  const value = parsed.data;
  try {
    if (value.type === "logout") { await endSession(); return reply({ user: null }); }
    const email = value.email.trim().toLowerCase();
    const db = getNeonDb();
    if (value.type === "signup") {
      const id = crypto.randomUUID();
      try { await db.insert(users).values({ id, email, person: value.person, passwordHash: await hashPassword(value.password) }); }
      catch { return reply({ error: "That email or roommate profile is already taken." }, 409); }
      await startSession(id, request);
      return reply({ user: { id, email, person: value.person } }, 201);
    }
    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user || !(await verifyPassword(value.password, user.passwordHash))) return reply({ error: "Wrong email or password." }, 401);
    await startSession(user.id, request);
    return reply({ user: { id: user.id, email, person: user.person } });
  } catch { return reply({ error: "Could not connect to the database. Try again." }, 503); }
}
