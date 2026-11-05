CREATE TABLE "roomie_group_rooms" (
	"household_id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roomie_residence_announcements" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"author_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roomie_residence_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"building" text NOT NULL,
	"floor" text NOT NULL,
	"owner_id" text NOT NULL,
	"invite_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roomie_residence_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"household_id" text NOT NULL,
	"sender_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roomie_residence_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"household_id" text NOT NULL,
	"author_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"category" text NOT NULL,
	"status" text DEFAULT 'Open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "roomie_users" ADD COLUMN "role" text DEFAULT 'student' NOT NULL;--> statement-breakpoint
ALTER TABLE "roomie_group_rooms" ADD CONSTRAINT "roomie_group_rooms_household_id_roomie_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."roomie_households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roomie_group_rooms" ADD CONSTRAINT "roomie_group_rooms_group_id_roomie_residence_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."roomie_residence_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roomie_residence_announcements" ADD CONSTRAINT "roomie_residence_announcements_group_id_roomie_residence_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."roomie_residence_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roomie_residence_announcements" ADD CONSTRAINT "roomie_residence_announcements_author_id_roomie_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."roomie_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roomie_residence_groups" ADD CONSTRAINT "roomie_residence_groups_owner_id_roomie_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."roomie_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roomie_residence_messages" ADD CONSTRAINT "roomie_residence_messages_group_id_roomie_residence_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."roomie_residence_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roomie_residence_messages" ADD CONSTRAINT "roomie_residence_messages_household_id_roomie_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."roomie_households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roomie_residence_messages" ADD CONSTRAINT "roomie_residence_messages_sender_id_roomie_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."roomie_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roomie_residence_reports" ADD CONSTRAINT "roomie_residence_reports_group_id_roomie_residence_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."roomie_residence_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roomie_residence_reports" ADD CONSTRAINT "roomie_residence_reports_household_id_roomie_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."roomie_households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roomie_residence_reports" ADD CONSTRAINT "roomie_residence_reports_author_id_roomie_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."roomie_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "roomie_groups_invite_unique" ON "roomie_residence_groups" USING btree ("invite_code");