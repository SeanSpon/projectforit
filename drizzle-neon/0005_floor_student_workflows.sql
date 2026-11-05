CREATE TABLE "roomie_connection_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"group_id" text NOT NULL,
	"requested_by" text NOT NULL,
	"room_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roomie_request_updates" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roomie_room_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"sender_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "roomie_households" ALTER COLUMN "owner_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "roomie_group_rooms" ADD COLUMN "room_label" text;
--> statement-breakpoint
WITH labels AS (SELECT gr.household_id, lower(trim(h.name)) AS label, row_number() OVER (PARTITION BY gr.group_id,lower(trim(h.name)) ORDER BY gr.household_id) AS n FROM roomie_group_rooms gr JOIN roomie_households h ON h.id=gr.household_id)
UPDATE roomie_group_rooms gr SET room_label=l.label || CASE WHEN l.n>1 THEN '-' || gr.household_id ELSE '' END FROM labels l WHERE gr.household_id=l.household_id;
--> statement-breakpoint
ALTER TABLE "roomie_group_rooms" ALTER COLUMN "room_label" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "roomie_households" ADD COLUMN "invite_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "roomie_households" ADD COLUMN "share_chores" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "roomie_residence_groups" ADD COLUMN "invite_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "roomie_residence_groups" ADD COLUMN "rules" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "roomie_residence_reports" ADD COLUMN "photo" text;--> statement-breakpoint
ALTER TABLE "roomie_users" ADD COLUMN "phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "roomie_users" ADD COLUMN "share_email" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "roomie_users" ADD COLUMN "share_phone" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "roomie_connection_requests" ADD CONSTRAINT "roomie_connection_requests_household_id_roomie_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."roomie_households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roomie_connection_requests" ADD CONSTRAINT "roomie_connection_requests_group_id_roomie_residence_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."roomie_residence_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roomie_connection_requests" ADD CONSTRAINT "roomie_connection_requests_requested_by_roomie_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."roomie_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roomie_request_updates" ADD CONSTRAINT "roomie_request_updates_report_id_roomie_residence_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."roomie_residence_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roomie_request_updates" ADD CONSTRAINT "roomie_request_updates_author_id_roomie_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."roomie_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roomie_room_messages" ADD CONSTRAINT "roomie_room_messages_household_id_roomie_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."roomie_households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roomie_room_messages" ADD CONSTRAINT "roomie_room_messages_sender_id_roomie_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."roomie_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "roomie_pending_room_unique" ON "roomie_connection_requests" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roomie_floor_room_label_unique" ON "roomie_group_rooms" USING btree ("group_id","room_label");
--> statement-breakpoint
-- All functions execute as the server's DB role. Actor IDs come only from validated
-- server sessions, never from request payloads. No client DB credential is exposed.
CREATE OR REPLACE FUNCTION roomie_membership_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM roomie_group_rooms gr JOIN roomie_residence_groups g ON g.id=gr.group_id WHERE gr.household_id=NEW.household_id AND g.owner_id=NEW.user_id) THEN
    RAISE EXCEPTION 'The floor manager cannot join a managed room or access its private data.';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER roomie_membership_floor_guard BEFORE INSERT OR UPDATE ON roomie_memberships FOR EACH ROW EXECUTE FUNCTION roomie_membership_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION roomie_link_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM roomie_memberships m JOIN roomie_residence_groups g ON g.owner_id=m.user_id WHERE m.household_id=NEW.household_id AND g.id=NEW.group_id) THEN
    RAISE EXCEPTION 'A floor manager cannot connect a room they belong to.';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER roomie_link_floor_guard BEFORE INSERT OR UPDATE ON roomie_group_rooms FOR EACH ROW EXECUTE FUNCTION roomie_link_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION roomie_room_action(actor text, input jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE h roomie_households; g roomie_residence_groups; room_id text; target text; kind text := input->>'type';
BEGIN
  -- All membership / owner changes lock the household, shared with state CAS writes.
  IF kind='create' THEN
    room_id := gen_random_uuid()::text;
    INSERT INTO roomie_households(id,name,invite_code,owner_id,state) VALUES(room_id,input->>'name',input->>'code',actor,'{"chores":[],"expenses":[],"bookings":[],"rules":[],"activity":[]}');
    INSERT INTO roomie_memberships(household_id,user_id) VALUES(room_id,actor);
    RETURN jsonb_build_object('id',room_id);
  ELSIF kind='join' THEN
    SELECT * INTO h FROM roomie_households WHERE invite_code=input->>'code' AND invite_enabled FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'No room matches that active invitation.'; END IF;
    IF EXISTS(SELECT 1 FROM roomie_group_rooms gr JOIN roomie_residence_groups g ON g.id=gr.group_id WHERE gr.household_id=h.id AND g.owner_id=actor) THEN RAISE EXCEPTION 'The floor manager cannot join a managed room.'; END IF;
    INSERT INTO roomie_memberships(household_id,user_id) VALUES(h.id,actor) ON CONFLICT DO NOTHING;
    UPDATE roomie_households SET owner_id=coalesce(owner_id,actor),version=version+1 WHERE id=h.id;
    RETURN jsonb_build_object('id',h.id);
  END IF;
  SELECT * INTO h FROM roomie_households WHERE id=input->>'householdId' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found.'; END IF;
  SELECT g0.* INTO g FROM roomie_group_rooms gr JOIN roomie_residence_groups g0 ON g0.id=gr.group_id WHERE gr.household_id=h.id;
  IF kind IN ('rotate_invite','revoke_invite') THEN
    IF h.owner_id IS DISTINCT FROM actor AND g.owner_id IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Only the room owner or connected floor manager can manage invitations.'; END IF;
    UPDATE roomie_households SET invite_enabled=(kind='rotate_invite'),invite_code=CASE WHEN kind='rotate_invite' THEN input->>'code' ELSE invite_code END,version=version+1 WHERE id=h.id;
  ELSE
    IF NOT EXISTS(SELECT 1 FROM roomie_memberships WHERE household_id=h.id AND user_id=actor) THEN RAISE EXCEPTION 'Only room members can do that.'; END IF;
    IF kind='transfer' THEN
      IF h.owner_id IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Only the room owner can transfer ownership.'; END IF;
      target:=input->>'userId';
      IF NOT EXISTS(SELECT 1 FROM roomie_memberships WHERE household_id=h.id AND user_id=target) THEN RAISE EXCEPTION 'Choose a current roommate.'; END IF;
      UPDATE roomie_households SET owner_id=target WHERE id=h.id;
    ELSIF kind='remove_member' THEN
      IF h.owner_id IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Only the room owner can remove members.'; END IF;
      IF input->>'userId'=h.owner_id THEN RAISE EXCEPTION 'Transfer ownership before leaving.'; END IF;
      DELETE FROM roomie_memberships WHERE household_id=h.id AND user_id=input->>'userId';
    ELSIF kind='leave' THEN
      IF h.owner_id=actor AND EXISTS(SELECT 1 FROM roomie_memberships WHERE household_id=h.id AND user_id<>actor) THEN RAISE EXCEPTION 'Transfer room ownership before leaving.'; END IF;
      DELETE FROM roomie_memberships WHERE household_id=h.id AND user_id=actor;
      IF h.owner_id=actor THEN
        IF g.id IS NOT NULL THEN UPDATE roomie_households SET owner_id=NULL WHERE id=h.id;
        ELSE DELETE FROM roomie_households WHERE id=h.id; END IF;
      END IF;
    ELSIF kind='share_chores' THEN
      IF (input->>'enabled')::boolean AND h.owner_id IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Only the room owner can enable aggregate sharing.'; END IF;
      UPDATE roomie_households SET share_chores=(input->>'enabled')::boolean WHERE id=h.id;
    ELSE RAISE EXCEPTION 'Unknown room action.';
    END IF;
    UPDATE roomie_households SET version=version+1,updated_at=now() WHERE id=h.id;
  END IF;
  RETURN jsonb_build_object('ok',true);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION roomie_community_action(actor text, input jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE g roomie_residence_groups; h roomie_households; pending roomie_connection_requests; r roomie_residence_reports; kind text:=input->>'type'; room_id text; new_id text:=gen_random_uuid()::text; label text:=lower(trim(input->>'roomLabel'));
BEGIN
  IF kind='create_group' THEN
    INSERT INTO roomie_residence_groups(id,name,building,floor,owner_id,invite_code) VALUES(new_id,input->>'name',input->>'building',input->>'floor',actor,input->>'code');
    RETURN jsonb_build_object('id',new_id);
  END IF;
  IF kind IN ('status','update_request') THEN
    SELECT r0.* INTO r FROM roomie_residence_reports r0 WHERE r0.id=input->>'reportId' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Request not found.'; END IF;
    SELECT g0.* INTO g FROM roomie_residence_groups g0 JOIN roomie_group_rooms gr ON gr.group_id=g0.id WHERE g0.id=r.group_id AND gr.household_id=r.household_id;
    IF NOT FOUND OR (g.owner_id<>actor AND r.author_id<>actor) THEN RAISE EXCEPTION 'Only the request author and current floor manager can update this request.'; END IF;
    IF kind='status' THEN
      IF g.owner_id<>actor THEN RAISE EXCEPTION 'Only the current floor manager can change status.'; END IF;
      UPDATE roomie_residence_reports SET status=input->>'status' WHERE id=r.id;
    ELSE INSERT INTO roomie_request_updates(id,report_id,author_id,body) VALUES(new_id,r.id,actor,input->>'body'); END IF;
    RETURN jsonb_build_object('ok',true);
  END IF;
  -- Lock the group before rooms for all connection / directory changes.
  IF kind='connect_room' THEN
    SELECT * INTO g FROM roomie_residence_groups WHERE invite_code=input->>'code' AND invite_enabled FOR UPDATE;
  ELSIF kind='cancel_connection' THEN
    SELECT g0.* INTO g FROM roomie_residence_groups g0 JOIN roomie_connection_requests cr ON cr.group_id=g0.id WHERE cr.household_id=input->>'householdId' FOR UPDATE OF g0;
  ELSIF kind IN ('approve_connection','reject_connection') THEN
    SELECT * INTO pending FROM roomie_connection_requests WHERE id=input->>'requestId';
    SELECT * INTO g FROM roomie_residence_groups WHERE id=pending.group_id FOR UPDATE;
  ELSIF input ? 'groupId' THEN
    SELECT * INTO g FROM roomie_residence_groups WHERE id=input->>'groupId' FOR UPDATE;
  ELSE
    SELECT g0.* INTO g FROM roomie_residence_groups g0 JOIN roomie_group_rooms gr ON gr.group_id=g0.id WHERE gr.household_id=input->>'householdId' FOR UPDATE OF g0;
  END IF;
  IF g.id IS NULL THEN RAISE EXCEPTION 'No connected floor or active connection code found.'; END IF;
  IF kind IN ('create_room','announce','floor_rules','rotate_group','revoke_group','approve_connection','reject_connection') AND g.owner_id<>actor THEN RAISE EXCEPTION 'Only this floor manager can do that.'; END IF;
  IF kind='create_room' THEN
    room_id:=new_id;
    IF EXISTS(SELECT 1 FROM roomie_group_rooms WHERE group_id=g.id AND room_label=label) THEN RAISE EXCEPTION 'That room number already exists on this floor.'; END IF;
    INSERT INTO roomie_households(id,name,invite_code,owner_id,state) VALUES(room_id,input->>'name',input->>'code',NULL,'{"chores":[],"expenses":[],"bookings":[],"rules":[],"activity":[]}');
    INSERT INTO roomie_group_rooms(household_id,group_id,room_label) VALUES(room_id,g.id,label);
    RETURN jsonb_build_object('id',room_id);
  ELSIF kind='connect_room' THEN
    SELECT * INTO h FROM roomie_households WHERE id=input->>'householdId' FOR UPDATE;
    IF h.owner_id IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Only the room owner can request a floor connection.'; END IF;
    IF EXISTS(SELECT 1 FROM roomie_group_rooms WHERE household_id=h.id) THEN RAISE EXCEPTION 'This room is already connected to a floor.'; END IF;
    IF EXISTS(SELECT 1 FROM roomie_memberships WHERE household_id=h.id AND user_id=g.owner_id) THEN RAISE EXCEPTION 'A floor manager cannot connect a room they belong to.'; END IF;
    IF EXISTS(SELECT 1 FROM roomie_group_rooms WHERE group_id=g.id AND room_label=label) THEN RAISE EXCEPTION 'That room number already exists on this floor.'; END IF;
    INSERT INTO roomie_connection_requests(id,household_id,group_id,requested_by,room_label) VALUES(new_id,h.id,g.id,actor,label);
  ELSIF kind IN ('approve_connection','reject_connection') THEN
    SELECT * INTO h FROM roomie_households WHERE id=pending.household_id FOR UPDATE;
    IF h.owner_id IS DISTINCT FROM pending.requested_by THEN RAISE EXCEPTION 'Room ownership changed. Ask the new owner to submit a connection request.'; END IF;
    IF kind='approve_connection' THEN INSERT INTO roomie_group_rooms(household_id,group_id,room_label) VALUES(h.id,g.id,pending.room_label); END IF;
    DELETE FROM roomie_connection_requests WHERE id=pending.id;
  ELSIF kind='disconnect' THEN
    SELECT * INTO h FROM roomie_households WHERE id=input->>'householdId' FOR UPDATE;
    IF g.owner_id<>actor AND NOT EXISTS(SELECT 1 FROM roomie_memberships WHERE household_id=h.id AND user_id=actor) THEN RAISE EXCEPTION 'Only a room member or its floor manager can disconnect.'; END IF;
    DELETE FROM roomie_group_rooms WHERE household_id=h.id AND group_id=g.id;
    UPDATE roomie_households SET share_chores=false WHERE id=h.id;
  ELSIF kind='cancel_connection' THEN
    DELETE FROM roomie_connection_requests cr USING roomie_households hh WHERE cr.household_id=hh.id AND hh.id=input->>'householdId' AND hh.owner_id=actor;
  ELSIF kind='announce' THEN INSERT INTO roomie_residence_announcements(id,group_id,author_id,title,body) VALUES(new_id,g.id,actor,input->>'title',input->>'body');
  ELSIF kind='floor_rules' THEN UPDATE roomie_residence_groups SET rules=input->>'body' WHERE id=g.id;
  ELSIF kind IN ('rotate_group','revoke_group') THEN UPDATE roomie_residence_groups SET invite_enabled=(kind='rotate_group'),invite_code=CASE WHEN kind='rotate_group' THEN input->>'code' ELSE invite_code END WHERE id=g.id;
  ELSIF kind='report' THEN
    IF NOT EXISTS(SELECT 1 FROM roomie_memberships m JOIN roomie_group_rooms gr ON gr.household_id=m.household_id WHERE m.household_id=input->>'householdId' AND m.user_id=actor AND gr.group_id=g.id) OR g.owner_id=actor THEN RAISE EXCEPTION 'Only residents can submit requests from their connected room.'; END IF;
    INSERT INTO roomie_residence_reports(id,group_id,household_id,author_id,title,body,category,photo) VALUES(new_id,g.id,input->>'householdId',actor,input->>'title',input->>'body',input->>'category',input->>'photo');
    RETURN jsonb_build_object('id',new_id);
  ELSE RAISE EXCEPTION 'Unknown floor action.';
  END IF;
  RETURN jsonb_build_object('ok',true);
END $$;
--> statement-breakpoint
-- Projection boundary: the RA never receives household.state, financial fields,
-- private roommate messages, or individual chores. Consent is evaluated in SQL.
CREATE OR REPLACE FUNCTION roomie_community_snapshot(actor text, selected_group text, selected_room text) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE g roomie_residence_groups; manager boolean; room_data jsonb; request_data jsonb; pending_data jsonb;
BEGIN
  IF selected_room IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM roomie_memberships WHERE household_id=selected_room AND user_id=actor) THEN RAISE EXCEPTION 'Room not found.'; END IF;
    SELECT g0.* INTO g FROM roomie_residence_groups g0 JOIN roomie_group_rooms gr ON gr.group_id=g0.id WHERE gr.household_id=selected_room;
    IF g.id IS NULL THEN
      RETURN jsonb_build_object('group',NULL,'rooms','[]'::jsonb,'reports','[]'::jsonb,'announcements','[]'::jsonb,'connections',coalesce((SELECT jsonb_agg(jsonb_build_object('id',cr.id,'groupId',cr.group_id,'name',gg.name,'roomLabel',cr.room_label)) FROM roomie_connection_requests cr JOIN roomie_residence_groups gg ON gg.id=cr.group_id WHERE cr.household_id=selected_room),'[]'::jsonb));
    END IF;
    manager:=false;
  ELSE
    SELECT * INTO g FROM roomie_residence_groups WHERE id=selected_group AND owner_id=actor;
    IF g.id IS NULL THEN RAISE EXCEPTION 'Floor group not found.'; END IF;
    manager:=true;
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',h.id,'name',h.name,'roomLabel',gr.room_label,'ownerId',h.owner_id,
    'inviteCode',CASE WHEN manager OR h.owner_id=actor THEN h.invite_code ELSE NULL END,'inviteEnabled',h.invite_enabled,'shareChores',h.share_chores,
    'rules',coalesce((SELECT jsonb_agg(jsonb_build_object('id',rule->>'id','title',rule->>'title','detail',rule->>'detail','category',rule->>'category')) FROM jsonb_array_elements(h.state->'rules') rule),'[]'::jsonb),
    'choreSummary',CASE WHEN h.share_chores THEN jsonb_build_object('total',jsonb_array_length(h.state->'chores'),'done',(SELECT count(*) FROM jsonb_array_elements(h.state->'chores') c WHERE c->>'done'='true')) ELSE NULL END,
    'residents',coalesce((SELECT jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'bio',u.bio,'email',CASE WHEN u.share_email THEN u.email ELSE NULL END,'phone',CASE WHEN u.share_phone THEN nullif(u.phone,'') ELSE NULL END) ORDER BY m.joined_at,u.id) FROM roomie_memberships m JOIN roomie_users u ON u.id=m.user_id WHERE m.household_id=h.id),'[]'::jsonb)) ORDER BY gr.room_label),'[]'::jsonb)
    INTO room_data FROM roomie_group_rooms gr JOIN roomie_households h ON h.id=gr.household_id WHERE gr.group_id=g.id AND (manager OR h.id=selected_room);
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'householdId',r.household_id,'authorId',r.author_id,'author',u.name,'title',r.title,'body',r.body,'category',r.category,'status',r.status,'photo',r.photo,'createdAt',r.created_at,
    'updates',coalesce((SELECT jsonb_agg(jsonb_build_object('id',ru.id,'body',ru.body,'author',uu.name,'createdAt',ru.created_at) ORDER BY ru.created_at,ru.id) FROM roomie_request_updates ru JOIN roomie_users uu ON uu.id=ru.author_id WHERE ru.report_id=r.id),'[]'::jsonb)) ORDER BY r.created_at DESC),'[]'::jsonb) INTO request_data
    FROM roomie_residence_reports r JOIN roomie_users u ON u.id=r.author_id JOIN roomie_group_rooms gr ON gr.household_id=r.household_id AND gr.group_id=r.group_id
    WHERE r.group_id=g.id AND (manager OR (r.household_id=selected_room AND (r.category='Maintenance' OR r.author_id=actor)));
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',cr.id,'householdId',cr.household_id,'name',h.name,'roomLabel',cr.room_label)),'[]'::jsonb) INTO pending_data
    FROM roomie_connection_requests cr JOIN roomie_households h ON h.id=cr.household_id WHERE cr.group_id=g.id AND (manager OR cr.household_id=selected_room);
  RETURN jsonb_build_object('isRA',manager,'group',jsonb_build_object('id',g.id,'name',g.name,'building',g.building,'floor',g.floor,'rules',g.rules,'verified',false,'raName',(SELECT name FROM roomie_users WHERE id=g.owner_id),'inviteCode',CASE WHEN manager THEN g.invite_code ELSE NULL END,'inviteEnabled',CASE WHEN manager THEN g.invite_enabled ELSE NULL END),
    'rooms',room_data,'reports',request_data,'connections',pending_data,
    'announcements',coalesce((SELECT jsonb_agg(jsonb_build_object('id',n.id,'title',n.title,'body',n.body,'createdAt',n.created_at) ORDER BY n.created_at DESC) FROM roomie_residence_announcements n WHERE n.group_id=g.id),'[]'::jsonb));
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION roomie_delete_account(actor text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM id FROM roomie_residence_groups WHERE owner_id=actor ORDER BY id FOR UPDATE;
  PERFORM h.id FROM roomie_households h JOIN roomie_memberships m ON m.household_id=h.id WHERE m.user_id=actor ORDER BY h.id FOR UPDATE OF h;
  IF EXISTS(SELECT 1 FROM roomie_households h WHERE h.owner_id=actor AND EXISTS(SELECT 1 FROM roomie_memberships WHERE household_id=h.id AND user_id<>actor)) THEN RAISE EXCEPTION 'Transfer ownership of rooms with roommates before deleting your account.'; END IF;
  -- Disband owned floor groups; preserve occupied student rooms and their data.
  DELETE FROM roomie_households h USING roomie_group_rooms gr,roomie_residence_groups g WHERE h.id=gr.household_id AND gr.group_id=g.id AND g.owner_id=actor AND h.owner_id IS NULL AND NOT EXISTS(SELECT 1 FROM roomie_memberships WHERE household_id=h.id);
  DELETE FROM roomie_residence_groups WHERE owner_id=actor;
  DELETE FROM roomie_households WHERE owner_id=actor;
  UPDATE roomie_households SET version=version+1 WHERE id IN (SELECT household_id FROM roomie_memberships WHERE user_id=actor);
  DELETE FROM roomie_request_updates WHERE author_id=actor;
  DELETE FROM roomie_residence_reports WHERE author_id=actor;
  DELETE FROM roomie_residence_messages WHERE sender_id=actor;
  DELETE FROM roomie_residence_announcements WHERE author_id=actor;
  DELETE FROM roomie_ra_invites WHERE email=(SELECT email FROM roomie_users WHERE id=actor);
  DELETE FROM roomie_users WHERE id=actor;
END $$;
--> statement-breakpoint
-- Functions are internal server APIs, not callable through a public SQL role.
REVOKE ALL ON FUNCTION roomie_room_action(text,jsonb), roomie_community_action(text,jsonb), roomie_community_snapshot(text,text,text), roomie_delete_account(text) FROM PUBLIC;
