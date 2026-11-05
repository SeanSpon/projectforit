import RoomieGate from "@/components/roomie-gate";
import { loadInitialRoomie } from "@/lib/initial-roomie";
export const dynamic = "force-dynamic";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams,
    params: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw))
    if (typeof value === "string") params[key] = value;
  return <RoomieGate initial={await loadInitialRoomie(params)} />;
}
