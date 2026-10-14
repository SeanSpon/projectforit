CREATE TABLE "roomie_memberships" (
	"household_id" text NOT NULL,
	"user_id" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roomie_memberships_household_id_user_id_pk" PRIMARY KEY("household_id","user_id")
);
--> statement-breakpoint
DROP INDEX IF EXISTS "roomie_users_person_unique";--> statement-breakpoint
ALTER TABLE "roomie_households" ADD COLUMN "name" text DEFAULT 'My household' NOT NULL;--> statement-breakpoint
ALTER TABLE "roomie_households" ADD COLUMN "invite_code" text;--> statement-breakpoint
ALTER TABLE "roomie_households" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "roomie_users" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "roomie_users" ADD COLUMN "bio" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "roomie_memberships" ADD CONSTRAINT "roomie_memberships_household_id_roomie_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."roomie_households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roomie_memberships" ADD CONSTRAINT "roomie_memberships_user_id_roomie_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."roomie_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "roomie_households_invite_unique" ON "roomie_households" USING btree ("invite_code");
--> statement-breakpoint
UPDATE roomie_users SET name = initcap(person);
--> statement-breakpoint
UPDATE roomie_households SET invite_code = upper(substr(md5(id),1,16)), owner_id = 'legacy';
--> statement-breakpoint
ALTER TABLE roomie_users ALTER COLUMN name SET NOT NULL;
--> statement-breakpoint
ALTER TABLE roomie_households ALTER COLUMN invite_code SET NOT NULL;
--> statement-breakpoint
ALTER TABLE roomie_households ALTER COLUMN owner_id SET NOT NULL;
