"use client";
import { useState, useEffect, type FormEvent } from "react";
type Message = {
  id: string;
  body: string;
  sender: string;
  senderId: string;
  createdAt: string;
};
export default function RoomMessages({
  houseId,
  userId,
  demo,
  initialMessages,
}: {
  houseId: string;
  userId: string;
  demo?: boolean;
  initialMessages?: Message[];
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages ?? []),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const load = async () => {
      if (demo) return;
      try {
        const r = await fetch("/api/messages?room=" + houseId, {
          cache: "no-store",
        });
        const d = (await r.json()) as { messages: Message[]; error?: string };
        if (!r.ok) throw Error(d.error);
        if (active) setMessages(d.messages);
      } catch (e) {
        if (active)
          setError(e instanceof Error ? e.message : "Could not load messages.");
      }
    };
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [houseId, demo]);
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = e.currentTarget,
      body = String(new FormData(form).get("body") || "");
    setBusy(true);
    setError("");
    try {
      if (demo)
        setMessages((m) => [
          ...m,
          {
            id: crypto.randomUUID(),
            body,
            sender: "Alex Taylor",
            senderId: userId,
            createdAt: new Date().toISOString(),
          },
        ]);
      else {
        const r = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ householdId: houseId, body }),
        });
        const d = (await r.json()) as { error?: string };
        if (!r.ok) throw Error(d.error);
        const read = await fetch("/api/messages?room=" + houseId, {
          cache: "no-store",
        });
        const result = (await read.json()) as { messages: Message[] };
        setMessages(result.messages);
      }
      form.reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>Private room conversation</h2>
      <p className="privacy-note">
        Only current roommates can access these messages. Your floor manager
        cannot read them.
      </p>
      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}
      <div className="community-chat">
        {messages.length ? (
          messages.map((m) => (
            <article
              key={m.id}
              className={
                "community-message " + (m.senderId === userId ? "mine" : "")
              }
            >
              <small>{m.sender}</small>
              <p>{m.body}</p>
              <time>{new Date(m.createdAt).toLocaleString()}</time>
            </article>
          ))
        ) : (
          <p className="muted">Make your first plan together.</p>
        )}
      </div>
      <form className="community-form" onSubmit={send}>
        <label>
          Message your roommates
          <textarea name="body" required maxLength={2000} />
        </label>
        <button disabled={busy}>Send room message</button>
      </form>
    </section>
  );
}
