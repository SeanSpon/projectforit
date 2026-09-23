import { z } from "zod";
import { bookingConflict, people, personName, type HouseState } from "./roomie";
const title = z.string().trim().min(1,"Give this a name.").max(80);
const person = z.enum(["alex","jordan","maya","eli"]);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>s>=new Date().toISOString().slice(0,10) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10)===s,"Choose a valid date today or later.");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const id = z.string().min(1).max(100);
export const actionSchema = z.discriminatedUnion("type",[
  z.object({type:z.literal("add_chore"),title,person,date,area:z.enum(["Kitchen","Living room","Bathroom","Whole house"]),minutes:z.number().int().min(1).max(240)}).strict(),
  z.object({type:z.literal("set_chore"),id,done:z.boolean()}).strict(),
  z.object({type:z.literal("rotate_chores")}).strict(),
  z.object({type:z.literal("add_expense"),title,cents:z.number().int().min(1).max(1000000),paidBy:person,category:z.enum(["Groceries","Utilities","Supplies","Other"])}).strict(),
  z.object({type:z.literal("settle_expense"),id,settled:z.boolean()}).strict(),
  z.object({type:z.literal("add_booking"),title,date,start:time,end:time,space:z.enum(["Living room","Kitchen","Study nook"])}).strict(),
  z.object({type:z.literal("cancel_booking"),id}).strict(),
  z.object({type:z.literal("add_rule"),title,detail:z.string().trim().min(1).max(400),category:z.enum(["Noise","Guests","Shared spaces","Chores","Other"])}).strict(),
  z.object({type:z.literal("vote_rule"),id,agreed:z.boolean()}).strict(),
]);
export const requestSchema = z.object({version:z.number().int().nonnegative(),action:actionSchema}).strict();
export function applyAction(current: HouseState, raw: unknown, ME: string): HouseState {
  const a = actionSchema.parse(raw); const s = structuredClone(current); let text = "";
  const nextId = () => crypto.randomUUID();
  switch(a.type){
    case "add_chore": { if(s.chores.length>=500)throw new Error("This concept supports up to 500 chores."); const {type,...values}=a; void type;s.chores.unshift({...values,id:nextId(),done:false});text=`added “${a.title}” for ${personName(a.person)}.`;break; }
    case "set_chore": { const c=s.chores.find(c=>c.id===a.id);if(!c)throw new Error("Chore not found.");c.done=a.done;text=`${a.done?"completed":"reopened"} ${c.title.toLowerCase()}.`;break; }
    case "rotate_chores": { s.chores=s.chores.map(c=>c.done?c:{...c,person:people[(people.findIndex(p=>p.id===c.person)+1)%4].id});text="rotated open chores one roommate forward.";break; }
    case "add_expense": { if(s.expenses.length>=500)throw new Error("This concept supports up to 500 expenses.");const {type,...values}=a;void type;if(values.paidBy!==ME)throw new Error("You can only add expenses you paid.");s.expenses.unshift({...values,id:nextId(),date:new Date().toISOString().slice(0,10),settledBy:[]});text=`added ${a.title.toLowerCase()}, split four ways.`;break; }
    case "settle_expense": { const e=s.expenses.find(e=>e.id===a.id);if(!e||e.paidBy===ME)throw new Error("That share cannot be settled by you.");e.settledBy=a.settled?[...new Set([...e.settledBy,ME])]:e.settledBy.filter(p=>p!==ME);text=`${a.settled?"marked settled":"reopened"} their share of ${e.title.toLowerCase()}.`;break; }
    case "add_booking": { if(a.end<=a.start)throw new Error("End time must be after start time on the same day.");if(bookingConflict(a,s.bookings))throw new Error("That space is already booked during this time. Choose another slot.");if(s.bookings.length>=500)throw new Error("This concept supports up to 500 reservations.");const {type,...values}=a;void type;s.bookings.push({...values,id:nextId(),person:ME});text=`reserved the ${a.space.toLowerCase()} for ${a.title.toLowerCase()}.`;break; }
    case "cancel_booking": { const b=s.bookings.find(b=>b.id===a.id);if(!b||b.person!==ME)throw new Error("You can only cancel your own reservations.");s.bookings=s.bookings.filter(b=>b.id!==a.id);text=`canceled their ${b.title.toLowerCase()} reservation.`;break; }
    case "add_rule": { if(s.rules.length>=100)throw new Error("This concept supports up to 100 agreements.");const {type,...values}=a;void type;s.rules.push({...values,id:nextId(),votes:[ME]});text=`proposed a house agreement: ${a.title.toLowerCase()}.`;break; }
    case "vote_rule": { const r=s.rules.find(r=>r.id===a.id);if(!r)throw new Error("Rule not found.");r.votes=a.agreed?[...new Set([...r.votes,ME])]:r.votes.filter(p=>p!==ME);text=`${a.agreed?"agreed to":"withdrew agreement to"} “${r.title}”.`;break; }
  }
  s.activity=[{id:nextId(),person:ME,text,when:new Date().toISOString()},...s.activity].slice(0,30);return s;
}
