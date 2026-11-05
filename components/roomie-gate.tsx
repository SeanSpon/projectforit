"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Home, ArrowRight, Users, ShieldCheck } from "lucide-react";
import CommunityApp from "@/components/community-app";
import PortalSwitch, { type Portal } from "@/components/portal-switch";
import type { InitialRoomie } from "@/lib/initial-roomie";
import RoomieApp from "@/components/roomie-app";
export type RoomieUser = {
  id: string;
  email: string;
  person: string;
  name: string;
  bio: string;
  role?: string;
  phone?: string;
  shareEmail?: boolean;
  sharePhone?: boolean;
};
export type AccountRoom = {
  id: string;
  name: string;
  ownerId: string | null;
  inviteCode: string | null;
  inviteEnabled: boolean;
  shareChores: boolean;
  members: { id: string; name: string }[];
};
async function api(path: string, body?: unknown) {
  const r = await fetch(
    path,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  const d = (await r.json()) as {
    error?: string;
    user: RoomieUser | null;
    rooms: AccountRoom[];
    id: string;
  };
  if (!r.ok) throw Error(d.error || "Could not connect.");
  return d;
}
export default function RoomieGate({ initial }: { initial?: InitialRoomie }) {
  const [user, setUser] = useState<RoomieUser | null>(initial?.user ?? null),
    [portal, setPortal] = useState<Portal>(initial?.portal ?? "student"),
    [loading, setLoading] = useState(!initial),
    [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState(initial?.error ?? ""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(""),
    [demo, setDemo] = useState(false),
    [room, setRoom] = useState<string | null>(initial?.room ?? null),
    [community, setCommunity] = useState<string | null>(
      initial?.community ?? null,
    ),
    [rooms, setRooms] = useState<AccountRoom[]>(initial?.rooms ?? []);
  useEffect(() => {
    if (initial) return;
    let active = true;
    api("/api/auth")
      .then((d) => {
        if (active) {
          setUser(d.user);
          setPortal(d.user?.role === "ra" ? "ra" : "student");
          if (d.user?.role === "ra") setCommunity("ra");
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    return () => {
      active = false;
    };
  }, [initial]);
  const operation = useRef(false);
  const userId = user?.id;
  useEffect(() => {
    if (!userId || demo) return;
    const url = new URL(window.location.href);
    const view = url.searchParams.get("view");
    const section = url.searchParams.get("section");
    const group = url.searchParams.get("group");
    url.search = "";
    if (room) {
      url.searchParams.set("room", room);
      if (view) url.searchParams.set("view", view);
    } else if (community && community !== "ra") {
      url.searchParams.set("community", community);
      if (section) url.searchParams.set("section", section);
    } else if (community === "ra") {
      url.searchParams.set("portal", "ra");
      if (group) url.searchParams.set("group", group);
      if (section) url.searchParams.set("section", section);
    } else url.searchParams.set("account", "1");
    window.history.replaceState(null, "", url);
  }, [userId, room, community, demo]);
  async function loadRooms() {
    const d = await api("/api/rooms");
    setRooms(d.rooms);
  }
  useEffect(() => {
    if (!userId) return;
    let active = true;
    void api("/api/rooms").then(d => { if (active) setRooms(d.rooms); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [userId, room, community]);
  async function run(fn: () => Promise<void>) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    setSaved("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  function switchPortal(next: Portal) {
    setPortal(next);
    setRoom(null);
    setCommunity(next === "ra" ? "ra" : null);
    setError("");
  }
  async function signOut() {
    await run(async () => {
      await api("/api/auth", { type: "logout" });
      setUser(null);
      setRoom(null);
      setCommunity(null);
      setRooms([]);
      window.history.replaceState(null, "", "/");
    });
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await run(async () => {
      const d = await api("/api/auth", {
        type: mode,
        email: f.get("email"),
        password: f.get("password"),
        ...(mode === "signup" ? { name: f.get("name"), role: portal } : {}),
      });
      setUser(d.user);
      const next = mode === "signup" ? portal : d.user?.role === "ra" ? "ra" : "student";
      setPortal(next);
      setCommunity(next === "ra" ? "ra" : null);
    });
  }
  async function roomSubmit(
    e: FormEvent<HTMLFormElement>,
    type: "create" | "join",
  ) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await run(async () => {
      const d = await api("/api/rooms", {
        type,
        ...(type === "create"
          ? { name: f.get("roomName") }
          : { code: f.get("code") }),
      });
      setRoom(d.id);
    });
  }
  async function profile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await run(async () => {
      const d = await api("/api/auth", {
        type: "profile",
        name: f.get("name"),
        bio: f.get("bio"),
        phone: f.get("phone"),
        shareEmail: f.get("shareEmail") === "on",
        sharePhone: f.get("sharePhone") === "on",
        role: f.get("role"),
      });
      setUser(d.user);
      setSaved("Profile and sharing choices saved.");
    });
  }
  async function roomAction(r: AccountRoom, type: string, extra: object = {}) {
    if (type === "transfer" && !window.confirm(`Transfer ${r.name} to ${r.members.find(m => m.id === (extra as { userId?: string }).userId)?.name || "this roommate"}? They will manage invitations and ownership. Chore sharing turns off and the invitation code changes.`)) return;
    if (type === "leave" && !window.confirm(`Leave ${r.name}? You will lose access. If you are its last resident, its private history will not be passed to future residents.`)) return;
    if (type === "remove_member" && !window.confirm("Remove this roommate? Their access ends and the invitation code changes.")) return;
    await run(async () => {
      await api("/api/rooms", { type, householdId: r.id, ...extra });
      await loadRooms();
      setSaved("Room updated.");
    });
  }
  if (demo)
    return (
      <RoomieApp
        user={{
          id: "demo",
          person: "alex",
          name: "Alex Taylor",
          email: "alex@example.com",
          bio: "IT student · Maple House",
        }}
        houseId="demo"
        demo
        signOut={() => setDemo(false)}
        back={() => setDemo(false)}
      />
    );
  if (loading)
    return (
      <main className="auth-page">
        <div className="auth-card">Opening Roomie…</div>
      </main>
    );
  if (user && community)
    return (<>
      {error && <p role="alert" className="community-error">{error}</p>}
      <CommunityApp
        key={community}
        initial={
          initial?.user?.id === user.id && initial.community === community
            ? initial.floor
            : undefined
        }
        user={user}
        roomId={community === "ra" ? undefined : community}
        back={() => switchPortal("student")}
        onPortal={switchPortal}
        signOut={() => void signOut()}
      />
    </>);
  if (user && room)
    return (<>
      {error && <p role="alert" className="community-error">{error}</p>}
      <RoomieApp
        initialSnapshot={
          initial?.user?.id === user.id && initial.room === room
            ? initial.snapshot
            : undefined
        }
        initialView={
          initial?.user?.id === user.id && initial.room === room
            ? initial.view
            : undefined
        }
        initialMessages={
          initial?.user?.id === user.id && initial.room === room
            ? initial.messages
            : undefined
        }
        key={room}
        user={user}
        houseId={room}
        onCommunity={() => setCommunity(room)}
        onPortal={switchPortal}
        signOut={signOut}
        back={() => setRoom(null)}
      />
    </>);
  if (!user)
    return (
      <main className="auth-page">
        <section className="auth-card">
          <div className="auth-brand">⌂ roomie.</div>
          <h1>{mode === "login" ? "Welcome back" : "Make yourself at home"}</h1>
          <p>Real roommates. Your own room. Everything in one place.</p>
          <PortalSwitch
            value={portal}
            onChange={switchPortal}
            disabled={busy}
          />
          <form onSubmit={submit}>
            {mode === "signup" && (
              <label>
                Your name
                <input
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={60}
                />
              </label>
            )}
            <label>
              Email
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={200}
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
                required
                minLength={mode === "signup" ? 10 : undefined}
                maxLength={128}
              />
            </label>
            {mode === "signup" && (
              <small>
                Use at least 10 characters. You can change your role later.
              </small>
            )}
            {error && (
              <p role="alert" className="auth-error">
                {error}
              </p>
            )}
            <button disabled={busy}>
              {busy
                ? "One sec…"
                : mode === "login"
                  ? "Sign in"
                  : "Create account"}
            </button>
          </form>
          <button
            className="auth-toggle"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setError("");
            }}
          >
            {mode === "login"
              ? "New here? Create an account"
              : "Already have an account? Sign in"}
          </button>
          <button className="auth-toggle" onClick={() => setDemo(true)}>
            Try Demo Mode →
          </button>
          <small>
            Demo Mode uses fictional data. Creating a floor group does not verify university RA status.
          </small>
        </section>
      </main>
    );
  return (
    <main className="account-page">
      <header className="account-top">
        <span className="auth-brand">⌂ roomie.</span>
        <PortalSwitch value={portal} onChange={switchPortal} disabled={busy} />
        <button className="community-secondary" onClick={() => void signOut()}>
          Sign out
        </button>
      </header>
      <div className="account-heading">
        <p className="eyebrow">YOUR ROOMIE ACCOUNT</p>
        <h1>Hey {user.name}.</h1>
        <p className="muted">
          Start your own room, join an assigned room, or organize a floor.
        </p>
      </div>
      {error && (
        <p role="alert" className="community-error">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="community-success">
          {saved}
        </p>
      )}
      <div className="account-grid">
        <section className="panel">
          <h2>
            <Home size={20} />
            Your rooms
          </h2>
          {rooms.length ? (
            rooms.map((r) => (
              <article key={r.id} className="account-room">
                <button className="room-option" onClick={() => setRoom(r.id)}>
                  {r.name}
                  <ArrowRight size={18} />
                </button>
                <button
                  className="auth-toggle"
                  onClick={() => setCommunity(r.id)}
                >
                  Floor connection &amp; requests →
                </button>
                <details>
                  <summary>Manage {r.name}</summary>
                  <p className="muted">
                    {r.ownerId === user.id
                      ? "You own this room."
                      : "Managed by your room owner."}
                  </p>
                  {r.ownerId === user.id && (
                    <>
                      <div className="code-box">
                        <small>
                          {r.inviteEnabled
                            ? "Student invitation"
                            : "Invitation revoked"}
                        </small>
                        <code>
                          {r.inviteEnabled
                            ? r.inviteCode
                            : "Regenerate to invite roommates"}
                        </code>
                      </div>
                      <div className="button-row">
                        <button
                          disabled={busy}
                          onClick={() => void roomAction(r, "rotate_invite")}
                        >
                          Regenerate code
                        </button>
                        <button
                          disabled={busy || !r.inviteEnabled}
                          onClick={() => void roomAction(r, "revoke_invite")}
                        >
                          Revoke code
                        </button>
                      </div>
                    </>
                  )}
                  {r.members.map((m) => (
                    <div className="community-between member-row" key={m.id}>
                      <span>
                        {m.name}
                        {m.id === r.ownerId ? " · owner" : ""}
                      </span>
                      {r.ownerId === user.id && m.id !== user.id && (
                        <div className="button-row">
                          <button
                            disabled={busy}
                            onClick={() =>
                              void roomAction(r, "transfer", { userId: m.id })
                            }
                          >
                            Transfer ownership
                          </button>
                          <button
                            disabled={busy}
                            onClick={() =>
                              void roomAction(r, "remove_member", {
                                userId: m.id,
                              })
                            }
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={r.shareChores}
                      disabled={
                        busy || (!r.shareChores && r.ownerId !== user.id)
                      }
                      onChange={(e) =>
                        void roomAction(r, "share_chores", {
                          enabled: e.target.checked,
                        })
                      }
                    />
                    Share room chore completion totals with the floor manager
                  </label>
                  <small>
                    Only totals are shared. Any roommate can turn sharing off.
                  </small>
                  <button
                    className="danger-button"
                    disabled={busy}
                    onClick={() => void roomAction(r, "leave")}
                  >
                    Leave room
                  </button>
                </details>
              </article>
            ))
          ) : (
            <p className="muted">Your first room starts here.</p>
          )}
          <form
            className="community-form"
            onSubmit={(e) => void roomSubmit(e, "create")}
          >
            <h3>Create your own room</h3>
            <label>
              Room name
              <input
                name="roomName"
                required
                maxLength={80}
                placeholder="Morgens 912"
              />
            </label>
            <button disabled={busy}>Create a room</button>
          </form>
          <form
            className="community-form"
            onSubmit={(e) => void roomSubmit(e, "join")}
          >
            <h3>Join a room</h3>
            <label>
              Student invitation code
              <input
                name="code"
                required
                minLength={16}
                maxLength={32}
                placeholder="Code from your roommate or RA"
                autoComplete="off"
              />
            </label>
            <button disabled={busy}>Join a room</button>
            <small>
              For an unclaimed floor room, the first resident to join becomes
              room owner. Share codes only with assigned residents.
            </small>
          </form>
        </section>
        <div className="community-stack">
          <section className="panel floor-entry">
            <ShieldCheck />
            <h2>Bring your floor together.</h2>
            <p>
              Create a floor group and invite assigned rooms. No admin code is
              needed.
            </p>
            <button onClick={() => switchPortal("ra")}>
              Open floor dashboard <ArrowRight size={16} />
            </button>
            <small>
              Self-organized group · university RA status is unverified.
            </small>
          </section>
          <section className="panel">
            <h2>
              <Users size={20} />
              Your profile &amp; privacy
            </h2>
            <form className="community-form" onSubmit={profile}>
              <label>
                Name
                <input
                  name="name"
                  defaultValue={user.name}
                  required
                  maxLength={60}
                />
              </label>
              <label>
                About you
                <textarea name="bio" defaultValue={user.bio} maxLength={300} />
              </label>
              <label>
                Preferred role
                <select name="role" defaultValue={user.role || "student"}>
                  <option value="student">Student</option>
                  <option value="ra">RA / floor organizer</option>
                </select>
              </label>
              <p className="muted">
                Your role is a preference. It never grants access to another
                room.
              </p>
              <label>
                Phone number
                <input
                  name="phone"
                  type="tel"
                  defaultValue={user.phone || ""}
                  maxLength={40}
                />
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  name="shareEmail"
                  defaultChecked={user.shareEmail}
                />
                Share my email with connected residents and floor manager
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  name="sharePhone"
                  defaultChecked={user.sharePhone}
                />
                Share my phone with connected residents and floor manager
              </label>
              <button disabled={busy}>Save profile &amp; privacy</button>
            </form>
          </section>
          <section className="panel">
            <details>
              <summary>Permanently delete account</summary>
              <p className="muted">
                Your profile, sessions, authored requests, and messages will be
                deleted. Transfer any shared rooms you own first. Floor groups
                you own will be disbanded; occupied student rooms remain.
              </p>
              <form
                className="community-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void run(async () => {
                    await api("/api/auth", {
                      type: "delete_account",
                      password: f.get("password"),
                      confirmation: f.get("confirmation"),
                    });
                    setUser(null);
                    setRoom(null);
                    setCommunity(null);
                    setRooms([]);
                    setSaved("Account deleted.");
                  });
                }}
              >
                <label>
                  Current password
                  <input
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                </label>
                <label>
                  Type DELETE to confirm
                  <input name="confirmation" required pattern="DELETE" />
                </label>
                <button className="danger-button" disabled={busy}>
                  Permanently delete my account
                </button>
              </form>
            </details>
          </section>
        </div>
      </div>
      <button className="auth-toggle" onClick={() => setDemo(true)}>
        Explore Demo Mode →
      </button>
    </main>
  );
}
