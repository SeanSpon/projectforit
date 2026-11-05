"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Home, MessageCircle, ShieldCheck, Users, RefreshCw, ArrowLeft, Send, Megaphone, Building2 } from "lucide-react";
import PortalSwitch, { type Portal } from "./portal-switch";
import type { RoomieUser } from "./roomie-gate";

type Group = { id: string; name: string; building: string; floor: string; inviteCode?: string; raName?: string };
type Room = { id: string; name: string; residents: { id: string; name: string; email: string }[] };
type Report = { id: string; householdId: string; title: string; body: string; category: string; status: string; createdAt: string };
type Notice = { id: string; title: string; body: string; createdAt: string };
type Message = { id: string; roomId: string; senderId: string; sender: string; body: string; createdAt: string };
type Community = { group: Group | null; isRA: boolean; rooms: Room[]; reports: Report[]; messages: Message[]; announcements: Notice[] };
export async function communityApi<T = {id:string}>(query = "", payload?: unknown) {
  const response = await fetch("/api/community" + query, payload ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) } : { cache: "no-store" });
  const data = await response.json() as T & {error?:string}; if (!response.ok) throw new Error(data.error || "Could not connect to your community."); return data;
}
export default function CommunityApp({ user, roomId, back, onPortal, signOut }: { user: RoomieUser; roomId?: string; back: () => void; onPortal: (portal: Portal) => void; signOut: () => void }) {
  const [groups, setGroups] = useState<Group[]>([]), [groupId, setGroupId] = useState("");
  const [data, setData] = useState<Community | null>(null), [selectedRoom, setSelectedRoom] = useState(roomId ?? "");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [saved, setSaved] = useState("");
  const [lastSync, setLastSync] = useState<Date | null>(null); const pending = useRef(false); const generation = useRef(0);
  const query = roomId ? `?room=${encodeURIComponent(roomId)}` : groupId ? `?group=${encodeURIComponent(groupId)}` : "";
  const refresh = useCallback(async () => {
    const version = ++generation.current;
    try {
      if (roomId || groupId) { const result = await communityApi<Community>(query); if(version === generation.current) setData(result); }
      else { const result = await communityApi<{groups:Group[]}>(); if(version === generation.current) setGroups(result.groups); }
      if(version === generation.current) { setLastSync(new Date()); setError(""); }
    } catch (e) { if(version === generation.current) setError(e instanceof Error ? e.message : "Could not sync."); }
    finally { if(version === generation.current) setLoading(false); }
  }, [roomId, groupId, query]);
  useEffect(() => { setLoading(true); setData(null); void refresh(); const timer = setInterval(() => { if (!pending.current && document.visibilityState === "visible") void refresh(); }, 15000); return () => { ++generation.current; clearInterval(timer); }; }, [refresh]);
  async function submit(e: FormEvent<HTMLFormElement>, type: string) {
    e.preventDefault(); if (pending.current) return; const form = e.currentTarget, fields = new FormData(form);
    const text = (key: string) => String(fields.get(key) ?? "").trim();
    const payload: Record<string, unknown> = { type };
    if (type === "create_group") Object.assign(payload, { name: text("name"), building: text("building"), floor: text("floor") });
    if (type === "connect_room") Object.assign(payload, { householdId: roomId, code: text("code") });
    if (type === "announce") Object.assign(payload, { groupId, title: text("title"), body: text("body") });
    if (type === "report") Object.assign(payload, { householdId: roomId, title: text("title"), body: text("body"), category: text("category") });
    if (type === "message") Object.assign(payload, { householdId: roomId || selectedRoom, body: text("body") });
    pending.current = true; setBusy(true); setSaved(""); setError("");
    try { const result = await communityApi("", payload); form.reset(); if (type === "create_group") setGroupId(result.id); await refresh(); setSaved(type === "message" ? "Message sent." : "Saved to your community."); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save."); }
    finally { pending.current = false; setBusy(false); }
  }
  async function status(id: string, value: string) {
    if (pending.current) return; pending.current = true; setBusy(true); setSaved("");
    try { await communityApi("", { type: "status", reportId: id, status: value }); await refresh(); setSaved("Report status updated."); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not update report."); }
    finally { pending.current = false; setBusy(false); }
  }
  const currentRoom = data?.rooms.find(r => r.id === (roomId || selectedRoom));
  const scopedReports = data?.reports.filter(r => !selectedRoom || r.householdId === selectedRoom) ?? [];
  const scopedMessages = data?.messages.filter(m => m.roomId === (roomId || selectedRoom)) ?? [];
  return <main className="community-shell"><header className="community-top"><button onClick={back}><ArrowLeft size={16}/>Rooms &amp; profile</button><a href="/" className="community-brand"><Home/>roomie.</a><PortalSwitch value={roomId ? "student" : "ra"} onChange={onPortal}/><button onClick={signOut}>Sign out</button></header>
    <div className="community-heading"><div><p className="eyebrow">{data?.group ? `${data.group.building} · Floor ${data.group.floor}` : "YOUR RESIDENTIAL COMMUNITY"}</p><h1>{roomId ? "Your room. Your RA." : data?.group?.name || "Your RA room groups"}</h1><p className="muted">{roomId ? "Reach your assigned RA, report concerns, and catch floor updates." : "Bring your assigned rooms together and stay connected with residents."}</p></div><button className="community-secondary" disabled={busy || loading} onClick={() => void refresh()}><RefreshCw size={16}/>Refresh</button></div>
    {error && <div className="community-error" role="alert">{error}<button onClick={() => void refresh()}>Try again</button></div>}{saved && <p role="status" className="community-success">{saved}</p>}
    {loading && <section className="panel" role="status">Loading your community…</section>}
    {!loading && !roomId && !groupId && <div className="community-grid"><section className="panel"><h2><Building2 size={20}/>Your groups</h2>{groups.length ? groups.map(group => <button className="community-room" key={group.id} onClick={() => { setGroupId(group.id); setSelectedRoom(""); }}><strong>{group.name}</strong><span>{group.building} · Floor {group.floor} →</span></button>) : <p>No groups yet. Create your first group to invite rooms.</p>}</section><section className="panel"><h2>Create a room group</h2><form className="community-form" onSubmit={e => void submit(e, "create_group")}><label>Group name<input name="name" required maxLength={80} placeholder="Morgens 900 RA"/></label><label>Building<input name="building" required maxLength={80} placeholder="Morgens Hall"/></label><label>Floor<input name="floor" required maxLength={20} placeholder="9"/></label><button disabled={busy}>Create group</button></form></section></div>}
    {!loading && roomId && data && !data.group && <section className="panel community-narrow"><h2><ShieldCheck size={20}/>Connect your room to an RA</h2><p>Ask your RA for their group code. The person who created this room can connect it once, and every roommate will belong to the same RA group.</p><form className="community-form" onSubmit={e => void submit(e, "connect_room")}><label>RA group code<input name="code" required pattern="[A-Fa-f0-9]{16}" minLength={16} maxLength={16} placeholder="16-character group code"/></label><button disabled={busy}>Connect room</button></form></section>}
    {!loading && data?.group && <>
      <section className="community-hero"><div><span>{data.group.name}</span><h2>{roomId ? `Connected to ${data.group.raName}` : "Your floor, connected."}</h2><p>{data.rooms.length} connected room{data.rooms.length === 1 ? "" : "s"} · {data.rooms.reduce((n, r) => n + r.residents.length, 0)} residents · {data.reports.filter(r => r.status !== "Resolved").length} open reports</p></div>{data.isRA && <div className="community-code"><small>Share with room creators</small><strong>{data.group.inviteCode}</strong><button onClick={() => void navigator.clipboard.writeText(data.group!.inviteCode!).then(() => setSaved("Group code copied.")).catch(() => setError("Copy the code shown above."))}>Copy group code</button></div>}</section>
      {data.isRA && <><button className="community-back" onClick={() => { setGroupId(""); setSelectedRoom(""); }}>← All groups</button><section className="community-rooms" aria-label="Managed rooms">{data.rooms.map(room => <button key={room.id} aria-pressed={room.id === selectedRoom} className={`community-room ${room.id === selectedRoom ? "selected" : ""}`} onClick={() => setSelectedRoom(room.id)}><Home/><strong>{room.name}</strong><span>{room.residents.length} residents</span><small>{data.reports.filter(r => r.householdId === room.id && r.status !== "Resolved").length} open reports</small></button>)}{!data.rooms.length && <section className="panel"><h2>Ready for your first room</h2><p>Share your group code with room creators. Connected rooms will appear here.</p></section>}</section></>}
      <div className="community-grid"><div className="community-stack"><section className="panel"><h2><Megaphone size={20}/>Floor announcements</h2>{data.announcements.length ? data.announcements.map(n => <article className="community-notice" key={n.id}><h3>{n.title}</h3><p>{n.body}</p><small>{new Date(n.createdAt).toLocaleString()}</small></article>) : <p className="muted">No announcements yet.</p>}
      {data.isRA && <form className="community-form" onSubmit={e => void submit(e, "announce")}><label>Announcement title<input name="title" required maxLength={80}/></label><label>Announcement message<textarea name="body" required maxLength={2000}/></label><button disabled={busy}>Post announcement</button></form>}</section>
      <section className="panel"><h2><ShieldCheck size={20}/>{data.isRA ? "Resident reports" : "Room reports"}</h2>{scopedReports.length ? scopedReports.map(r => <article className="community-notice" key={r.id}><div className="community-between"><h3>{r.title}</h3><span className="community-pill">{r.status}</span></div><small>{data.rooms.find(room => room.id === r.householdId)?.name} · {r.category}</small><p>{r.body}</p>{data.isRA && <label className="community-status">Report status<select aria-label={`Status for ${r.title}`} disabled={busy} value={r.status} onChange={e => void status(r.id, e.target.value)}>{["Open", "In progress", "Resolved"].map(s => <option key={s}>{s}</option>)}</select></label>}</article>) : <p className="muted">No reports for {selectedRoom ? "this room" : "this group"}.</p>}
      {!data.isRA && <form className="community-form" onSubmit={e => void submit(e, "report")}><h3>Report an issue</h3><label>Issue type<select name="category">{["Maintenance", "Roommate concern", "Question", "Other"].map(c => <option key={c}>{c}</option>)}</select></label><label>Subject<input name="title" required maxLength={80}/></label><label>Details<textarea name="body" required maxLength={2000}/></label><p className="muted">Your roommates and assigned RA can see this report.</p><button disabled={busy}>Submit to RA</button></form>}</section></div>
      <div className="community-stack"><section className="panel"><h2><Users size={20}/>{currentRoom?.name || (data.isRA ? "Select a room" : "Your room")}</h2>{currentRoom ? currentRoom.residents.map(r => <div className="community-resident" key={r.id}><span>{r.name.slice(0, 1)}</span><div><strong>{r.name}</strong><small>{r.email}</small></div></div>) : <p className="muted">Choose a room above to view its residents and messages.</p>}</section>
      <section className="panel"><h2><MessageCircle size={20}/>{data.isRA ? "Room conversation" : "Message your RA"}</h2>{currentRoom ? <><p className="muted">Visible to this room’s residents and assigned RA.</p><div className="community-chat">{scopedMessages.length ? scopedMessages.map(m => <article className={`community-message ${m.senderId === user.id ? "mine" : ""}`} key={m.id}><small>{m.sender}</small><p>{m.body}</p><time>{new Date(m.createdAt).toLocaleString()}</time></article>) : <p className="muted">Start the conversation.</p>}</div><form className="community-form" onSubmit={e => void submit(e, "message")}><label>Message<textarea name="body" required maxLength={2000} placeholder="Write a message…"/></label><button disabled={busy}><Send size={16}/>Send message</button></form></> : <p className="muted">Select a room to start a conversation.</p>}</section></div></div>
    </>}
    <footer className="community-footer">{busy ? "Saving…" : lastSync ? `Synced ${lastSync.toLocaleTimeString()} · Updates every 15 seconds` : "Connecting…"} · Messages stay inside Roomie. Reports are not monitored for emergencies.</footer>
  </main>;
}
