import { neon } from "@neondatabase/serverless";
if(process.stdin.isTTY)process.stdin.setRawMode(true);
const input=await new Promise(resolve=>{let value="";process.stdin.setEncoding("utf8");process.stdin.on("data",chunk=>{value+=chunk;if(value.includes("\n")){process.stdin.pause();if(process.stdin.isTTY)process.stdin.setRawMode(false);resolve(value);}});});
try {
 const url=new URL(JSON.parse(input).url); url.hostname=url.hostname.replace("-pooler.",".");
 const sql=neon(url.toString());
 const rows=await sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`;
 console.log(JSON.stringify({connected:true,tables:rows.map(r=>r.table_name)}));
 const counts=await sql`SELECT (SELECT count(*) FROM roomie_users)::int AS users, (SELECT count(*) FROM roomie_households)::int AS households`;
 console.log(JSON.stringify(counts));
} catch { console.error("Neon connection check failed.");process.exitCode=1; }
