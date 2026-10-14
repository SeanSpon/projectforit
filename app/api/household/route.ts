import { and, eq } from "drizzle-orm";
import { getNeonDb } from "@/db/neon";
import { households } from "@/db/schema";
import { applyAction, requestSchema } from "@/lib/actions";
import { currentUser, sameOrigin } from "@/lib/auth";
import { readHouse } from "@/lib/households";
const response = (body:unknown,status=200) => Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
export async function GET(request:Request){try{
  const user=await currentUser();if(!user)return response({error:"Sign in to see your household."},401);
  const snapshot=await readHouse(new URL(request.url).searchParams.get("id") ?? "",user.id);
  return snapshot?response(snapshot):response({error:"Household not found or you are not a member."},404);
}catch{return response({error:"The database is unavailable. Try again shortly."},503);}}
export async function POST(request:Request){
  if(!sameOrigin(request))return response({error:"Cross-site requests are not allowed."},403);
  if(!request.headers.get("content-type")?.startsWith("application/json"))return response({error:"JSON required."},415);
  let input:unknown;try{const body=await request.text();if(body.length>8192)return response({error:"Request too large."},413);input=JSON.parse(body);}catch{return response({error:"Invalid JSON."},400);}
  const parsed=requestSchema.safeParse(input);if(!parsed.success)return response({error:parsed.error.issues[0]?.message||"Invalid request."},400);
  try{
    const user=await currentUser();if(!user)return response({error:"Sign in to save changes."},401);
    const id=new URL(request.url).searchParams.get("id") ?? "";
    const snapshot=await readHouse(id,user.id);if(!snapshot)return response({error:"Household not found or you are not a member."},404);
    if(snapshot.version!==parsed.data.version)return response({error:"Your household changed. Please review it.",snapshot},409);
    let next;try{next=applyAction(snapshot.state,parsed.data.action,user.person,snapshot.members);}catch(e){return response({error:e instanceof Error?e.message:"Invalid action."},400);}
    const rows=await getNeonDb().update(households).set({state:next,version:snapshot.version+1,updatedAt:new Date()}).where(and(eq(households.id,id),eq(households.version,snapshot.version))).returning({version:households.version});
    if(!rows.length)return response({error:"Your household changed. Please review it.",snapshot:await readHouse(id,user.id)},409);
    return response({...snapshot,state:next,version:rows[0].version});
  }catch{return response({error:"Could not save to the database. Your changes were not confirmed."},503);}
}
