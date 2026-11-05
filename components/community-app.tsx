"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Home,
  LayoutDashboard,
  Users,
  ClipboardList,
  Wrench,
  MessageCircle,
  Megaphone,
  KeyRound,
  RefreshCw,
  Mail,
  Phone,
  ShieldCheck,
  Plus,
} from "lucide-react";
import PortalSwitch, { type Portal } from "@/components/portal-switch";
import type { RoomieUser } from "@/components/roomie-gate";
export type Group = {
  id: string;
  name: string;
  building: string;
  floor: string;
  rules?: string;
  inviteCode?: string;
  inviteEnabled?: boolean;
  raName?: string;
  verified?: boolean;
};
type Resident = {
  id: string;
  name: string;
  bio: string;
  email: string | null;
  phone: string | null;
};
type Room = {
  id: string;
  name: string;
  roomLabel: string;
  ownerId: string | null;
  inviteCode?: string;
  inviteEnabled: boolean;
  shareChores: boolean;
  choreSummary: { done: number; total: number } | null;
  rules: { id: string; title: string; detail: string; category: string }[];
  residents: Resident[];
};
type Report = {
  id: string;
  householdId: string;
  authorId: string;
  author: string;
  title: string;
  body: string;
  category: string;
  status: string;
  photo: string | null;
  createdAt: string;
  updates: { id: string; author: string; body: string; createdAt: string }[];
};
type Connection = {
  id: string;
  householdId?: string;
  groupId?: string;
  name: string;
  roomLabel: string;
};
export type Community = {
  group: Group | null;
  isRA: boolean;
  rooms: Room[];
  reports: Report[];
  announcements: {
    id: string;
    title: string;
    body: string;
    createdAt: string;
  }[];
  connections: Connection[];
};
const navigation = [
  { name: "Overview", icon: LayoutDashboard },
  { name: "Residents", icon: Users },
  { name: "Room & floor rules", icon: ClipboardList },
  { name: "Maintenance", icon: Wrench },
  { name: "Private help", icon: MessageCircle },
  { name: "Announcements", icon: Megaphone },
  { name: "Rooms & invitations", icon: KeyRound },
] as const;
export type Section = (typeof navigation)[number]["name"];
export async function communityApi<T = { id: string }>(
  query = "",
  payload?: unknown,
) {
  const r = await fetch(
    "/api/community" + query,
    payload
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      : { cache: "no-store" },
  );
  const d = (await r.json()) as T & { error?: string };
  if (!r.ok) throw Error(d.error || "Could not connect to your community.");
  return d;
}
async function requestRoom(payload: unknown) {
  const r = await fetch("/api/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const d = (await r.json()) as { error?: string };
  if (!r.ok) throw Error(d.error || "Could not update room.");
}
async function photoData(file: File) {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 10 * 1024 * 1024
  )
    throw Error("Choose a JPG, PNG, or WebP photo under 10 MB.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const value = canvas.toDataURL("image/jpeg", 0.7);
  if (value.length > 700000)
    throw Error("Photo is too large. Choose a smaller image.");
  return value;
}
export default function CommunityApp({
  user,
  roomId,
  back,
  onPortal,
  signOut,
  initial,
}: {
  user: RoomieUser;
  roomId?: string;
  back: () => void;
  onPortal: (portal: Portal) => void;
  signOut: () => void;
  initial?: {
    groups: Group[];
    groupId: string;
    data: Community | null;
    section: Section;
  };
}) {
  const [groups, setGroups] = useState<Group[]>(initial?.groups ?? []),
    [groupId, setGroupId] = useState(initial?.groupId ?? ""),
    [data, setData] = useState<Community | null>(initial?.data ?? null),
    [section, setSection] = useState<Section>(initial?.section ?? "Overview"),
    [selectedRoom, setSelectedRoom] = useState(""),
    [residentSearch, setResidentSearch] = useState(""),
    [requestStatus, setRequestStatus] = useState("All");
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("account");
    url.searchParams.delete("room");
    url.searchParams.delete("view");
    if (roomId) url.searchParams.set("community", roomId);
    else { url.searchParams.set("portal", "ra"); if (groupId) url.searchParams.set("group", groupId); else url.searchParams.delete("group"); }
    url.searchParams.set("section", section);
    window.history.replaceState(null, "", url);
  }, [roomId, groupId, section]);
  const [loading, setLoading] = useState(!initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(""),
    [synced, setSynced] = useState<Date | null>(null);
  const pending = useRef(false),
    generation = useRef(0);
  const query = roomId ? `?room=${roomId}` : groupId ? `?group=${groupId}` : "";
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const v = ++generation.current;
    try {
      if (query) {
        const result = await communityApi<Community>(query);
        if (v === generation.current && !signal?.aborted) setData(result);
      } else {
        const result = await communityApi<{ groups: Group[] }>();
        if (v === generation.current && !signal?.aborted) setGroups(result.groups);
      }
      if (v === generation.current && !signal?.aborted) {setSynced(new Date());setError("");return true;}
    } catch (e) {
      if (v === generation.current && !signal?.aborted)
        setError(e instanceof Error ? e.message : "Could not refresh.");
      return false;
    } finally {
      if (v === generation.current && !signal?.aborted) setLoading(false);
    }
  }, [query]);
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => void refresh(controller.signal));
    const timer = setInterval(() => {
      if (!pending.current && document.visibilityState === "visible") void refresh(controller.signal);
    }, 15000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [refresh]);
  function openGroup(id: string) {
    ++generation.current;
    setGroupId(id);
    setData(null);
    setLoading(true);
    setSelectedRoom("");
    setError("");
    setSaved("");
  }
  async function act(payload: Record<string, unknown>, roomAction = false) {
    if (pending.current) return;
    if (payload.type === "remove_member" && !window.confirm("Remove this resident? Their access ends and the room invitation code changes.")) return false;
    if (payload.type === "disconnect" && !window.confirm("Disconnect this room from the floor? Floor access ends and chore sharing turns off. Private room data stays with the roommates.")) return false;
    pending.current = true;
    setBusy(true);
    setError("");
    setSaved("");
    try {
      if (roomAction) await requestRoom(payload);
      else {
        const result = await communityApi("", payload);
        if (payload.type === "create_group") {
          openGroup(result.id);
          setSection("Overview");
          return true;
        }
      }
      if (!(await refresh())) return false;
      setSaved(
        payload.type === "connect_room"
          ? "Connection requested. Your floor manager must approve it."
          : "Saved.",
      );
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function form(
    e: FormEvent<HTMLFormElement>,
    type: string,
    extra: Record<string, unknown> = {},
  ) {
    e.preventDefault();
    const element = e.currentTarget,
      f = new FormData(element),
      values: Record<string, unknown> = { type, ...extra };
    for (const [key, value] of f.entries())
      if (typeof value === "string") values[key] = value;
    const photo = f.get("photo");
    if (photo instanceof File && photo.size) {
      try {
        values.photo = await photoData(photo);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not attach photo.");
        return;
      }
    }
    if (
      (await act(values)) &&
      ["report", "announce", "create_room", "update_request"].includes(type)
    )
      element.reset();
  }
  const manager = !roomId,
    group = data?.group,
    rooms = data?.rooms ?? [],
    currentRoom = rooms.find((r) => r.id === (roomId || selectedRoom)),
    visibleRooms = selectedRoom
      ? rooms.filter((r) => r.id === selectedRoom)
      : rooms;
  const residentRooms = visibleRooms.map(r => ({ ...r, residents: r.residents.filter(p =>
    `${r.name} ${r.roomLabel} ${p.name} ${p.bio} ${p.email || ""}`.toLowerCase().includes(residentSearch.trim().toLowerCase()))
  })).filter(r => !residentSearch.trim() || r.residents.length > 0 || `${r.name} ${r.roomLabel}`.toLowerCase().includes(residentSearch.trim().toLowerCase()));
  const reports = (data?.reports ?? []).filter(
    (r) =>
      (!selectedRoom || r.householdId === selectedRoom) &&
      (requestStatus === "All" || r.status === requestStatus) &&
      (section === "Maintenance"
        ? r.category === "Maintenance"
        : r.category !== "Maintenance"),
  );
  const choose = (name: Section) => {
    setSection(name);
    setError("");
    setSaved("");
  };
  function invitationBox(room: Room) {
    return (
      <div className="code-box">
        <small>Student invitation · {room.name}</small>
        <code>{room.inviteEnabled ? room.inviteCode : "Revoked"}</code>
        <div className="button-row">
          <button
            disabled={busy}
            onClick={() =>
              void act({ type: "rotate_invite", householdId: room.id }, true)
            }
          >
            Regenerate
          </button>
          <button
            disabled={busy || !room.inviteEnabled}
            onClick={() =>
              void act({ type: "revoke_invite", householdId: room.id }, true)
            }
          >
            Revoke
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="floor-layout">
      <aside className="floor-sidebar">
        <button
          type="button"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            back();
          }}
        >
          <span>
            <Home />
          </span>
          roomie.
        </button>
        <div className="floor-sidebar-group">
          <Building2 size={20} />
          <div>
            <strong>{group?.name || "Your floor groups"}</strong>
            <small>
              {manager ? "RA / floor organizer" : "Student community"}
            </small>
          </div>
        </div>
        <p className="nav-caption">YOUR COMMUNITY</p>
        <nav aria-label="Floor navigation">
          {navigation.map((n) => (
            <a
              href={
                "/?" +
                new URLSearchParams({
                  ...(!roomId
                    ? { portal: "ra", group: groupId }
                    : { community: roomId }),
                  section: n.name,
                }).toString()
              }
              key={n.name}
              aria-current={section === n.name ? "page" : undefined}
              className={section === n.name ? "active" : ""}
              onClick={(e) => {
                e.preventDefault();
                choose(n.name);
              }}
            >
              <n.icon size={19} />
              {n.name}
            </a>
          ))}
        </nav>
        <div className="floor-sidebar-bottom">
          <strong>{user.name}</strong>
          <small>{user.email}</small>
          <button onClick={back}>Rooms &amp; profile</button>
          <button onClick={signOut}>Sign out</button>
        </div>
      </aside>
      <div className="floor-main">
        <header className="topbar">
          <span>
            <Building2 size={16} /> {group?.name || "Roomie community"}
          </span>
          <PortalSwitch
            value={manager ? "ra" : "student"}
            onChange={onPortal}
          />
          <button
            className="community-secondary"
            disabled={busy}
            onClick={() => void refresh()}
          >
            <RefreshCw size={15} />
            Refresh
          </button>
        </header>
        <main className="workspace community-workspace">
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {group
                  ? `${group.building} · FLOOR ${group.floor}`
                  : "ROOMIE · CONNECTED LIVING"}
              </p>
              <h1>
                {group
                  ? section === "Overview"
                    ? manager
                      ? "Your floor, connected."
                      : "Your room. Your community."
                    : section
                  : manager
                    ? "Your floor groups."
                    : "Connect your room."}
              </h1>
              <p className="muted">
                {manager
                  ? "Organize rooms and keep residents in the loop."
                  : "Keep your own room features, with a simple connection to your floor."}
              </p>
            </div>
            {group && manager && (
              <button
                className="community-secondary"
                onClick={() => {
                  openGroup("");
                  setSection("Overview");
                }}
              >
                All floor groups
              </button>
            )}
          </div>
          {error && (
            <div role="alert" className="community-error">
              {error}
            </div>
          )}
          {saved && (
            <p role="status" className="community-success">
              {saved}
            </p>
          )}
          {loading && (
            <section className="panel" role="status">
              Loading your community…
            </section>
          )}
          {!loading && !group && manager && (
            <div className="community-grid">
              <section className="panel">
                <h2>Your groups</h2>
                {groups.length ? (
                  groups.map((g) => (
                    <a
                      href={"/?portal=ra&group=" + g.id}
                      className="community-room"
                      key={g.id}
                      onClick={(e) => {
                        e.preventDefault();
                        openGroup(g.id);
                      }}
                    >
                      <Building2 />
                      <strong>{g.name}</strong>
                      <span>
                        {g.building} · Floor {g.floor} →
                      </span>
                    </a>
                  ))
                ) : (
                  <p className="muted">
                    Create a group, then add assigned rooms or approve existing
                    rooms.
                  </p>
                )}
              </section>
              <section className="panel">
                <h2>Create a floor group</h2>
                <form
                  className="community-form"
                  onSubmit={(e) => void form(e, "create_group")}
                >
                  <label>
                    Group name
                    <input
                      name="name"
                      required
                      maxLength={80}
                      placeholder="Morgens Hall — Floor 9"
                    />
                  </label>
                  <label>
                    Building
                    <input
                      name="building"
                      required
                      maxLength={80}
                      placeholder="Morgens Hall"
                    />
                  </label>
                  <label>
                    Floor
                    <input
                      name="floor"
                      required
                      maxLength={20}
                      placeholder="9"
                    />
                  </label>
                  <p className="privacy-note">
                    Anyone can organize a group. This does not verify that you
                    are a university RA. Residents choose whether to join.
                  </p>
                  <button disabled={busy}>
                    <Plus size={16} />
                    Create floor group
                  </button>
                </form>
              </section>
            </div>
          )}
          {!loading && !group && !manager && (
            <section className="panel community-narrow">
              <h2>Bring your existing room.</h2>
              <p className="muted">
                Your room owner enters a separate floor connection code. Your
                floor manager then approves the connection. Your finances and
                roommate conversations remain private.
              </p>
              {data?.connections.length ? (
                <>
                  {data.connections.map((c) => (
                    <div className="community-notice" key={c.id}>
                      <h3>Waiting for {c.name}</h3>
                      <p>Room {c.roomLabel} · approval pending</p>
                      <button
                        className="community-secondary"
                        disabled={busy}
                        onClick={() =>
                          void act({
                            type: "cancel_connection",
                            householdId: roomId,
                          })
                        }
                      >
                        Cancel connection request
                      </button>
                    </div>
                  ))}
                </>
              ) : (
                <form
                  className="community-form"
                  onSubmit={(e) =>
                    void form(e, "connect_room", { householdId: roomId })
                  }
                >
                  <label>
                    Floor connection code
                    <input name="code" required minLength={16} maxLength={32} />
                  </label>
                  <label>
                    Assigned room number
                    <input
                      name="roomLabel"
                      required
                      maxLength={80}
                      placeholder="912"
                    />
                  </label>
                  <p className="privacy-note">
                    Connecting shares resident names, bios, room rules, and any
                    contacts each resident opts to share. Chore totals start
                    private.
                  </p>
                  <button disabled={busy}>Request floor connection</button>
                </form>
              )}
            </section>
          )}
          {!loading && group && (
            <>
              <div className="floor-context">
                <span className="community-pill">
                  Self-organized floor · RA status unverified
                </span>
                {manager && rooms.length > 0 && (
                  <label>
                    Room filter
                    <select
                      aria-label="Room filter"
                      value={selectedRoom}
                      onChange={(e) => setSelectedRoom(e.target.value)}
                    >
                      <option value="">All rooms</option>
                      {rooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              {section === "Overview" && (
                <>
                  <section className="floor-hero">
                    <div>
                      <p className="eyebrow">{group.name}</p>
                      <h2>
                        {manager
                          ? "A little more connected."
                          : "Connected to " + group.raName}
                      </h2>
                      <p>
                        {manager
                          ? "A simple home for your floor, with room for everyone’s privacy."
                          : "The same Roomie features, plus floor updates and support."}
                      </p>
                    </div>
                    <Building2 size={58} />
                  </section>
                  <div className="floor-stats">
                    <div>
                      <Home />
                      <strong>{rooms.length}</strong>
                      <span>Rooms</span>
                    </div>
                    <div>
                      <Users />
                      <strong>
                        {rooms.reduce((n, r) => n + r.residents.length, 0)}
                      </strong>
                      <span>Residents</span>
                    </div>
                    <div>
                      <Wrench />
                      <strong>
                        {
                          data!.reports.filter((r) => r.status !== "Resolved")
                            .length
                        }
                      </strong>
                      <span>Open requests</span>
                    </div>
                  </div>
                  <h2 className="section-title">
                    {manager ? "Floor management" : "Your community"}
                  </h2>
                  <div className="floor-shortcuts">
                    {navigation.slice(1).map((n) => (
                      <button key={n.name} onClick={() => choose(n.name)}>
                        <n.icon size={23} />
                        <strong>{n.name}</strong>
                        <ArrowRight size={17} />
                      </button>
                    ))}
                  </div>
                  <p className="privacy-note">
                    <ShieldCheck size={17} />
                    Floor managers cannot access expenses, private roommate
                    messages, individual chore assignments, or unshared contact
                    details.
                  </p>
                </>
              )}
              {section === "Residents" && (
                <div className="community-stack">
                  <label className="community-form">Search residents or rooms
                    <input type="search" value={residentSearch} onChange={e => setResidentSearch(e.target.value)} placeholder="Name, room, or shared email" />
                  </label>
                  {!residentRooms.length && <p role="status" className="muted">No residents or rooms match that search.</p>}
                <div className="resident-grid">
                  {residentRooms.map((r) => (
                    <section className="panel" key={r.id}>
                      <h2>
                        <Home size={19} />
                        {r.name}
                      </h2>
                      {r.residents.length ? (
                        r.residents.map((p) => (
                          <article className="resident-card" key={p.id}>
                            <span className="resident-avatar">
                              {p.name.slice(0, 1)}
                            </span>
                            <div>
                              <h3>
                                {p.name}
                                {r.ownerId === p.id && (
                                  <small> · room owner</small>
                                )}
                              </h3>
                              <p className="muted">
                                {p.bio || "No bio shared yet."}
                              </p>
                              <div className="contact-buttons">
                                {p.email ? (
                                  <a href={`mailto:${p.email}`}>
                                    <Mail size={15} />
                                    {p.email}
                                  </a>
                                ) : (
                                  <small>Email private</small>
                                )}
                                {p.phone ? (
                                  <a
                                    href={`tel:${p.phone.replace(/[^+0-9]/g, "")}`}
                                  >
                                    <Phone size={15} />
                                    {p.phone}
                                  </a>
                                ) : (
                                  <small>Phone private</small>
                                )}
                              </div>
                              {manager && p.id !== r.ownerId && (
                                <button
                                  className="danger-button"
                                  disabled={busy}
                                  onClick={() =>
                                    void act(
                                      {
                                        type: "remove_member",
                                        householdId: r.id,
                                        userId: p.id,
                                      },
                                      true,
                                    )
                                  }
                                >
                                  Remove {p.name} from room
                                </button>
                              )}
                            </div>
                          </article>
                        ))
                      ) : (
                        <p className="muted">
                          Waiting for assigned residents to join.
                        </p>
                      )}
                    </section>
                  ))}
                </div>
                </div>
              )}
              {section === "Room & floor rules" && (
                <div className="community-grid">
                  <section className="panel">
                    <h2>
                      <ClipboardList size={19} />
                      Floor rules
                    </h2>
                    <p className="rule-text">
                      {group.rules || "No floor rules posted yet."}
                    </p>
                    {manager && (
                      <form
                        className="community-form"
                        key={group.id}
                        onSubmit={(e) =>
                          void form(e, "floor_rules", { groupId: group.id })
                        }
                      >
                        <label>
                          Floor rules
                          <textarea
                            name="body"
                            defaultValue={group.rules}
                            maxLength={4000}
                          />
                        </label>
                        <button disabled={busy}>Save floor rules</button>
                      </form>
                    )}
                  </section>
                  <div className="community-stack">
                    {visibleRooms.map((r) => (
                      <section className="panel" key={r.id}>
                        <h2>{r.name} · room rules</h2>
                        {r.rules.length ? (
                          r.rules.map((rule) => (
                            <article className="community-notice" key={rule.id}>
                              <h3>{rule.title}</h3>
                              <p>{rule.detail}</p>
                              <small>{rule.category}</small>
                            </article>
                          ))
                        ) : (
                          <p className="muted">
                            Residents haven’t proposed room rules yet.
                          </p>
                        )}
                        <p className="privacy-note">
                          Residents manage their own room agreements.
                        </p>
                        {r.choreSummary ? (
                          <p className="completion-note">
                            Room opted in · {r.choreSummary.done} of{" "}
                            {r.choreSummary.total} chores complete
                          </p>
                        ) : (
                          <p className="muted">Chore completion is private.</p>
                        )}
                      </section>
                    ))}
                  </div>
                </div>
              )}
              {(section === "Maintenance" || section === "Private help") && (
                <div className="community-grid">
                  <section className="panel">
                    <h2>
                      {section === "Maintenance" ? (
                        <Wrench size={19} />
                      ) : (
                        <MessageCircle size={19} />
                      )}{" "}
                      {section === "Maintenance"
                        ? "Maintenance requests"
                        : "Private help requests"}
                    </h2>
                    <p className="privacy-note">
                      {section === "Maintenance"
                        ? "Visible to the reporting room and its current floor manager."
                        : "Only the author and their current floor manager can read or update each help request."}
                    </p>
                    <label className="community-form">Filter request status
                      <select value={requestStatus} onChange={e => setRequestStatus(e.target.value)}>
                        {["All", "Open", "In progress", "Resolved"].map(status => <option key={status}>{status}</option>)}
                      </select>
                    </label>
                    {reports.length ? (
                      reports.map((r) => (
                        <article className="request-card" key={r.id}>
                          <div className="community-between">
                            <h3>{r.title}</h3>
                            <span className="community-pill">{r.status}</span>
                          </div>
                          <small>
                            {
                              rooms.find((room) => room.id === r.householdId)
                                ?.name
                            }{" "}
                            · {r.author} ·{" "}
                            {new Date(r.createdAt).toLocaleDateString()}
                          </small>
                          <p>{r.body}</p>
                          {r.photo && (
                            <img
                              className="request-photo"
                              src={r.photo}
                              alt={`Photo attached to ${r.title}`}
                            />
                          )}
                          {manager && (
                            <label className="community-status">
                              Status
                              <select
                                aria-label={`Status for ${r.title}`}
                                value={r.status}
                                disabled={busy}
                                onChange={(e) =>
                                  void act({
                                    type: "status",
                                    reportId: r.id,
                                    status: e.target.value,
                                  })
                                }
                              >
                                {["Open", "In progress", "Resolved"].map(
                                  (s) => (
                                    <option key={s}>{s}</option>
                                  ),
                                )}
                              </select>
                            </label>
                          )}
                          {r.updates.map((u) => (
                            <div className="request-update" key={u.id}>
                              <strong>{u.author}</strong>
                              <p>{u.body}</p>
                              <small>
                                {new Date(u.createdAt).toLocaleString()}
                              </small>
                            </div>
                          ))}
                          {(manager || r.authorId === user.id) && (
                            <form
                              className="community-form"
                              onSubmit={(e) =>
                                void form(e, "update_request", {
                                  reportId: r.id,
                                })
                              }
                            >
                              <label>
                                Update for {r.title}
                                <textarea
                                  name="body"
                                  required
                                  maxLength={2000}
                                />
                              </label>
                              <button disabled={busy}>Add update</button>
                            </form>
                          )}
                        </article>
                      ))
                    ) : (
                      <p className="muted">
                        No{" "}
                        {section === "Maintenance"
                          ? "maintenance"
                          : "private help"}{" "}
                        requests yet.
                      </p>
                    )}
                  </section>
                  {!manager ? (
                    <section className="panel">
                      <h2>
                        {section === "Maintenance"
                          ? "Report maintenance"
                          : "Ask for private help"}
                      </h2>
                      <form
                        className="community-form"
                        key={section}
                        onSubmit={(e) =>
                          void form(e, "report", {
                            householdId: roomId,
                            category:
                              section === "Maintenance"
                                ? "Maintenance"
                                : "Private help",
                          })
                        }
                      >
                        <label>
                          Request subject
                          <input name="title" required maxLength={80} />
                        </label>
                        <label>
                          Request details
                          <textarea name="body" required maxLength={2000} />
                        </label>
                        {section === "Maintenance" && (
                          <label>
                            Photo (optional)
                            <input
                              name="photo"
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                            />
                          </label>
                        )}
                        <p className="privacy-note">
                          {section === "Private help"
                            ? "Your roommates cannot see this request."
                            : "Photos are stored privately with this request. Use JPG, PNG, or WebP under 10 MB."}
                        </p>
                        <button disabled={busy}>
                          Submit{" "}
                          {section === "Maintenance"
                            ? "maintenance"
                            : "private help"}{" "}
                          request
                        </button>
                      </form>
                    </section>
                  ) : (
                    <section className="panel">
                      <h2>Keep residents updated.</h2>
                      <p className="muted">
                        Change a request’s status and add an update so residents
                        know what happens next.
                      </p>
                      <p className="privacy-note">
                        Roomie requests are not an official university work
                        order or emergency service.
                      </p>
                    </section>
                  )}
                </div>
              )}
              {section === "Announcements" && (
                <div className="community-grid">
                  <section className="panel">
                    <h2>
                      <Megaphone size={19} />
                      Floor announcements
                    </h2>
                    {data!.announcements.length ? (
                      data!.announcements.map((n) => (
                        <article className="community-notice" key={n.id}>
                          <h3>{n.title}</h3>
                          <p>{n.body}</p>
                          <small>
                            {new Date(n.createdAt).toLocaleString()}
                          </small>
                        </article>
                      ))
                    ) : (
                      <p className="muted">No announcements yet.</p>
                    )}
                  </section>
                  {manager && (
                    <section className="panel">
                      <h2>Post to your floor</h2>
                      <form
                        className="community-form"
                        onSubmit={(e) =>
                          void form(e, "announce", { groupId: group.id })
                        }
                      >
                        <label>
                          Announcement title
                          <input name="title" required maxLength={80} />
                        </label>
                        <label>
                          Announcement message
                          <textarea name="body" required maxLength={2000} />
                        </label>
                        <button disabled={busy}>Post announcement</button>
                      </form>
                    </section>
                  )}
                </div>
              )}
              {section === "Rooms & invitations" && (
                <div className="community-grid">
                  <div className="community-stack">
                    <section className="panel">
                      <h2>
                        <Home size={19} />
                        Room directory
                      </h2>
                      {visibleRooms.map((r) => (
                        <article className="community-notice" key={r.id}>
                          <div className="community-between">
                            <h3>{r.name}</h3>
                            <span className="community-pill">
                              {r.residents.length} residents
                            </span>
                          </div>
                          <p className="muted">
                            {r.ownerId
                              ? "Resident-owned room"
                              : "Unclaimed · first invited resident becomes owner"}
                          </p>
                          {(manager || r.ownerId === user.id) &&
                            invitationBox(r)}
                          <button
                            className="community-secondary"
                            disabled={busy}
                            onClick={() =>
                              void act({
                                type: "disconnect",
                                householdId: r.id,
                              })
                            }
                          >
                            Disconnect {r.name} from floor
                          </button>
                        </article>
                      ))}
                      {!rooms.length && (
                        <p className="muted">
                          Add rooms below or approve an existing room.
                        </p>
                      )}
                    </section>
                    {manager && (
                      <section className="panel">
                        <h2>Connection approvals</h2>
                        {data!.connections.length ? (
                          data!.connections.map((c) => (
                            <article className="community-notice" key={c.id}>
                              <h3>{c.name}</h3>
                              <p>
                                Requests room number {c.roomLabel}. Confirm the
                                assigned room before approving.
                              </p>
                              <div className="button-row">
                                <button
                                  disabled={busy}
                                  onClick={() =>
                                    void act({
                                      type: "approve_connection",
                                      requestId: c.id,
                                    })
                                  }
                                >
                                  Approve {c.roomLabel}
                                </button>
                                <button
                                  disabled={busy}
                                  onClick={() =>
                                    void act({
                                      type: "reject_connection",
                                      requestId: c.id,
                                    })
                                  }
                                >
                                  Decline
                                </button>
                              </div>
                            </article>
                          ))
                        ) : (
                          <p className="muted">No pending room connections.</p>
                        )}
                      </section>
                    )}
                  </div>
                  <div className="community-stack">
                    {manager && (
                      <>
                        <section className="panel">
                          <h2>Create an assigned room</h2>
                          <form
                            className="community-form"
                            onSubmit={(e) =>
                              void form(e, "create_room", { groupId: group.id })
                            }
                          >
                            <label>
                              Room number
                              <input
                                name="roomLabel"
                                required
                                maxLength={80}
                                placeholder="901"
                              />
                            </label>
                            <label>
                              Display name
                              <input
                                name="name"
                                required
                                maxLength={80}
                                placeholder="Morgens 901"
                              />
                            </label>
                            <button disabled={busy}>
                              <Plus size={16} />
                              Create assigned room
                            </button>
                            <small>
                              Share its student invitation only with assigned
                              residents. You won’t become a roommate or see
                              private room data.
                            </small>
                          </form>
                        </section>
                        <section className="panel">
                          <h2>Connect existing rooms</h2>
                          <p className="muted">
                            Share this separate code with room owners. Every
                            request needs your approval.
                          </p>
                          <div className="code-box">
                            <small>Floor connection code</small>
                            <code>
                              {group.inviteEnabled
                                ? group.inviteCode
                                : "Revoked"}
                            </code>
                          </div>
                          <div className="button-row">
                            <button
                              disabled={busy}
                              onClick={() =>
                                void act({
                                  type: "rotate_group",
                                  groupId: group.id,
                                })
                              }
                            >
                              Regenerate floor code
                            </button>
                            <button
                              disabled={busy || !group.inviteEnabled}
                              onClick={() =>
                                void act({
                                  type: "revoke_group",
                                  groupId: group.id,
                                })
                              }
                            >
                              Revoke floor code
                            </button>
                          </div>
                        </section>
                      </>
                    )}
                    {!manager && currentRoom && (
                      <section className="panel">
                        <h2>Your sharing choices</h2>
                        <p className="muted">
                          Contacts are controlled separately by each resident in
                          Rooms &amp; profile.
                        </p>
                        <label className="check-label">
                          <input
                            type="checkbox"
                            checked={currentRoom.shareChores}
                            disabled={
                              busy ||
                              (!currentRoom.shareChores &&
                                currentRoom.ownerId !== user.id)
                            }
                            onChange={(e) =>
                              void act(
                                {
                                  type: "share_chores",
                                  householdId: currentRoom.id,
                                  enabled: e.target.checked,
                                },
                                true,
                              )
                            }
                          />
                          Share only room chore completion totals
                        </label>
                        <p className="privacy-note">
                          Any roommate can revoke chore sharing or disconnect
                          from the floor. Expenses and private roommate messages
                          are never shared.
                        </p>
                        <button className="community-secondary" onClick={back}>
                          <ArrowLeft size={15} />
                          Rooms &amp; profile
                        </button>
                      </section>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
          <footer className="community-footer">
            {busy
              ? "Saving…"
              : error
                ? "Refresh needed · Last saved data"
              : synced
                ? `Synced ${synced.toLocaleTimeString()} · Updates every 15 seconds`
                : initial
                  ? "Saved data loaded"
                  : "Connecting…"}
          </footer>
        </main>
      </div>
    </div>
  );
}
