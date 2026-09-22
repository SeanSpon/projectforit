import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
if(!process.env.DATABASE_URL)throw new Error("Set DATABASE_URL before migrating.");
const url=new URL(process.env.DATABASE_URL);
url.hostname=url.hostname.replace("-pooler.",".");
try { await migrate(drizzle(neon(url.toString())),{migrationsFolder:"./drizzle-neon"});console.log("Roomie database migration complete."); }
catch { console.error("Migration failed. Check database access and migration state.");process.exitCode=1; }
