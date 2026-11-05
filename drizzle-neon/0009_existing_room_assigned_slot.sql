-- Approval can replace a still-empty assigned slot, preserving both household records.
CREATE OR REPLACE FUNCTION roomie_community_action(actor text, input jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE slot roomie_households; g roomie_residence_groups; h roomie_households; pending roomie_connection_requests; r roomie_residence_reports; kind text:=input->>'type'; room_id text; new_id text:=gen_random_uuid()::text; label text:=lower(trim(input->>'roomLabel'));
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
    IF EXISTS(SELECT 1 FROM roomie_group_rooms gr JOIN roomie_households hh ON hh.id=gr.household_id WHERE gr.group_id=g.id AND gr.room_label=label AND (hh.owner_id IS NOT NULL OR EXISTS(SELECT 1 FROM roomie_memberships WHERE household_id=hh.id))) THEN RAISE EXCEPTION 'That room number is already claimed on this floor.'; END IF;
    INSERT INTO roomie_connection_requests(id,household_id,group_id,requested_by,room_label) VALUES(new_id,h.id,g.id,actor,label);
  ELSIF kind IN ('approve_connection','reject_connection') THEN
    SELECT * INTO h FROM roomie_households WHERE id=pending.household_id FOR UPDATE;
    IF kind='approve_connection' AND h.owner_id IS DISTINCT FROM pending.requested_by THEN RAISE EXCEPTION 'Room ownership changed. Ask the new owner to submit a connection request.'; END IF;
    IF kind='approve_connection' THEN
      SELECT hh.* INTO slot FROM roomie_households hh JOIN roomie_group_rooms gr ON gr.household_id=hh.id WHERE gr.group_id=g.id AND gr.room_label=pending.room_label FOR UPDATE OF hh;
      IF FOUND THEN
        IF slot.owner_id IS NOT NULL OR EXISTS(SELECT 1 FROM roomie_memberships WHERE household_id=slot.id) THEN RAISE EXCEPTION 'That assigned room was claimed. Disconnect or choose another room number.'; END IF;
        -- Preserve the retired placeholder; its invitation must stop working.
        UPDATE roomie_households SET invite_enabled=false,version=version+1 WHERE id=slot.id;
        DELETE FROM roomie_group_rooms WHERE household_id=slot.id;
      END IF;
      INSERT INTO roomie_group_rooms(household_id,group_id,room_label) VALUES(h.id,g.id,pending.room_label);
    END IF;
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
