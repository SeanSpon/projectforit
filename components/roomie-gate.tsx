"use client";

import { useEffect, useState, type FormEvent } from "react";
import RoomieApp from "@/components/roomie-app";
import { people } from "@/lib/roomie";

export type RoomieUser = { id: string; email: string; person: string };
export default function RoomieGate() {
  const [user, setUser] = useState<RoomieUser | null>(null);
  const [available, setAvailable] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [person, setPerson] = useState("alex");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const response = await fetch("/api/auth", { cache: "no-store" });
      const data = await response.json() as { user: RoomieUser | null; available: string[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not load accounts.");
      setUser(data.user); setAvailable(data.available);
      setPerson((old: string) => data.available.includes(old) ? old : data.available[0] ?? "");
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not connect."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void fetch("/api/auth", { cache:"no-store" }).then(async response => {const data=await response.json() as {user:RoomieUser|null;available:string[];error?:string};if(!response.ok)throw new Error(data.error ?? "Could not load accounts.");setUser(data.user);setAvailable(data.available);setPerson(data.available[0] ?? "");}).catch(e=>setError(e instanceof Error ? e.message : "Could not connect.")).finally(()=>setLoading(false)); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: mode, email: form.get("email"), password: form.get("password"), ...(mode === "signup" ? { person } : {}) }) });
      const data = await response.json() as { user: RoomieUser; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not sign in.");
      setUser(data.user);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not sign in."); }
    finally { setBusy(false); }
  }
  async function signOut() {
    setBusy(true);
    try {
      const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "logout" }) });
      if (!response.ok) throw new Error("Could not sign out.");
      setUser(null); await refresh();
    } catch { setError("Could not sign out. Try again."); }
    finally { setBusy(false); }
  }
  if (loading) return <main className="auth-page"><div className="auth-card">Opening Roomie…</div></main>;
  if (user) return <RoomieApp key={user.id} user={user} signOut={signOut} />;
  return <main className="auth-page"><section className="auth-card"><div className="auth-brand">⌂ roomie.</div><h1>{mode === "login" ? "Welcome back" : "Join Maple House"}</h1><p>Keep chores, expenses, shared spaces, and house rules in one place.</p>
    <form onSubmit={submit}><label>Email<input name="email" type="email" autoComplete="email" required maxLength={200} /></label><label>Password<input name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={mode === "signup" ? 10 : undefined} required /></label>
      {mode === "signup" && <label>Your roommate profile<select value={person} onChange={e => setPerson(e.target.value)} required>{available.map(id => <option key={id} value={id}>{people.find(p => p.id === id)?.name}</option>)}</select></label>}
      {mode === "signup" && <small>Each of the four demo profiles can be claimed once. Use at least 10 characters for your password.</small>}
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button type="submit" disabled={busy || (mode === "signup" && !available.length)}>{busy ? "One sec…" : mode === "login" ? "Sign in" : "Create account"}</button>
    </form><button type="button" className="auth-toggle" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}>{mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}</button>
    {mode === "signup" && !available.length && <p>All four profiles are claimed. Ask a roommate for access.</p>}
  </section></main>;
}
