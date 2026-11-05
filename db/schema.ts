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
  role: text("role").notNull().default("student"),
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

export const residenceGroups = pgTable("roomie_residence_groups", {
  id: text("id").primaryKey(), name: text("name").notNull(), building: text("building").notNull(),
  floor: text("floor").notNull(), ownerId: text("owner_id").notNull().references(() => users.id),
  inviteCode: text("invite_code").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [uniqueIndex("roomie_groups_invite_unique").on(t.inviteCode)]);
export const groupRooms = pgTable("roomie_group_rooms", {
  householdId: text("household_id").primaryKey().references(() => households.id, { onDelete: "cascade" }),
  groupId: text("group_id").notNull().references(() => residenceGroups.id, { onDelete: "cascade" }),
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
});
export const residenceMessages = pgTable("roomie_residence_messages", {
  id: text("id").primaryKey(), groupId: text("group_id").notNull().references(() => residenceGroups.id, { onDelete: "cascade" }),
  householdId: text("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  senderId: text("sender_id").notNull().references(() => users.id), body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export const residenceReports = pgTable("roomie_residence_reports", {
  id: text("id").primaryKey(), groupId: text("group_id").notNull().references(() => residenceGroups.id, { onDelete: "cascade" }),
  householdId: text("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull().references(() => users.id), title: text("title").notNull(),
  body: text("body").notNull(), category: text("category").notNull(), status: text("status").default("Open").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export const residenceAnnouncements = pgTable("roomie_residence_announcements", {
  id: text("id").primaryKey(), groupId: text("group_id").notNull().references(() => residenceGroups.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull().references(() => users.id), title: text("title").notNull(), body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export const raInvites = pgTable("roomie_ra_invites", {
  codeHash: text("code_hash").primaryKey(), email: text("email").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
});
