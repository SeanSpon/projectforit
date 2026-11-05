"use client";
import { GraduationCap, ShieldCheck } from "lucide-react";
export type Portal = "student" | "ra";
export default function PortalSwitch({ value, onChange, disabled = false }: { value: Portal; onChange: (portal: Portal) => void; disabled?: boolean }) {
  return <div className="portal-switch" aria-label="Choose your account portal">{(["student", "ra"] as const).map(portal => <button type="button" key={portal} disabled={disabled} aria-pressed={value === portal} className={value === portal ? "selected" : ""} onClick={() => onChange(portal)}>{portal === "student" ? <GraduationCap size={19}/> : <ShieldCheck size={19}/>}<span>{portal === "student" ? "Student" : "Resident Assistant"}</span></button>)}</div>;
}
