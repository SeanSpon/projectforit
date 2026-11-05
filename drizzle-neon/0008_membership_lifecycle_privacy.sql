-- Preserve vacated private histories in an inaccessible archived household.
-- The floor keeps its room label through a new, empty household and fresh code.
CREATE OR REPLACE FUNCTION roomie_vacate_room(room_id text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE h roomie_households; link roomie_group_rooms; fresh text:=gen_random_uuid()::text;
BEGIN
  SELECT * INTO h FROM roomie_households WHERE id=room_id FOR UPDATE;
  SELECT * INTO link FROM roomie_group_rooms WHERE household_id=room_id;
  IF link.household_id IS NULL THEN RETURN; END IF;
  INSERT INTO roomie_households(id,name,invite_code,owner_id,state)
    VALUES(fresh,h.name,upper(replace(gen_random_uuid()::text,'-','')),NULL,'{"chores":[],"expenses":[],"bookings":[],"rules":[],"activity":[]}');
  UPDATE roomie_group_rooms SET household_id=fresh WHERE household_id=room_id;
  UPDATE roomie_households SET owner_id=NULL,invite_enabled=false,share_chores=false,version=version+1 WHERE id=room_id;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION roomie_membership_departure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Account deletion cascades also invalidate invitations known to former members.
  UPDATE roomie_households SET invite_code=upper(replace(gen_random_uuid()::text,'-','')),
    version=version+1,updated_at=now() WHERE id=OLD.household_id;
  RETURN OLD;
END $$;
--> statement-breakpoint
CREATE TRIGGER roomie_departure_invitation AFTER DELETE ON roomie_memberships
  FOR EACH ROW EXECUTE FUNCTION roomie_membership_departure();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION roomie_reset_floor_sharing() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('DELETE','UPDATE') THEN
    UPDATE roomie_households SET share_chores=false,version=version+1 WHERE id=OLD.household_id;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    UPDATE roomie_households SET share_chores=false,version=version+1 WHERE id=NEW.household_id;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER roomie_link_sharing_reset ON roomie_group_rooms;
--> statement-breakpoint
CREATE TRIGGER roomie_link_sharing_reset AFTER INSERT OR UPDATE OR DELETE ON roomie_group_rooms
  FOR EACH ROW EXECUTE FUNCTION roomie_reset_floor_sharing();
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
    IF EXISTS(SELECT 1 FROM roomie_group_rooms gr JOIN roomie_residence_groups gg ON gg.id=gr.group_id WHERE gr.household_id=h.id AND gg.owner_id=actor) THEN RAISE EXCEPTION 'The floor manager cannot join a managed room.'; END IF;
    INSERT INTO roomie_memberships(household_id,user_id) VALUES(h.id,actor) ON CONFLICT DO NOTHING;
    UPDATE roomie_households SET owner_id=coalesce(owner_id,actor),version=version+1 WHERE id=h.id;
    RETURN jsonb_build_object('id',h.id);
  END IF;
  SELECT * INTO h FROM roomie_households WHERE id=input->>'householdId' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found.'; END IF;
  SELECT g0.* INTO g FROM roomie_group_rooms gr JOIN roomie_residence_groups g0 ON g0.id=gr.group_id WHERE gr.household_id=h.id;
  IF kind='remove_member' THEN
    IF h.owner_id IS DISTINCT FROM actor AND g.owner_id IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Only the room owner or connected floor manager can remove members.'; END IF;
    IF input->>'userId'=h.owner_id THEN RAISE EXCEPTION 'The room owner must transfer ownership before removal.'; END IF;
    DELETE FROM roomie_memberships WHERE household_id=h.id AND user_id=input->>'userId';
    UPDATE roomie_households SET version=version+1,updated_at=now() WHERE id=h.id;
  ELSIF kind IN ('rotate_invite','revoke_invite') THEN
    IF h.owner_id IS DISTINCT FROM actor AND g.owner_id IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Only the room owner or connected floor manager can manage invitations.'; END IF;
    UPDATE roomie_households SET invite_enabled=(kind='rotate_invite'),invite_code=CASE WHEN kind='rotate_invite' THEN input->>'code' ELSE invite_code END,version=version+1 WHERE id=h.id;
  ELSE
    IF NOT EXISTS(SELECT 1 FROM roomie_memberships WHERE household_id=h.id AND user_id=actor) THEN RAISE EXCEPTION 'Only room members can do that.'; END IF;
    IF kind='transfer' THEN
      IF h.owner_id IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Only the room owner can transfer ownership.'; END IF;
      target:=input->>'userId';
      IF NOT EXISTS(SELECT 1 FROM roomie_memberships WHERE household_id=h.id AND user_id=target) THEN RAISE EXCEPTION 'Choose a current roommate.'; END IF;
      UPDATE roomie_households SET owner_id=target,share_chores=false,
        invite_code=upper(replace(gen_random_uuid()::text,'-','')) WHERE id=h.id;
      DELETE FROM roomie_connection_requests WHERE household_id=h.id;
    ELSIF kind='leave' THEN
      IF h.owner_id=actor AND EXISTS(SELECT 1 FROM roomie_memberships WHERE household_id=h.id AND user_id<>actor) THEN RAISE EXCEPTION 'Transfer room ownership before leaving.'; END IF;
      DELETE FROM roomie_memberships WHERE household_id=h.id AND user_id=actor;
      IF h.owner_id=actor THEN
        IF g.id IS NOT NULL THEN PERFORM roomie_vacate_room(h.id);
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
    IF NOT FOUND OR (g.owner_id<>actor AND (r.author_id<>actor OR NOT EXISTS(SELECT 1 FROM roomie_memberships WHERE household_id=r.household_id AND user_id=actor))) THEN RAISE EXCEPTION 'Only the request author and current floor manager can update this request.'; END IF;
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
    IF kind='approve_connection' AND h.owner_id IS DISTINCT FROM pending.requested_by THEN RAISE EXCEPTION 'Room ownership changed. Ask the new owner to submit a connection request.'; END IF;
    IF kind='approve_connection' THEN INSERT INTO roomie_group_rooms(household_id,group_id,room_label) VALUES(h.id,g.id,pending.room_label); END IF;
    DELETE FROM roomie_connection_requests WHERE id=pending.id;
  ELSIF kind='disconnect' THEN
    SELECT * INTO h FROM roomie_households WHERE id=input->>'householdId' FOR UPDATE;
    IF g.owner_id<>actor AND NOT EXISTS(SELECT 1 FROM roomie_memberships WHERE household_id=h.id AND user_id=actor) THEN RAISE EXCEPTION 'Only a room member or its floor manager can disconnect.'; END IF;
    DELETE FROM roomie_group_rooms WHERE household_id=h.id AND group_id=g.id;
    UPDATE roomie_households SET share_chores=false WHERE id=h.id;
  ELSIF kind='cancel_connection' THEN
    IF NOT EXISTS(SELECT 1 FROM roomie_households WHERE id=input->>'householdId' AND owner_id=actor) THEN RAISE EXCEPTION 'Only the room owner can cancel a connection request.'; END IF;
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
CREATE OR REPLACE FUNCTION roomie_delete_account(actor text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE room_to_vacate text;
BEGIN
  PERFORM id FROM roomie_residence_groups WHERE owner_id=actor ORDER BY id FOR UPDATE;
  PERFORM h.id FROM roomie_households h JOIN roomie_memberships m ON m.household_id=h.id WHERE m.user_id=actor ORDER BY h.id FOR UPDATE OF h;
  IF EXISTS(SELECT 1 FROM roomie_households h WHERE h.owner_id=actor AND EXISTS(SELECT 1 FROM roomie_memberships WHERE household_id=h.id AND user_id<>actor)) THEN RAISE EXCEPTION 'Transfer ownership of rooms with roommates before deleting your account.'; END IF;
  -- Disband owned floor groups; preserve occupied student rooms and their data.
  DELETE FROM roomie_households h USING roomie_group_rooms gr,roomie_residence_groups g WHERE h.id=gr.household_id AND gr.group_id=g.id AND g.owner_id=actor AND h.owner_id IS NULL AND NOT EXISTS(SELECT 1 FROM roomie_memberships WHERE household_id=h.id);
  DELETE FROM roomie_residence_groups WHERE owner_id=actor;
  -- Keep assigned floor slots after a sole resident deletes their account.
  FOR room_to_vacate IN SELECT h.id FROM roomie_households h JOIN roomie_group_rooms gr ON gr.household_id=h.id WHERE h.owner_id=actor LOOP
    PERFORM roomie_vacate_room(room_to_vacate);
    DELETE FROM roomie_households WHERE id=room_to_vacate;
  END LOOP;
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
REVOKE ALL ON FUNCTION roomie_vacate_room(text),roomie_membership_departure(),roomie_reset_floor_sharing() FROM PUBLIC;
