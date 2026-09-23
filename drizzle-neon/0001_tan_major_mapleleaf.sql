CREATE TABLE "roomie_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roomie_users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"person" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "roomie_sessions" ADD CONSTRAINT "roomie_sessions_user_id_roomie_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."roomie_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "roomie_users_email_unique" ON "roomie_users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "roomie_users_person_unique" ON "roomie_users" USING btree ("person");