import { eq } from "drizzle-orm";
import { z } from "zod";
import { getNeonDb } from "@/db/neon";
import { users } from "@/db/schema";
import { currentUser, endSession, hashPassword, sameOrigin, startSession, verifyPassword } from "@/lib/auth";
const email = z.string().trim().toLowerCase().email().max(200);
const inputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("signup"), email, password: z.string().min(10, "Use at least 10 characters.").max(128), name: z.string().trim().min(1, "Enter your name.").max(60) }).strict(),
  z.object({ type: z.literal("login"), email, password: z.string().min(1).max(128) }).strict(),
  z.object({ type: z.literal("profile"), name: z.string().trim().min(1).max(60), bio: z.string().trim().max(300) }).strict(),
  z.object({ type: z.literal("logout") }).strict(),
]);
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function GET() {
  try { return reply({ user: await currentUser() }); }
  catch { return reply({ error: "The database is unavailable. Please try again." }, 503); }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return reply({ error: "Request origin is not allowed." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply({ error: "JSON required." }, 415);
  let raw: unknown;
  try { const body = await request.text(); if (body.length > 4096) return reply({ error: "Request too large." }, 413); raw = JSON.parse(body); }
  catch { return reply({ error: "Invalid JSON." }, 400); }
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return reply({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, 400);
  const value = parsed.data;
  try {
    if (value.type === "logout") { await endSession(); return reply({ user: null }); }
    const db = getNeonDb();
    if (value.type === "profile") {
      const user = await currentUser(); if (!user) return reply({ error: "Sign in first." }, 401);
      await db.update(users).set({ name: value.name, bio: value.bio }).where(eq(users.id, user.id));
      return reply({ user: { ...user, name: value.name, bio: value.bio } });
    }
    if (value.type === "signup") {
      const id = crypto.randomUUID();
      // ON CONFLICT only handles duplicate emails; connection failures remain 503.
      const rows = await db.insert(users).values({ id, email: value.email, person: id, name: value.name, passwordHash: await hashPassword(value.password) }).onConflictDoNothing().returning({ id: users.id });
      if (!rows.length) return reply({ error: "That email already has an account. Sign in instead." }, 409);
      await startSession(id, request);
      return reply({ user: { id, email: value.email, person: id, name: value.name, bio: "", role: "student" } }, 201);
    }
    const [user] = await db.select().from(users).where(eq(users.email, value.email));
    if (!user || !(await verifyPassword(value.password, user.passwordHash))) return reply({ error: "Wrong email or password." }, 401);
    await startSession(user.id, request);
    return reply({ user: { id: user.id, email: user.email, person: user.person, name: user.name, bio: user.bio, role: user.role } });
  } catch { return reply({ error: "Could not connect to the database. Try again." }, 503); }
}
