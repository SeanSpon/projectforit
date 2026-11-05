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
CREATE OR REPLACE FUNCTION roomie_reset_floor_sharing() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    UPDATE roomie_households SET share_chores=false WHERE id=OLD.household_id;
    RETURN OLD;
  END IF;
  UPDATE roomie_households SET share_chores=false WHERE id=NEW.household_id;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER roomie_link_sharing_reset AFTER INSERT OR DELETE ON roomie_group_rooms FOR EACH ROW EXECUTE FUNCTION roomie_reset_floor_sharing();
