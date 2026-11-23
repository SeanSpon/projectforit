"use client";

import { useState, type FormEvent } from "react";
import { ExternalLink, Link2, Mail, Phone, Plus, UserRound, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PAYMENT_PROVIDERS, paymentAccountUrl, type HouseState, type PaymentAccount, type Person } from "@/lib/roomie";

type Act = (action: Record<string, unknown>, success: string) => Promise<boolean>;

export function RepaymentLink({ account }: { account?: PaymentAccount }) {
  if (!account) return null;
  return <a className="repayment-link" href={paymentAccountUrl(account)} target="_blank" rel="noopener noreferrer">Open {account.provider}<ExternalLink size={14}/></a>;
}

export function PaymentAccounts({ state, people, me, busy, act }: { state: HouseState; people: Person[]; me: string; busy: boolean; act: Act }) {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<PaymentAccount["provider"]>("Venmo");
  const [handle, setHandle] = useState("");
  const [error, setError] = useState("");
  const accounts = (state.paymentAccounts ?? []).filter(a => people.some(p => p.id === a.person));
  const mine = accounts.find(a => a.person === me);
  function edit() {
    setProvider(mine?.provider ?? "Venmo");
    setHandle(mine?.handle ?? "");
    setError("");
    setOpen(true);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await act({ type: "link_payment_account", provider, handle }, "Payment link saved for this household")) setOpen(false);
    else setError("Your link wasn’t saved. Review the error and try again.");
  }
  return <>
    <section className="panel payment-panel">
      <div className="payment-intro">
        <span className="stat-icon lime"><Wallet/></span>
        <div><h2>Make settling up easier.</h2><p className="muted">Share your payment link with your roommates. Expenses can be added without linking an account or uploading proof.</p></div>
        <Button variant="outline" disabled={busy} onClick={edit}><Link2 size={16}/>{mine ? "Manage payment account" : "Link payment account"}</Button>
      </div>
      {accounts.length > 0 && <div className="payment-account-list">{accounts.map(account => <div className="payment-account" key={account.person}>
        <div><strong>{people.find(p => p.id === account.person)?.name}{account.person === me ? " (you)" : ""}</strong><span>{account.provider} · {account.provider === "Cash App" ? "$" : "@"}{account.handle}</span></div>
        <RepaymentLink account={account}/>
      </div>)}</div>}
      <p className="payment-note">Repayment links only. Purchases and settlements are self-reported; Roomie does not verify payments or transfer money.</p>
    </section>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
      <DialogContent className="roomie-dialog"><DialogHeader><p className="eyebrow">YOUR HOUSEHOLD</p><DialogTitle>Link payment account</DialogTitle><DialogDescription>Save your public payment username so roommates can open your payment profile to pay you back.</DialogDescription></DialogHeader>
        <form className="roomie-form" onSubmit={save}>
          <div className="field"><Label htmlFor="payment-provider">Payment app</Label><select id="payment-provider" className="feature-select" value={provider} onChange={e => setProvider(e.target.value as PaymentAccount["provider"])}>{PAYMENT_PROVIDERS.map(name => <option key={name}>{name}</option>)}</select></div>
          <div className="field"><Label htmlFor="payment-handle">{provider === "PayPal" ? "PayPal.Me username" : provider === "Cash App" ? "Cashtag" : "Venmo username"}</Label><Input id="payment-handle" value={handle} onChange={e => setHandle(e.target.value)} placeholder={provider === "Cash App" ? "$yourname" : "yourname"} required maxLength={51} autoComplete="off" pattern="[@$]?[A-Za-z0-9_.\-]+" aria-describedby="payment-help"/></div>
          <p id="payment-help" className="feature-help">Your current roommates can see this link. Check your username in your payment app before saving. This saves a repayment link; it does not connect your bank or verify a purchase.</p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="dialog-actions">{mine && <Button type="button" variant="ghost" disabled={busy} onClick={async () => { if (await act({ type: "unlink_payment_account" }, "Payment link removed")) setOpen(false); }}>Remove link</Button>}<Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save payment link"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}

export function AddSpace({ busy, act }: { busy: boolean; act: Act }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (await act({ type: "add_space", name: String(form.get("name") ?? "") }, "New space added to your household")) setOpen(false);
    else setError("Space wasn’t added. Check for a duplicate name and try again.");
  }
  return <>
    <div className="toolbar space-toolbar"><div><h2>Your rooms &amp; shared spaces</h2><p className="muted">Add an extra bedroom, game room, or anywhere you share.</p></div><Button variant="outline" disabled={busy} onClick={() => { setError(""); setOpen(true); }}><Plus size={16}/>Add a room or space</Button></div>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}><DialogContent className="roomie-dialog"><DialogHeader><p className="eyebrow">MAKE ROOM</p><DialogTitle>Add a room or space</DialogTitle><DialogDescription>Create a space your roommates can reserve. It will appear in the reservation menu for everyone in this household.</DialogDescription></DialogHeader><form className="roomie-form" onSubmit={save}><div className="field"><Label htmlFor="space-name">Room or space name</Label><Input id="space-name" name="name" placeholder="Extra bedroom" required maxLength={60}/></div><p className="feature-help">Examples: Bedroom 2, Study room, Balcony. Reservations in each space have their own conflict checks.</p>{error && <p role="alert" className="form-error">{error}</p>}<div className="dialog-actions"><Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Add space"}</Button></div></form></DialogContent></Dialog>
  </>;
}

export function RoommateProfile({ person, state, me, household, onClose, editProfile }: { person?: Person; state?: HouseState; me: string; household?: string; onClose: () => void; editProfile: () => void }) {
  const account = state?.paymentAccounts?.find(a => a.person === person?.id);
  return <Dialog open={!!person} onOpenChange={value => { if (!value) onClose(); }}><DialogContent className="roomie-dialog roommate-profile"><DialogHeader><p className="eyebrow">ROOMMATE PROFILE</p><div className="roommate-profile-title"><span className={`avatar ${person?.color}`}>{person?.initials}</span><div><DialogTitle>{person?.name}{person?.id === me ? " (you)" : ""}</DialogTitle><DialogDescription>Roommate at {household ?? "your household"}</DialogDescription></div></div></DialogHeader>
    <section className="profile-about"><h3>About</h3><p>{person?.bio || "No bio shared yet."}</p></section>
    <div className="profile-stats"><div><strong>{state?.chores.filter(c => c.person === person?.id && !c.done).length ?? 0}</strong><span>Open chores</span></div><div><strong>{state?.bookings.filter(b => b.person === person?.id && b.date >= new Date().toISOString().slice(0,10)).length ?? 0}</strong><span>Upcoming reservations</span></div></div>
    <section className="profile-contact"><h3>Shared contact details</h3>{person?.email && <a href={`mailto:${person.email}`}><Mail size={16}/>{person.email}</a>}{person?.phone && <a href={`tel:${person.phone.replace(/[^+\d]/g, "")}`}><Phone size={16}/>{person.phone}</a>}{!person?.email && !person?.phone && <p className="muted">No contact details shared.</p>}</section>
    {account && <div className="profile-payment"><Wallet size={18}/><span>{account.provider} · {account.provider === "Cash App" ? "$" : "@"}{account.handle}</span><RepaymentLink account={account}/></div>}
    <div className="dialog-actions">{person?.id === me && <Button variant="outline" onClick={() => { onClose(); editProfile(); }}><UserRound size={16}/>Edit my profile</Button>}<Button variant="ghost" onClick={onClose}>Close profile</Button></div>
  </DialogContent></Dialog>;
}
