import { pgTable, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import type { HouseState } from "../lib/roomie";
export const households = pgTable("roomie_households", {
  id: text("id").primaryKey(),
  state: jsonb("state").$type<HouseState>().notNull(),
  version: integer("version").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
