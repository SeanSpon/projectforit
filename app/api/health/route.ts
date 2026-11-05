import { sql } from "drizzle-orm";
import { getNeonDb } from "@/db/neon";
export async function GET() {
  try {
    // Verify connectivity and the live community schema without returning any records.
    await getNeonDb().execute(sql`SELECT (SELECT count(*) FROM roomie_residence_groups WHERE false), (SELECT count(*) FROM roomie_residence_reports WHERE false), (SELECT count(*) FROM roomie_ra_invites WHERE false), (SELECT role FROM roomie_users LIMIT 0)`);
    return Response.json({ status: "ok", database: "connected", community: "ready" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
