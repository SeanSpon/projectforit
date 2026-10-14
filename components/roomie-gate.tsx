"use client";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import RoomieApp from "@/components/roomie-app";
export type RoomieUser = { id: string; email: string; person: string; name: string; bio: string };
type Room = { id: string; name: string; inviteCode: string };
async function api(path: string, body?: unknown) {
  const response = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const data = await response.json() as { error?: string; user: RoomieUser | null; rooms: Room[]; id: string }; if (!response.ok) throw new Error(data.error ?? "Could not connect. Try again."); return data;
}
export default function RoomieGate() {
  const [user,setUser] = useState<RoomieUser|null>(null);
  const [loading,setLoading] = useState(true);
  const [mode,setMode] = useState<"login"|"signup">("login");
  const [error,setError] = useState(""); const [busy,setBusy] = useState(false);
  const [demo,setDemo] = useState(false); const [room,setRoom] = useState<string|null>(null);
  const [rooms,setRooms] = useState<Room[]>([]); const [roomsLoading,setRoomsLoading] = useState(false);
  const [profileSaved,setProfileSaved] = useState(false);
  useEffect(() => { let active=true; void api("/api/auth").then(data=>{if(active)setUser(data.user);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);}); return()=>{active=false;}; },[]);
  useEffect(() => { if(!user)return; let active=true; setRoomsLoading(true); void api("/api/rooms").then(data=>{if(active)setRooms(data.rooms);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setRoomsLoading(false);});return()=>{active=false;}; },[user,room]);
  async function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(""); setBusy(true); const f=new FormData(e.currentTarget);
    try { const data=await api("/api/auth",{type:mode,email:f.get("email"),password:f.get("password"),...(mode==="signup"?{name:f.get("name")}: {})});setUser(data.user); }
    catch(e){setError(e instanceof Error?e.message:"Could not sign in.");} finally{setBusy(false);}
  }
  async function signOut() {setBusy(true);setError("");try{await api("/api/auth",{type:"logout"});setUser(null);setRoom(null);setRooms([]);}catch(e){const message=e instanceof Error?e.message:"Could not sign out.";setError(message);toast.error(message);}finally{setBusy(false);}}
  async function roomSubmit(e:FormEvent<HTMLFormElement>,type:"create"|"join") {
    e.preventDefault();setError("");setBusy(true);const f=new FormData(e.currentTarget);
    try{const data=await api("/api/rooms",{type,...(type==="create"?{name:f.get("roomName")}: {code:f.get("code")})});setRoom(data.id);}catch(e){setError(e instanceof Error?e.message:"Could not open your room.");}finally{setBusy(false);}
  }
  async function profile(e:FormEvent<HTMLFormElement>) {e.preventDefault();setBusy(true);setError("");setProfileSaved(false);const f=new FormData(e.currentTarget);try{const data=await api("/api/auth",{type:"profile",name:f.get("name"),bio:f.get("bio")});setUser(data.user);setProfileSaved(true);}catch(e){setError(e instanceof Error?e.message:"Could not save profile.");}finally{setBusy(false);}}
  if(demo) return <RoomieApp user={{id:"demo",person:"alex",name:"Alex Taylor",email:"alex@example.com",bio:"IT student · early riser · Maple House"}} houseId="demo" demo signOut={()=>setDemo(false)} back={()=>setDemo(false)} />;
  if(loading)return <main className="auth-page"><div className="auth-card">Opening Roomie…</div></main>;
  if(user&&room)return <RoomieApp key={room} user={user} houseId={room} signOut={signOut} back={()=>setRoom(null)} />;
  if(user)return <main className="auth-page"><section className="auth-card room-picker"><div className="auth-brand">⌂ roomie.</div><h1>Hey {user.name}.</h1><p>Create a household or join your roommates with their invite code.</p>{error&&<p role="alert" className="auth-error">{error}</p>}
    <h2>Your rooms</h2>{roomsLoading?<p>Loading your rooms…</p>:rooms.length?rooms.map(r=><button className="room-option" key={r.id} onClick={()=>setRoom(r.id)}>{r.name} <span>Open →</span></button>):<p>No rooms yet. Make your first one below.</p>}
    <form onSubmit={e=>void roomSubmit(e,"create")}><label>Household name<input name="roomName" placeholder="Morgens 905" required maxLength={80}/></label><button disabled={busy}>Create a room</button></form>
    <form onSubmit={e=>void roomSubmit(e,"join")}><label>Invite code<input name="code" placeholder="16-character invite code" required minLength={16} maxLength={16}/></label><button disabled={busy}>Join a room</button></form>
    <details><summary>Your profile</summary><form onSubmit={profile} key={user.name+user.bio}><label>Name<input name="name" defaultValue={user.name} required maxLength={60}/></label><label>About you<textarea name="bio" defaultValue={user.bio} maxLength={300} placeholder="Major, schedule, and living preferences"/></label><button disabled={busy}>Save profile</button>{profileSaved&&<p role="status">Profile saved.</p>}</form></details>
    <button className="auth-toggle" onClick={()=>{setDemo(true);setError("");}}>Explore the demo</button><button className="auth-toggle" disabled={busy} onClick={()=>void signOut()}>Sign out</button>
  </section></main>;
  return <main className="auth-page"><section className="auth-card"><div className="auth-brand">⌂ roomie.</div><h1>{mode==="login"?"Welcome back":"Make yourself at home"}</h1><p>Real roommates. Your own household. Everything in one place.</p><form onSubmit={submit}>
    {mode==="signup"&&<label>Your name<input name="name" autoComplete="name" required maxLength={60}/></label>}
    <label>Email<input name="email" type="email" autoComplete="email" required maxLength={200}/></label><label>Password<input name="password" type="password" autoComplete={mode==="signup"?"new-password":"current-password"} minLength={mode==="signup"?10:undefined} maxLength={128} required/></label>
    {mode==="signup"&&<small>Use at least 10 characters for your password.</small>}{error&&<p className="auth-error" role="alert">{error}</p>}<button disabled={busy}>{busy?"One sec…":mode==="login"?"Sign in":"Create account"}</button></form>
    <button className="auth-toggle" onClick={()=>{setMode(mode==="login"?"signup":"login");setError("");}}>{mode==="login"?"New here? Create an account":"Already have an account? Sign in"}</button>
    <button className="auth-toggle" onClick={()=>setDemo(true)}>Try the full demo →</button><small>No signup needed for the demo. Changes stay in this preview.</small>
  </section></main>;
}
