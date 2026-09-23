import { cookies } from "next/headers";
import { eq, gt, and } from "drizzle-orm";
import { getNeonDb } from "@/db/neon";
import { sessions, users } from "@/db/schema";

const cookieName = "roomie_session";
const encoder = new TextEncoder();
const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer), b => b.toString(16).padStart(2, "0")).join("");
const digest = async (value: string) => hex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 210000, hash: "SHA-256" }, key, 256);
  return `pbkdf2:210000:${hex(salt.buffer)}:${hex(bits)}`;
}

export async function verifyPassword(password: string, saved: string) {
  const [algorithm, count, saltHex, hash] = saved.split(":");
  if (algorithm !== "pbkdf2" || count !== "210000" || !saltHex || !hash) return false;
  const salt = Uint8Array.from(saltHex.match(/../g) ?? [], byte => parseInt(byte, 16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const actual = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 210000, hash: "SHA-256" }, key, 256));
  const expected = Uint8Array.from(hash.match(/../g) ?? [], byte => parseInt(byte, 16));
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < actual.length; i++) difference |= actual[i] ^ expected[i];
  return difference === 0;
}

export async function currentUser() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  const db = getNeonDb();
  const [result] = await db.select({ id: users.id, email: users.email, person: users.person })
    .from(sessions).innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, await digest(token)), gt(sessions.expiresAt, new Date())));
  return result ?? null;
}

export async function startSession(userId: string, request: Request) {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = hex(bytes.buffer);
  const maxAge = 60 * 60 * 24 * 14;
  await getNeonDb().insert(sessions).values({ tokenHash: await digest(token), userId, expiresAt: new Date(Date.now() + maxAge * 1000) });
  (await cookies()).set(cookieName, token, { httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "lax", path: "/", maxAge });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (token) await getNeonDb().delete(sessions).where(eq(sessions.tokenHash, await digest(token)));
  jar.delete(cookieName);
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || request.headers.get("sec-fetch-site") === "cross-site") return false;
  try {
    const source = new URL(origin);
    const host = request.headers.get("host");
    return source.origin === new URL(request.url).origin || (!!host && source.host === host && (source.protocol === "https:" || source.hostname === "localhost" || source.hostname === "127.0.0.1"));
  } catch { return false; }
}
