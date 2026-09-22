export const TODAY = "2026-09-16";
export const ME = "alex";
export const people = [
  { id: "alex", name: "Alex", initials: "AT", color: "lime" },
  { id: "jordan", name: "Jordan", initials: "JC", color: "blue" },
  { id: "maya", name: "Maya", initials: "MB", color: "pink" },
  { id: "eli", name: "Eli", initials: "EF", color: "peach" },
];
export type View = "Overview" | "Chores" | "Expenses" | "Shared spaces" | "House rules";
export type Chore = { id: string; title: string; person: string; date: string; area: string; minutes: number; done: boolean };
export type Expense = { id: string; title: string; cents: number; paidBy: string; category: string; date: string; settledBy: string[] };
export type Booking = { id: string; title: string; space: string; person: string; date: string; start: string; end: string };
export type Rule = { id: string; title: string; detail: string; votes: string[]; category: string };
export type Activity = { id: string; person: string; text: string; when: string };
export type HouseState = { chores: Chore[]; expenses: Expense[]; bookings: Booking[]; rules: Rule[]; activity: Activity[] };
export type Snapshot = { state: HouseState; version: number };
export const seedState: HouseState = {
  chores: [
    { id: "c1", title: "Take out the recycling", person: "alex", date: TODAY, area: "Kitchen", minutes: 5, done: false },
    { id: "c2", title: "Wipe down the counters", person: "alex", date: TODAY, area: "Kitchen", minutes: 10, done: false },
    { id: "c3", title: "Vacuum the living room", person: "jordan", date: TODAY, area: "Living room", minutes: 20, done: false },
    { id: "c4", title: "Clean the bathroom", person: "maya", date: "2026-09-17", area: "Bathroom", minutes: 25, done: false },
    { id: "c5", title: "Empty the dishwasher", person: "eli", date: TODAY, area: "Kitchen", minutes: 10, done: true },
    { id: "c6", title: "Sweep the kitchen", person: "jordan", date: "2026-09-15", area: "Kitchen", minutes: 10, done: true },
    { id: "c7", title: "Restock hand soap", person: "maya", date: "2026-09-15", area: "Bathroom", minutes: 5, done: true },
    { id: "c8", title: "Water the plants", person: "eli", date: "2026-09-17", area: "Living room", minutes: 5, done: false },
  ],
  expenses: [
    { id: "e1", title: "Weekly groceries", cents: 3684, paidBy: "jordan", category: "Groceries", date: TODAY, settledBy: [] },
    { id: "e2", title: "September Wi-Fi", cents: 4800, paidBy: "alex", category: "Utilities", date: "2026-09-15", settledBy: [] },
    { id: "e3", title: "Cleaning supplies", cents: 2400, paidBy: "maya", category: "Supplies", date: "2026-09-14", settledBy: ["eli"] },
  ],
  bookings: [
    { id: "b1", title: "Movie night", space: "Living room", person: "eli", date: TODAY, start: "19:00", end: "21:30" },
    { id: "b2", title: "Meal prep", space: "Kitchen", person: "maya", date: "2026-09-17", start: "17:00", end: "18:00" },
    { id: "b3", title: "Group study", space: "Living room", person: "alex", date: "2026-09-18", start: "14:00", end: "16:00" },
  ],
  rules: [
    { id: "r1", title: "Quiet hours", detail: "10 PM–8 AM, Sunday through Thursday. Headphones after 10, please.", votes: people.map(p => p.id), category: "Noise" },
    { id: "r2", title: "Give a guest heads-up", detail: "Let the house know before friends come over. Check with everyone for overnight guests.", votes: people.map(p => p.id), category: "Guests" },
    { id: "r3", title: "Leave the kitchen ready", detail: "Wash your dishes and wipe the counter when you finish cooking.", votes: people.map(p => p.id), category: "Shared spaces" },
    { id: "r4", title: "Sunday house reset", detail: "A quick 15-minute tidy together at 6 PM on Sundays.", votes: ["jordan", "maya", "eli"], category: "Chores" },
  ],
  activity: [
    { id: "a1", person: "eli", text: "emptied the dishwasher. One less thing.", when: "Sample activity" },
    { id: "a2", person: "jordan", text: "added the grocery run. Split four ways.", when: "Sample activity" },
    { id: "a3", person: "maya", text: "agreed to the Sunday house reset.", when: "Sample activity" },
  ],
};
export const personName = (id: string) => people.find(p => p.id === id)?.name ?? "Roommate";
export const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
export function shareFor(cents: number, person: string) {
  const index = people.findIndex(p => p.id === person);
  if (index < 0 || !Number.isSafeInteger(cents) || cents < 0) throw new Error("Invalid split");
  return Math.floor(cents / people.length) + (index < cents % people.length ? 1 : 0);
}
export const amountOwed = (expenses: Expense[], person: string) => expenses.filter(e => e.paidBy !== person && !e.settledBy.includes(person)).reduce((sum,e) => sum + shareFor(e.cents, person), 0);
export const amountReceivable = (expenses: Expense[], person: string) => expenses.filter(e => e.paidBy === person).reduce((sum,e) => sum + people.filter(p => p.id !== person && !e.settledBy.includes(p.id)).reduce((s,p) => s + shareFor(e.cents, p.id), 0), 0);
export function bookingConflict(b: Pick<Booking, "space" | "date" | "start" | "end">, bookings: Booking[]) {
  return bookings.some(item => item.date === b.date && item.space === b.space && b.start < item.end && b.end > item.start);
}
export function timeLabel(time: string) { const [h,m] = time.split(":").map(Number); return `${h % 12 || 12}${m ? `:${String(m).padStart(2,"0")}` : ""} ${h >= 12 ? "PM" : "AM"}`; }
export function dateLabel(date: string) { return date === TODAY ? "Today" : date === "2026-09-17" ? "Tomorrow" : new Date(date + "T12:00:00Z").toLocaleDateString("en-US", { month:"short", day:"numeric", timeZone:"UTC" }); }
