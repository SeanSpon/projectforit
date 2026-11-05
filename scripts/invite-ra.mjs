// App-owner command. Keep DATABASE_URL private; invitation codes are single-use.
import { randomBytes, createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Usage: node --env-file=.env.local scripts/invite-ra.mjs person@example.com");
if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL before issuing an invitation.");
const code = randomBytes(16).toString("hex");
const hash = createHash("sha256").update(code).digest("hex");
const db = neon(process.env.DATABASE_URL);
await db`INSERT INTO roomie_ra_invites (code_hash,email,expires_at) VALUES (${hash},${email},now()+interval '7 days')`;
console.log(JSON.stringify({ email, code, expiresIn: "7 days", instructions: "Sign in with this email, open Activate RA account under Rooms & profile, and enter this code once." }));
