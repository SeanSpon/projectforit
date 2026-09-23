import { and, eq } from "drizzle-orm";
import { getNeonDb } from "@/db/neon";
import { households } from "@/db/schema";
import { seedState } from "@/lib/roomie";
import { applyAction, requestSchema } from "@/lib/actions";
import { currentUser, sameOrigin } from "@/lib/auth";
const HOUSE = "maple-house-demo-v1";
const response = (body:unknown,status=200) => Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
async function readHouse() {
  const db=getNeonDb();
  await db.insert(households).values({id:HOUSE,state:seedState}).onConflictDoNothing();
  const [row]=await db.select().from(households).where(eq(households.id,HOUSE));
  if(!row)throw new Error("Household unavailable");
  return {state:row.state,version:row.version};
}
export async function GET(){try{if(!await currentUser())return response({error:"Sign in to see your household."},401);return response(await readHouse());}catch{return response({error:"The database is unavailable. Try again shortly."},503);}}
export async function POST(request:Request){
  if(!sameOrigin(request))return response({error:"Cross-site requests are not allowed."},403);
  if(!request.headers.get("content-type")?.startsWith("application/json"))return response({error:"JSON required."},415);
  let input:unknown;try{const body=await request.text();if(body.length>8192)return response({error:"Request too large."},413);input=JSON.parse(body);}catch{return response({error:"Invalid JSON."},400);}
  const parsed=requestSchema.safeParse(input);if(!parsed.success)return response({error:parsed.error.issues[0]?.message||"Invalid request."},400);
  try{
    const user=await currentUser();if(!user)return response({error:"Sign in to save changes."},401);
    const snapshot=await readHouse();
    if(snapshot.version!==parsed.data.version)return response({error:"Your household changed. Please review it.",snapshot},409);
    let next;try{next=applyAction(snapshot.state,parsed.data.action,user.person);}catch(e){return response({error:e instanceof Error?e.message:"Invalid action."},400);}
    const db=getNeonDb();const rows=await db.update(households).set({state:next,version:snapshot.version+1,updatedAt:new Date()}).where(and(eq(households.id,HOUSE),eq(households.version,snapshot.version))).returning({state:households.state,version:households.version});
    if(!rows.length)return response({error:"Your household changed. Please review it.",snapshot:await readHouse()},409);
    return response(rows[0]);
  }catch{return response({error:"Could not save to the database. Your changes were not confirmed."},503);}
}
