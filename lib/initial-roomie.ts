import { sql, eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { getNeonDb } from "@/db/neon";
import { residenceGroups } from "@/db/schema";
import { listRooms, readHouse } from "@/lib/households";
import type { RoomieUser, AccountRoom } from "@/components/roomie-gate";
import type { Community, Group, Section } from "@/components/community-app";
import type { Snapshot, View } from "@/lib/roomie";
export type InitialRoomie = {
  user: RoomieUser | null;
  rooms: AccountRoom[];
  portal: "student" | "ra";
  room: string | null;
  community: string | null;
  error: string;
  floor: {
    groups: Group[];
    groupId: string;
    data: Community | null;
    section: Section;
  };
  snapshot: Snapshot | null;
  view: View;
  messages: {
    id: string;
    body: string;
    sender: string;
    senderId: string;
    createdAt: string;
  }[];
};
export async function loadInitialRoomie(
  params: Record<string, string | undefined>,
): Promise<InitialRoomie> {
  const initial: InitialRoomie = {
    user: null,
    rooms: [],
    portal: "student",
    room: null,
    community: null,
    error: "",
    floor: { groups: [], groupId: "", data: null, section: "Overview" },
    snapshot: null,
    view: "Overview",
    messages: [],
  };
  try {
    initial.user = await currentUser();
    if (!initial.user) return initial;
    const user = initial.user,
      db = getNeonDb();
    initial.rooms = await listRooms(user.id);
    initial.portal =
      params.portal === "ra" ||
      (!params.portal && user.role === "ra" && !params.account)
        ? "ra"
        : "student";
    const sections = [
      "Overview",
      "Residents",
      "Room & floor rules",
      "Maintenance",
      "Private help",
      "Announcements",
      "Rooms & invitations",
    ];
    if (sections.includes(params.section || ""))
      initial.floor.section = params.section as Section;
    if (params.community) {
      initial.community = params.community;
      const result = await db.execute(
        sql`SELECT roomie_community_snapshot(${user.id},NULL,${params.community}) AS result`,
      );
      initial.floor.data = result.rows[0].result as Community;
    } else if (initial.portal === "ra") {
      initial.community = "ra";
      initial.floor.groups = await db
        .select({
          id: residenceGroups.id,
          name: residenceGroups.name,
          building: residenceGroups.building,
          floor: residenceGroups.floor,
          inviteCode: residenceGroups.inviteCode,
          inviteEnabled: residenceGroups.inviteEnabled,
        })
        .from(residenceGroups)
        .where(eq(residenceGroups.ownerId, user.id));
      if (params.group) {
        const result = await db.execute(
          sql`SELECT roomie_community_snapshot(${user.id},${params.group},NULL) AS result`,
        );
        initial.floor.groupId = params.group;
        initial.floor.data = result.rows[0].result as Community;
      }
    } else if (params.room) {
      initial.snapshot = await readHouse(params.room, user.id);
      if (!initial.snapshot) throw Error("Unavailable room");
      initial.room = params.room;
      const views = [
        "Overview",
        "Chores",
        "Expenses",
        "Shared spaces",
        "House rules",
        "Messages",
        "How to use",
      ];
      if (views.includes(params.view || "")) initial.view = params.view as View;
      if (initial.view === "Messages") {
        const result = await db.execute(
          sql`SELECT m.id,m.body,u.name AS sender,m.sender_id AS "senderId",m.created_at AS "createdAt" FROM roomie_room_messages m JOIN roomie_users u ON u.id=m.sender_id WHERE m.household_id=${params.room} ORDER BY m.created_at DESC,m.id DESC LIMIT 200`,
        );
        initial.messages = result.rows.reverse() as InitialRoomie["messages"];
      }
    }
  } catch {
    initial.error =
      "We could not open the requested view. Refresh or choose one of your rooms.";
    initial.room = null;
    initial.community = null;
    initial.snapshot = null;
    initial.floor.data = null;
  }
  return initial;
}
