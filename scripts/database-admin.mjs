import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
if(process.stdin.isTTY)process.stdin.setRawMode(true);
const input=await new Promise(resolve=>{let value="";process.stdin.setEncoding("utf8");process.stdin.on("data",chunk=>{value+=chunk;if(value.includes("\n")){process.stdin.pause();if(process.stdin.isTTY)process.stdin.setRawMode(false);resolve(value);}});});
try {
 const {url:rawUrl,mode}=JSON.parse(input); const url=new URL(rawUrl);url.hostname=url.hostname.replace("-pooler.",".");const sql=neon(url.toString());
 if(mode==="inspect") {
  console.log(JSON.stringify(await sql`SELECT table_schema,table_name,column_name,data_type FROM information_schema.columns WHERE table_name LIKE 'roomie_%' OR table_name='__drizzle_migrations' ORDER BY table_schema,table_name,ordinal_position`));
 } else if(mode==="migrate") {
  await migrate(drizzle(sql),{migrationsFolder:"./drizzle-neon"});console.log("Migrations applied.");
 } else if(mode==="reset" && process.argv.includes("--reset-roomie-data")) {
  // Explicit user-requested clean slate. Drops ONLY the named Roomie tables, never the database/project.
  const journal=JSON.parse(readFileSync("drizzle-neon/meta/_journal.json","utf8"));
  const queries=[sql.query('DROP TABLE IF EXISTS roomie_memberships, roomie_sessions, roomie_users, roomie_households'),sql.query('CREATE SCHEMA IF NOT EXISTS drizzle'),sql.query('CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)'),sql.query('DELETE FROM drizzle.__drizzle_migrations')];
  for(const entry of journal.entries){const content=readFileSync(`drizzle-neon/${entry.tag}.sql`,"utf8");for(const statement of content.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))queries.push(sql.query(statement));queries.push(sql.query('INSERT INTO drizzle.__drizzle_migrations (hash,created_at) VALUES ($1,$2)',[createHash('sha256').update(content).digest('hex'),entry.when]));}
  await sql.transaction(queries);console.log("Roomie tables reset and all migrations applied atomically.");
 } else throw new Error("Unknown operation.");
} catch (e) {console.error("Database operation failed:",e.message?.replace(/postgres(?:ql)?:\/\/\S+/g,"[redacted]"));process.exitCode=1;}
