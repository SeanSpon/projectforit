import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getNeonDb } from "@/db/neon";
import { users } from "@/db/schema";
import {
  currentUser,
  endSession,
  hashPassword,
  sameOrigin,
  startSession,
  verifyPassword,
} from "@/lib/auth";
const email = z.string().trim().toLowerCase().email().max(200);
const inputSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("signup"),
      email,
      password: z.string().min(10, "Use at least 10 characters.").max(128),
      name: z.string().trim().min(1, "Enter your name.").max(60),
      role: z.enum(["student", "ra"]).default("student"),
    })
    .strict(),
  z
    .object({
      type: z.literal("login"),
      email,
      password: z.string().min(1).max(128),
    })
    .strict(),
  z
    .object({
      type: z.literal("profile"),
      name: z.string().trim().min(1).max(60),
      bio: z.string().trim().max(300),
      phone: z
        .string()
        .trim()
        .max(40)
        .regex(/^[+0-9 ()\-.]*$/)
        .optional(),
      shareEmail: z.boolean().optional(),
      sharePhone: z.boolean().optional(),
      role: z.enum(["student", "ra"]).optional(),
    })
    .strict(),
  z.object({ type: z.literal("logout") }).strict(),
  z
    .object({ type: z.literal("role"), role: z.enum(["student", "ra"]) })
    .strict(),
  z
    .object({
      type: z.literal("delete_account"),
      password: z.string().min(1).max(128),
      confirmation: z.literal("DELETE"),
    })
    .strict(),
]);
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function GET() {
  try {
    return reply({ user: await currentUser() });
  } catch {
    return reply(
      { error: "The database is unavailable. Please try again." },
      503,
    );
  }
}
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return reply({ error: "Request origin is not allowed." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return reply({ error: "JSON required." }, 415);
  let raw: unknown;
  try {
    const body = await request.text();
    if (body.length > 4096) return reply({ error: "Request too large." }, 413);
    raw = JSON.parse(body);
  } catch {
    return reply({ error: "Invalid JSON." }, 400);
  }
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success)
    return reply(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      400,
    );
  const value = parsed.data;
  try {
    if (value.type === "logout") {
      await endSession();
      return reply({ user: null });
    }
    const db = getNeonDb();
    if (value.type === "role") {
      const user = await currentUser();
      if (!user) return reply({ error: "Sign in first." }, 401);
      await db
        .update(users)
        .set({ role: value.role })
        .where(eq(users.id, user.id));
      return reply({ user: { ...user, role: value.role } });
    }
    if (value.type === "delete_account") {
      const user = await currentUser();
      if (!user) return reply({ error: "Sign in first." }, 401);
      const [record] = await db
        .select({ passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, user.id));
      if (
        !record ||
        !(await verifyPassword(value.password, record.passwordHash))
      )
        return reply({ error: "Password does not match." }, 403);
      try {
        await db.execute(sql`SELECT roomie_delete_account(${user.id})`);
      } catch (e) {
        let cause = e as { cause?: unknown; code?: string; message?: string };
        while (cause.cause) cause = cause.cause as typeof cause;
        if (cause.code === "P0001") return reply({ error: cause.message }, 409);
        throw e;
      }
      await endSession();
      return reply({ user: null, deleted: true });
    }
    if (value.type === "profile") {
      const user = await currentUser();
      if (!user) return reply({ error: "Sign in first." }, 401);
      const { type, ...changes } = value;
      void type;
      await db.update(users).set(changes).where(eq(users.id, user.id));
      return reply({ user: { ...user, ...changes } });
    }
    if (value.type === "signup") {
      const id = crypto.randomUUID();
      // ON CONFLICT only handles duplicate emails; connection failures remain 503.
      const rows = await db
        .insert(users)
        .values({
          id,
          email: value.email,
          person: id,
          name: value.name,
          role: value.role,
          passwordHash: await hashPassword(value.password),
        })
        .onConflictDoNothing()
        .returning({ id: users.id });
      if (!rows.length)
        return reply(
          { error: "That email already has an account. Sign in instead." },
          409,
        );
      await startSession(id, request);
      return reply(
        {
          user: {
            id,
            email: value.email,
            person: id,
            name: value.name,
            bio: "",
            role: value.role,
            phone: "",
            shareEmail: false,
            sharePhone: false,
          },
        },
        201,
      );
    }
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, value.email));
    if (!user || !(await verifyPassword(value.password, user.passwordHash)))
      return reply({ error: "Wrong email or password." }, 401);
    await startSession(user.id, request);
    return reply({
      user: {
        id: user.id,
        email: user.email,
        person: user.person,
        name: user.name,
        bio: user.bio,
        role: user.role,
        phone: user.phone,
        shareEmail: user.shareEmail,
        sharePhone: user.sharePhone,
      },
    });
  } catch {
    return reply(
      { error: "Could not connect to the database. Try again." },
      503,
    );
  }
}
