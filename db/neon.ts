import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { env } from "cloudflare:workers";
import * as schema from "./schema";
export function getNeonDb() {
  const url = (env as unknown as Record<string,string>).DATABASE_URL || process.env.DATABASE_URL;
  if(!url)throw new Error("Database is not configured");
  return drizzle(neon(url),{schema});
}
