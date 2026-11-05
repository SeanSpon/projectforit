"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Home, ArrowRight, GraduationCap, ShieldCheck, MessageCircle, ListTodo, Building2, LogOut } from "lucide-react";
import { toast } from "sonner";
import CommunityApp, { communityApi } from "@/components/community-app";
import PortalSwitch, { type Portal } from "@/components/portal-switch";
import RoomieApp from "@/components/roomie-app";
export type RoomieUser = { id: string; email: string; person: string; name: string; bio: string; role?: string };
type Room = { id: string; name: string; inviteCode: string };
async function api(path: string, body?: unknown) {
  const response = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const data = await response.json() as { error?: string; user: RoomieUser | null; rooms: Room[]; id: string };
  if (!response.ok) throw new Error(data.error ?? "Could not connect. Try again."); return data;
}
export default function RoomieGate() {
  const [user, setUser] = useState<RoomieUser | null>(null);
  const [loading, setLoading] = useState(true), [mode, setMode] = useState<"login" | "signup">("login");
  const [portal, setPortal] = useState<Portal>("student");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(false), [room, setRoom] = useState<string | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]), [roomsLoading, setRoomsLoading] = useState(false);
  const [community, setCommunity] = useState<string | null>(null), [profileSaved, setProfileSaved] = useState(false);
  useEffect(() => {
    let active = true;
    const chosen = new URLSearchParams(window.location.search).get("portal");
    if (chosen === "ra" || chosen === "student") setPortal(chosen);
    void api("/api/auth").then(data => { if (active) { setUser(data.user); if (!chosen && data.user?.role === "ra") setPortal("ra"); } }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!user || portal !== "student") return;
    let active = true; setRoomsLoading(true);
    void api("/api/rooms").then(data => { if (active) setRooms(data.rooms); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setRoomsLoading(false); });
    return () => { active = false; };
  }, [user, room, portal]);
  function choosePortal(next: Portal) {
    setPortal(next); setRoom(null); setCommunity(null); setError("");
    const url = new URL(window.location.href); url.searchParams.set("portal", next); window.history.replaceState(null, "", url);
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(""); setBusy(true); const f = new FormData(e.currentTarget);
    try { const data = await api("/api/auth", { type: mode, email: f.get("email"), password: f.get("password"), ...(mode === "signup" ? { name: f.get("name") } : {}) }); setUser(data.user); setRoom(null); setCommunity(null); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not sign in."); } finally { setBusy(false); }
  }
  async function signOut() {
    setBusy(true); setError("");
    try { await api("/api/auth", { type: "logout" }); setUser(null); setRoom(null); setCommunity(null); setRooms([]); }
    catch (e) { const message = e instanceof Error ? e.message : "Could not sign out."; setError(message); toast.error(message); }
    finally { setBusy(false); }
  }
  async function roomSubmit(e: FormEvent<HTMLFormElement>, type: "create" | "join") {
    e.preventDefault(); setError(""); setBusy(true); const f = new FormData(e.currentTarget);
    try { const data = await api("/api/rooms", { type, ...(type === "create" ? { name: f.get("roomName") } : { code: f.get("code") }) }); setRoom(data.id); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not open your room."); } finally { setBusy(false); }
  }
  async function profile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError(""); setProfileSaved(false); const f = new FormData(e.currentTarget);
    try { const data = await api("/api/auth", { type: "profile", name: f.get("name"), bio: f.get("bio") }); setUser(data.user); setProfileSaved(true); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save profile."); } finally { setBusy(false); }
  }
  async function activateRA(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError(""); const code = String(new FormData(e.currentTarget).get("raCode") || "");
    try { await communityApi("", { type: "activate", code }); setUser(current => current ? { ...current, role: "ra" } : current); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not activate RA access."); } finally { setBusy(false); }
  }
  if (loading) return <main className="auth-page"><div className="auth-card">Opening Roomie…</div></main>;
  if (demo) return <RoomieApp user={{ id: "demo", person: "alex", name: "Alex Taylor", email: "alex@example.com", bio: "Sample student account" }} houseId="demo" demo signOut={() => setDemo(false)} back={() => setDemo(false)}/>;
  if (user && portal === "ra" && user.role === "ra") return <CommunityApp user={user} back={() => choosePortal("student")} onPortal={choosePortal} signOut={() => void signOut()}/>;
  if (user && community) return <CommunityApp user={user} roomId={community} back={() => setCommunity(null)} onPortal={choosePortal} signOut={() => void signOut()}/>;
  if (user && room && portal === "student") return <RoomieApp key={room} user={user} houseId={room} onCommunity={() => setCommunity(room)} onPortal={choosePortal} signOut={signOut} back={() => setRoom(null)}/>;
  const brand = <a className="portal-brand" href="/"><span><Home size={23}/></span><div>roomie<small>CAMPUS LIVING</small></div></a>;
  if (user) return <main className="portal-home"><header className="portal-home-header">{brand}<PortalSwitch value={portal} onChange={choosePortal} disabled={busy}/><button className="portal-signout" disabled={busy} onClick={() => void signOut()}><LogOut size={16}/>Sign out</button></header><div className="portal-home-content"><p className="portal-eyebrow">{portal === "ra" ? "RESIDENT ASSISTANT ACCOUNT" : "STUDENT ACCOUNT"}</p><h1>{portal === "ra" ? "Set up your RA account." : `Welcome home, ${user.name.split(" ")[0]}.`}</h1><p className="portal-subtitle">{portal === "ra" ? "Connect your account to your RA invitation to manage rooms and support residents." : "Your roommates, shared plans, and resident assistant—all in one place."}</p>{error && <p role="alert" className="auth-error">{error}</p>}
    {portal === "ra" ? <section className="portal-card portal-ra-setup"><ShieldCheck size={30}/><h2>Finish RA verification</h2><p>Signed in as <strong>{user.email}</strong>. Enter the one-use RA invitation issued to this email by the app owner. After verification, you’ll go straight to your RA dashboard.</p><form onSubmit={activateRA} className="portal-form"><label>RA invitation code<input name="raCode" required minLength={32} maxLength={32} autoComplete="off" placeholder="Enter your RA invitation code"/></label><button disabled={busy}>{busy ? "Verifying…" : "Activate RA account"}<ArrowRight size={17}/></button></form><p className="portal-help">Already have an RA account? Sign out and use the email it was created with. Selecting the RA portal doesn’t grant access to resident records.</p></section> : <>
      <div className="portal-student-grid"><section className="portal-card"><div className="portal-card-title"><Home/><h2>Your rooms</h2></div>{roomsLoading ? <p>Loading your rooms…</p> : rooms.length ? rooms.map(r => <button className="portal-room" key={r.id} onClick={() => setRoom(r.id)}><span><strong>{r.name}</strong><small>Roommates, chores, expenses &amp; your RA</small></span><ArrowRight size={20}/></button>) : <p>You haven’t joined a room yet. Create one or use a roommate’s invite code.</p>}</section><section className="portal-card"><div className="portal-card-title"><Building2/><h2>Get connected</h2></div><form className="portal-form" onSubmit={e => void roomSubmit(e, "create")}><label>New room name<input name="roomName" placeholder="Morgens 904" required maxLength={80}/></label><button disabled={busy}>Create a room<ArrowRight size={17}/></button></form><div className="portal-divider">or join your roommates</div><form className="portal-form" onSubmit={e => void roomSubmit(e, "join")}><label>Room invite code<input name="code" placeholder="16-character room code" required minLength={16} maxLength={16}/></label><button className="secondary" disabled={busy}>Join a room</button></form></section></div>
      <section className="portal-card portal-profile"><details><summary>Your profile</summary><form className="portal-form" onSubmit={profile} key={user.name + user.bio}><label>Name<input name="name" defaultValue={user.name} required maxLength={60}/></label><label>About you<textarea name="bio" defaultValue={user.bio} maxLength={300} placeholder="Major, schedule, and living preferences"/></label><button disabled={busy}>Save profile</button>{profileSaved && <p role="status">Profile saved.</p>}</form></details></section>
    </>}
  </div></main>;
  return <main className="portal-auth"><section className="portal-auth-left">{brand}<div className="portal-auth-content"><p className="portal-eyebrow">{portal === "student" ? "YOUR ROOM. YOUR PEOPLE." : "YOUR ROOMS. YOUR COMMUNITY."}</p><h1>{portal === "student" ? <>Your space.<br/>Your people.<br/>All together.</> : <>Your floor.<br/>Your residents.<br/>Connected.</>}</h1><p className="portal-subtitle">{portal === "student" ? "Share chores, split expenses, and stay connected with your resident assistant." : "Manage your assigned room groups, respond to residents, and keep everyone informed."}</p><PortalSwitch value={portal} onChange={choosePortal} disabled={busy}/><h2 className="portal-form-title">{mode === "login" ? `${portal === "student" ? "Student" : "RA"} sign in` : `Create ${portal === "student" ? "a student" : "an RA"} account`}</h2><form className="portal-form" onSubmit={submit}>
    {mode === "signup" && <label>Your name<input name="name" autoComplete="name" required maxLength={60}/></label>}<label>Email<input name="email" type="email" autoComplete="email" required maxLength={200}/></label><label>Password<input name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={mode === "signup" ? 10 : undefined} maxLength={128} required/></label>
    {mode === "signup" && <small>{portal === "ra" ? "Use at least 10 characters. You’ll verify your RA invitation after creating your account." : "Use at least 10 characters for your password."}</small>}{error && <p className="auth-error" role="alert">{error}</p>}<button disabled={busy}>{busy ? "One sec…" : mode === "login" ? `Sign in as ${portal === "ra" ? "RA" : "student"}` : "Create account"}<ArrowRight size={17}/></button></form><button className="portal-text-button" disabled={busy} onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}>{mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}</button>{portal === "student" && <button className="portal-demo-link" onClick={() => setDemo(true)}>Try the sample student account →</button>}</div><footer>Roomie · Student &amp; Resident Assistant portals</footer></section>
    <aside className="portal-auth-right"><div className="portal-feature-card"><span className="portal-feature-icon">{portal === "student" ? <GraduationCap size={52}/> : <ShieldCheck size={52}/>}</span><h2>{portal === "student" ? "Make room for better living." : "A home base for your floor."}</h2><p>{portal === "student" ? "Everything your room needs to stay organized and connected." : "One RA group. Every assigned room. Clear communication."}</p><div><ListTodo size={21}/><span>{portal === "student" ? "Chores and shared expenses" : "Assigned rooms and resident reports"}</span></div><div><MessageCircle size={21}/><span>{portal === "student" ? "Contact your resident assistant" : "Room messages and floor announcements"}</span></div><div><Building2 size={21}/><span>{portal === "student" ? "Your room, connected to your floor" : "Morgens 900 RA · Your connected community"}</span></div></div></aside>
  </main>;
}
