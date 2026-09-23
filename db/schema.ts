import { pgTable, text, integer, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { HouseState } from "../lib/roomie";
export const households = pgTable("roomie_households", {
  id: text("id").primaryKey(),
  state: jsonb("state").$type<HouseState>().notNull(),
  version: integer("version").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const users = pgTable("roomie_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  person: text("person").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => ({ emailUnique: uniqueIndex("roomie_users_email_unique").on(table.email), personUnique: uniqueIndex("roomie_users_person_unique").on(table.person) }));
export const sessions = pgTable("roomie_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
