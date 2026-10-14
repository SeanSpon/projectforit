import { pgTable, text, integer, jsonb, timestamp, uniqueIndex, primaryKey } from "drizzle-orm/pg-core";
import type { HouseState } from "../lib/roomie";
export const households = pgTable("roomie_households", {
  id: text("id").primaryKey(), name: text("name").notNull().default("My household"),
  inviteCode: text("invite_code").notNull(), ownerId: text("owner_id").notNull(),
  state: jsonb("state").$type<HouseState>().notNull(), version: integer("version").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex("roomie_households_invite_unique").on(table.inviteCode)]);
export const users = pgTable("roomie_users", {
  id: text("id").primaryKey(), email: text("email").notNull(), passwordHash: text("password_hash").notNull(),
  person: text("person").notNull(), name: text("name").notNull(), bio: text("bio").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex("roomie_users_email_unique").on(table.email)]);
export const memberships = pgTable("roomie_memberships", {
  householdId: text("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.householdId, table.userId] })]);
export const sessions = pgTable("roomie_sessions", {
  tokenHash: text("token_hash").primaryKey(), userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
