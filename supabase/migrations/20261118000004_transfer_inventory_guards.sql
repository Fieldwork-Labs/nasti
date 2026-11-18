-- Ownership transfer: inventory guards and cleaning of received bags
-- (plan 2026-11-18-transfer.md, sections 2.8 and 2.10).
--
-- Part 3 of migration B. It follows 20261118000002_transfer_schema.sql (which
-- defines sub_batch_reservation, is_bag_reserved and assert_bag_not_reserved)
-- and sits beside 20261118000003_transfer_lifecycle.sql (new functions only).
--
--   1. Helpers for whole-batch operations.
--   2. Write-time guards (backstop): a reserved bag cannot be adjusted,
--      derived from, tested, assigned for testing, stored, moved, re-parented
--      or deleted.
--   3. Bag-first storage RPC; the direct client UPDATE path on batch_storage
--      is removed.
--   4. Lock-first redefinitions of the existing mutation functions, each
--      noting the file its previous definition came from.
--   5. Cleaning of received (collectionless) bags, with provenance carried
--      onto the outputs.
--
-- Lock order everywhere: reservation-relevant bags first (ascending id), then
-- batches, then storage rows or other rows. The completion path deletes the
-- reservation before its own writes, so none of the guards needs an exemption.

-- =========================================================================
-- 1. Helpers for whole-batch operations
-- =========================================================================

-- True when any bag of any listed batch is reserved. STABLE, read-only.
CREATE OR REPLACE FUNCTION public.assert_batch_bags_not_reserved(p_batch_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF p_batch_ids IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.sub_batch_reservation r
    INNER JOIN public.sub_batches sb ON sb.id = r.sub_batch_id
    WHERE sb.batch_id = ANY (p_batch_ids)
  ) THEN
    RAISE EXCEPTION 'Bag is reserved for a pending transfer'
      USING ERRCODE = '55000';
  END IF;
END;
$function$
;

-- Internal. Locks every bag of every listed batch FOR UPDATE in ascending id
-- order, then refuses if any of them is reserved. Called by the whole-batch
-- operations (merge, mix, batch-level split) before they read holder,
-- assignment or weight, so a transfer completing concurrently cannot change
-- those under them.
CREATE OR REPLACE FUNCTION public.fn_lock_batch_bags_for_consumption(p_batch_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM 1
  FROM public.sub_batches sb
  WHERE sb.batch_id = ANY (p_batch_ids)
  ORDER BY sb.id
  FOR UPDATE;

  PERFORM public.assert_batch_bags_not_reserved(p_batch_ids);
END;
$function$
;

REVOKE ALL ON FUNCTION public.assert_batch_bags_not_reserved(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_batch_bags_not_reserved(uuid[]) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_lock_batch_bags_for_consumption(uuid[]) FROM PUBLIC, anon, authenticated;

-- =========================================================================
-- 2. Write-time guards (backstop)
-- =========================================================================

-- INSERT guard. The column holding the bag id is TG_ARGV[0]. SECURITY DEFINER
-- only so that it can take a FOR KEY SHARE lock on the bag whatever the
-- caller's RLS says: an insert that starts while a send holds the bag lock
-- waits for it and then sees the reservation, instead of checking first and
-- losing the race. KEY SHARE conflicts only with FOR UPDATE, so ordinary
-- updates of the bag are not held up. Callers that already hold the bag lock
-- (every RPC) are unaffected.
CREATE OR REPLACE FUNCTION public.guard_reserved_bag_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_bag_id uuid := (to_jsonb(NEW) ->> TG_ARGV[0])::uuid;
BEGIN
  IF v_bag_id IS NOT NULL THEN
    PERFORM 1
    FROM public.sub_batches sb
    WHERE sb.id = v_bag_id
    FOR KEY SHARE;

    PERFORM public.assert_bag_not_reserved(v_bag_id);
  END IF;

  RETURN NEW;
END;
$function$
;

-- UPDATE guard for tables whose row lock is already held when the trigger
-- runs (tests, batch_storage). It must not take the bag lock: that would
-- reverse the bag-then-row order used everywhere else. Direct client updates
-- of batch_storage are removed below; tests updates are checked here as a
-- backstop. The column holding the bag id is TG_ARGV[0].
CREATE OR REPLACE FUNCTION public.guard_reserved_bag_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_new_bag_id uuid := (to_jsonb(NEW) ->> TG_ARGV[0])::uuid;
  v_old_bag_id uuid := (to_jsonb(OLD) ->> TG_ARGV[0])::uuid;
BEGIN
  PERFORM public.assert_bag_not_reserved(v_new_bag_id);

  IF v_old_bag_id IS DISTINCT FROM v_new_bag_id THEN
    PERFORM public.assert_bag_not_reserved(v_old_bag_id);
  END IF;

  RETURN NEW;
END;
$function$
;

-- sub_batches: container, holder or parent batch changes, and deletes.
CREATE OR REPLACE FUNCTION public.guard_reserved_sub_batch_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.container_id IS DISTINCT FROM OLD.container_id
     OR NEW.held_by_org_id IS DISTINCT FROM OLD.held_by_org_id
     OR NEW.batch_id IS DISTINCT FROM OLD.batch_id THEN
    PERFORM public.assert_bag_not_reserved(OLD.id);
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_reserved_sub_batch_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  -- sub_batch_reservation also references the bag ON DELETE RESTRICT; this
  -- check gives the same refusal a readable message, including when the bag
  -- goes with its parent batch.
  PERFORM public.assert_bag_not_reserved(OLD.id);

  RETURN OLD;
END;
$function$
;

-- batch_merges: whole-batch merge, mix and combine consume a source batch
-- without adjusting its bags, so refuse if ANY bag of the source is reserved.
CREATE OR REPLACE FUNCTION public.guard_reserved_merge_source()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM public.assert_batch_bags_not_reserved(ARRAY[NEW.source_batch_id]);

  RETURN NEW;
END;
$function$
;

REVOKE ALL ON FUNCTION public.guard_reserved_bag_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_reserved_bag_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_reserved_sub_batch_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_reserved_sub_batch_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_reserved_merge_source() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER batch_weight_adjustments_reserved_guard
  BEFORE INSERT ON public.batch_weight_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.guard_reserved_bag_insert('sub_batch_id');

CREATE TRIGGER sub_batch_lineage_reserved_guard
  BEFORE INSERT ON public.sub_batch_lineage
  FOR EACH ROW EXECUTE FUNCTION public.guard_reserved_bag_insert('source_sub_batch_id');

CREATE TRIGGER tests_reserved_insert_guard
  BEFORE INSERT ON public.tests
  FOR EACH ROW EXECUTE FUNCTION public.guard_reserved_bag_insert('sub_batch_id');

CREATE TRIGGER tests_reserved_update_guard
  BEFORE UPDATE ON public.tests
  FOR EACH ROW EXECUTE FUNCTION public.guard_reserved_bag_update('sub_batch_id');

CREATE TRIGGER batch_testing_assignment_reserved_guard
  BEFORE INSERT ON public.batch_testing_assignment
  FOR EACH ROW EXECUTE FUNCTION public.guard_reserved_bag_insert('sub_batch_id');

CREATE TRIGGER batch_storage_reserved_insert_guard
  BEFORE INSERT ON public.batch_storage
  FOR EACH ROW EXECUTE FUNCTION public.guard_reserved_bag_insert('sub_batch_id');

-- Every update, including one that only sets moved_out_at.
CREATE TRIGGER batch_storage_reserved_update_guard
  BEFORE UPDATE ON public.batch_storage
  FOR EACH ROW EXECUTE FUNCTION public.guard_reserved_bag_update('sub_batch_id');

CREATE TRIGGER batch_cleaning_reserved_guard
  BEFORE INSERT ON public.batch_cleaning
  FOR EACH ROW EXECUTE FUNCTION public.guard_reserved_bag_insert('input_sub_batch_id');

CREATE TRIGGER batch_merges_reserved_guard
  BEFORE INSERT ON public.batch_merges
  FOR EACH ROW EXECUTE FUNCTION public.guard_reserved_merge_source();

CREATE TRIGGER sub_batches_reserved_change_guard
  BEFORE UPDATE OF container_id, held_by_org_id, batch_id ON public.sub_batches
  FOR EACH ROW EXECUTE FUNCTION public.guard_reserved_sub_batch_change();

CREATE TRIGGER sub_batches_reserved_delete_guard
  BEFORE DELETE ON public.sub_batches
  FOR EACH ROW EXECUTE FUNCTION public.guard_reserved_sub_batch_delete();

-- =========================================================================
-- 3. Bag-first storage RPC; no direct client UPDATE on batch_storage
-- =========================================================================

-- The web's useUpdateStorageRecord edited notes and location_id of one row
-- directly. PostgreSQL locks the storage row before running a row-level
-- update trigger, so a guard trigger cannot take the bag lock without
-- reversing the bag-then-row order that completion uses. The edit goes through
-- this RPC instead, which locks the bag first. NULL arguments leave a field
-- unchanged; pass an empty string to clear the notes.
CREATE OR REPLACE FUNCTION public.fn_update_batch_storage_record(p_storage_id uuid, p_location_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS public.batch_storage
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_sub_batch_id uuid;
  v_row public.batch_storage%ROWTYPE;
  v_result public.batch_storage%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_org_permission('inventory') THEN
    RAISE EXCEPTION 'Your account does not have inventory access'
      USING ERRCODE = '42501';
  END IF;

  -- Which bag the row belongs to. A bag never changes for an existing row
  -- (nothing updates sub_batch_id), so this unlocked read is safe; it is
  -- re-checked once the row is locked.
  SELECT bs.sub_batch_id
  INTO v_sub_batch_id
  FROM public.batch_storage bs
  WHERE bs.id = p_storage_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Storage record not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- Bag first, then the storage row.
  PERFORM 1
  FROM public.sub_batches sb
  WHERE sb.id = v_sub_batch_id
  FOR UPDATE;

  -- Storage is a statement about where a physical bag is, so only whoever
  -- holds it may edit it (as fn_set_sub_batch_storage).
  IF NOT public.is_current_bag_custodian(v_user_id, v_sub_batch_id) THEN
    RAISE EXCEPTION 'Permission denied: not the current holder of this bag'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.assert_bag_not_reserved(v_sub_batch_id);

  SELECT bs.*
  INTO v_row
  FROM public.batch_storage bs
  WHERE bs.id = p_storage_id
  FOR UPDATE;

  IF NOT FOUND OR v_row.sub_batch_id IS DISTINCT FROM v_sub_batch_id THEN
    RAISE EXCEPTION 'Storage record not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- The batch_storage_active_location trigger validates a new location: it
  -- must be active and belong to the bag's holder.
  UPDATE public.batch_storage bs
  SET location_id = COALESCE(p_location_id, bs.location_id),
      notes = COALESCE(p_notes, bs.notes)
  WHERE bs.id = p_storage_id
  RETURNING bs.* INTO v_result;

  RETURN v_result;
END;
$function$
;

REVOKE ALL ON FUNCTION public.fn_update_batch_storage_record(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_update_batch_storage_record(uuid, uuid, text) TO authenticated;

-- Remove the direct authenticated UPDATE path. SECURITY DEFINER functions run
-- as the owner and are unaffected. Previous definitions:
-- 20260911000005_permissions_rls_and_integrations.sql (policies and grants).
DROP POLICY IF EXISTS "batch_storage_update" ON public.batch_storage;
DROP POLICY IF EXISTS "batch_storage_permission_update" ON public.batch_storage;
REVOKE UPDATE ON TABLE public.batch_storage FROM anon, authenticated;

-- =========================================================================
-- 4. Lock-first redefinitions
-- =========================================================================
--
-- Each block below is the latest definition of the function, copied with only
-- the lock or reservation check added. CREATE OR REPLACE keeps existing grants.
--
-- Functions that insert into a guarded table and were reviewed but NOT
-- redefined, because they already lock the bag first and the write-time
-- guards above refuse a reserved bag at the first write:
--   fn_create_quality_test (20261008000001: bag lock, then inner function) and
--   fn_create_quality_test_without_work_completion / ..._without_adjustment_classification,
--   fn_delete_quality_test (20261013000001: bag lock before the test row),
--   fn_return_held_bag_from_testing, fn_return_bag_from_testing,
--   fn_return_bags_from_testing (bags out for testing cannot be reserved: an
--     active assignment and a reservation exclude each other),
--   fn_bag_and_store_cleaning_outputs / fn_bag_cleaning_outputs_unclassified
--     (write only to bags they create; the lineage source is the already
--     consumed cleaning input),
--   fn_combine_batches (its sources must have no bags, so none can be reserved;
--     the batch_merges guard is the backstop).

-- fn_split_batch. Previous definition: 20260911000003_inventory_operations_and_lineage.sql.
-- Change: lock the parent batch's bags and refuse reserved ones.
CREATE OR REPLACE FUNCTION public.fn_split_batch(p_parent_batch_id uuid, p_weight_grams numeric DEFAULT NULL::numeric, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
  v_collection uuid;
  v_parent_code text;
  v_child_id uuid;
  v_parent_current_weight numeric;
  v_child_weight numeric;
BEGIN
  -- Caller must be current custodian of the parent
  v_org := current_custodian_org_id(p_parent_batch_id);
  IF v_org IS NULL OR NOT is_org_member(auth.uid(), v_org) THEN
    RAISE EXCEPTION 'Permission denied: not current custodian of parent batch';
  END IF;

  -- A batch-level split changes the parent's available weight, so it answers
  -- for every bag of the parent: lock them and refuse reserved ones.
  PERFORM public.fn_lock_batch_bags_for_consumption(ARRAY[p_parent_batch_id]);

  -- Get parent batch properties for inheritance
  SELECT
    b.collection_id,
    b.code,
    bcw.current_weight
  INTO
    v_collection,
    v_parent_code,
    v_parent_current_weight
  FROM batches b
  JOIN batch_current_weight bcw ON bcw.id = b.id
  WHERE b.id = p_parent_batch_id;

  IF v_collection IS NULL THEN
    RAISE EXCEPTION 'Parent batch not found';
  END IF;

  -- Validate parent batch is active
  IF v_parent_current_weight IS NULL OR v_parent_current_weight <= 0 THEN
    RAISE EXCEPTION 'Parent batch is not active or has no weight remaining';
  END IF;

  -- Determine child weight (provided or default to half of current weight).
  -- The old GREATEST(1, ...) floor existed because integer division truncated
  -- a 1 g parent to 0; numeric halves exactly, so the floor would now round a
  -- legitimate sub-gram split up to a whole gram.
  v_child_weight := COALESCE(p_weight_grams, v_parent_current_weight / 2);

  -- Validate child weight doesn't exceed parent's current weight
  IF v_child_weight > v_parent_current_weight THEN
    RAISE EXCEPTION 'Child weight (% g) exceeds parent current weight (% g)',
      v_child_weight, v_parent_current_weight;
  END IF;

  -- Validate child weight is positive
  IF v_child_weight <= 0 THEN
    RAISE EXCEPTION 'Child batch weight must be greater than 0';
  END IF;

  -- Use provided values or inherit from parent
  INSERT INTO batches (
    id,
    collection_id,
    code,
    organisation_id,
    weight_grams,
    notes
  )
  VALUES (
    gen_random_uuid(),
    v_collection,
    v_parent_code,  -- Child inherits exact parent code
    v_org,
    v_child_weight,
    p_notes
  )
  RETURNING id INTO v_child_id;

  INSERT INTO batch_splits (parent_batch_id, child_batch_id)
  VALUES (p_parent_batch_id, v_child_id);

  INSERT INTO batch_custody (batch_id, organisation_id, notes)
  VALUES (v_child_id, v_org, 'Custody inherited on split');

  RETURN v_child_id;
END;
$function$
;

-- fn_split_sub_batch (wrapper). Previous definition: 20260911000003_inventory_operations_and_lineage.sql.
-- Change: lock the bag before snapshotting its adjustments.
CREATE OR REPLACE FUNCTION public.fn_split_sub_batch(p_sub_batch_id uuid, p_outputs jsonb)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_derived_ids UUID[];
  v_operation_id UUID := gen_random_uuid();
  v_prior_adjustment_ids UUID[];
  v_classified_count INTEGER;
BEGIN
  -- Lock the bag before snapshotting its adjustments, so an adjustment that
  -- another transaction commits in between is not mistaken for this split's.
  -- fn_split_sub_batch_without_lineage takes the same lock (re-entrant) and,
  -- through the write-time guards, refuses a reserved bag.
  PERFORM 1
  FROM public.sub_batches sb
  WHERE sb.id = p_sub_batch_id
  FOR UPDATE;

  SELECT COALESCE(array_agg(adjustment.id), '{}'::UUID[])
  INTO v_prior_adjustment_ids
  FROM public.batch_weight_adjustments adjustment
  WHERE adjustment.sub_batch_id = p_sub_batch_id;

  v_derived_ids := public.fn_split_sub_batch_without_lineage(
    p_sub_batch_id,
    p_outputs
  );

  INSERT INTO public.sub_batch_lineage (
    source_sub_batch_id,
    derived_sub_batch_id,
    operation_kind,
    operation_id,
    created_by
  )
  SELECT
    p_sub_batch_id,
    derived_id,
    'split',
    v_operation_id,
    auth.uid()
  FROM unnest(v_derived_ids) derived_id;

  UPDATE public.batch_weight_adjustments adjustment
  SET
    kind = 'split',
    lineage_operation_id = v_operation_id
  WHERE adjustment.sub_batch_id = p_sub_batch_id
    AND adjustment.id <> ALL (v_prior_adjustment_ids);

  GET DIAGNOSTICS v_classified_count = ROW_COUNT;
  IF v_classified_count != 1 THEN
    RAISE EXCEPTION 'Split must create exactly one weight adjustment';
  END IF;

  RETURN v_derived_ids;
END;
$function$
;

-- fn_split_sub_batch_without_lineage. Previous definition: 20260911000003_inventory_operations_and_lineage.sql.
-- Change: assert the bag is not reserved right after the holder check (the bag
-- was already locked first).
CREATE OR REPLACE FUNCTION public.fn_split_sub_batch_without_lineage(p_sub_batch_id uuid, p_outputs jsonb)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_batch_id UUID;
  v_held_by_org_id UUID;
  v_organisation_id UUID;
  v_current_weight NUMERIC;
  v_total_split_weight NUMERIC;
  v_output JSONB;
  v_out_weight NUMERIC;
  v_out_notes TEXT;
  v_container_id UUID;
  v_location_id UUID;
  v_new_id UUID;
  v_new_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  -- Lock the source so simultaneous splits cannot allocate the same weight.
  SELECT sb.batch_id, sb.held_by_org_id
  INTO v_batch_id, v_held_by_org_id
  FROM public.sub_batches sb
  WHERE sb.id = p_sub_batch_id
  FOR UPDATE;

  IF v_batch_id IS NULL THEN
    RAISE EXCEPTION 'Sub-batch not found';
  END IF;

  SELECT sbcw.current_weight
  INTO v_current_weight
  FROM public.sub_batch_current_weight sbcw
  WHERE sbcw.id = p_sub_batch_id;

  -- Splitting takes weight out of this bag, so the gate is who holds the bag,
  -- not who owns the parent batch. It is also what lets a Testing organisation
  -- retain a subsample of an assigned bag, and what stops the owner carving up
  -- a bag it has already sent away.
  IF NOT public.is_current_bag_custodian(auth.uid(), p_sub_batch_id) THEN
    RAISE EXCEPTION 'Permission denied: not the current holder of this bag';
  END IF;

  -- The source is locked above. A bag reserved for a pending transfer cannot
  -- be split.
  PERFORM public.assert_bag_not_reserved(p_sub_batch_id);

  v_organisation_id := public.get_user_organisation_id();

  IF p_outputs IS NULL
    OR jsonb_typeof(p_outputs) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Outputs must be an array';
  END IF;

  IF jsonb_array_length(p_outputs) = 0 THEN
    RAISE EXCEPTION 'At least one output is required';
  END IF;

  SELECT COALESCE(SUM((output.value->>'weight_grams')::NUMERIC), 0)
  INTO v_total_split_weight
  FROM jsonb_array_elements(p_outputs) output;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_outputs) output
    WHERE (output.value->>'weight_grams')::NUMERIC IS NULL
      OR (output.value->>'weight_grams')::NUMERIC <= 0
  ) THEN
    RAISE EXCEPTION 'Each output weight must be greater than 0';
  END IF;

  IF v_total_split_weight > v_current_weight THEN
    RAISE EXCEPTION
      'Total split weight (% g) must be less than current weight (% g)',
      v_total_split_weight,
      v_current_weight;
  END IF;

  -- Validate catalogue references before changing the source weight.
  FOR v_output IN
    SELECT value FROM jsonb_array_elements(p_outputs)
  LOOP
    v_container_id := NULLIF(v_output->>'container_id', '')::UUID;
    v_location_id := NULLIF(v_output->>'location_id', '')::UUID;

    IF v_container_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.containers container
      WHERE container.id = v_container_id
        AND container.organisation_id = v_organisation_id
        AND container.purpose = 'storage'
        AND container.active
    ) THEN
      RAISE EXCEPTION
        'Invalid or inactive storage container %',
        v_container_id;
    END IF;

    IF v_location_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.storage_locations location
      WHERE location.id = v_location_id
        AND location.organisation_id = v_organisation_id
    ) THEN
      RAISE EXCEPTION 'Invalid storage location %', v_location_id;
    END IF;
  END LOOP;

  INSERT INTO public.batch_weight_adjustments (
    sub_batch_id,
    weight_grams,
    reason,
    created_by
  ) VALUES (
    p_sub_batch_id,
    -v_total_split_weight,
    'Split into ' || jsonb_array_length(p_outputs) || ' new sub-batch(es)',
    auth.uid()
  );

  FOR v_output IN
    SELECT value FROM jsonb_array_elements(p_outputs)
  LOOP
    v_out_weight := (v_output->>'weight_grams')::NUMERIC;
    v_out_notes := v_output->>'notes';
    v_container_id := NULLIF(v_output->>'container_id', '')::UUID;
    v_location_id := NULLIF(v_output->>'location_id', '')::UUID;

    -- A child stays with whoever held the material it came from, which the
    -- gate above has already proved is the caller's organisation. Leaving it
    -- to the BEFORE INSERT default would silently hand a Testing
    -- organisation's split back to the batch owner.
    INSERT INTO public.sub_batches (
      batch_id,
      container_id,
      weight_grams,
      notes,
      held_by_org_id
    ) VALUES (
      v_batch_id,
      v_container_id,
      v_out_weight,
      v_out_notes,
      v_held_by_org_id
    )
    RETURNING id INTO v_new_id;

    IF v_location_id IS NOT NULL THEN
      INSERT INTO public.batch_storage (
        batch_id,
        sub_batch_id,
        location_id
      ) VALUES (
        v_batch_id,
        v_new_id,
        v_location_id
      );
    END IF;

    v_new_ids := array_append(v_new_ids, v_new_id);
  END LOOP;

  RETURN v_new_ids;
END;
$function$
;

-- fn_merge_sub_batches (wrapper). Previous definition: 20261009000001_optional_merge_container.sql.
-- Change: lock the source bags (ascending id) before snapshotting adjustments.
CREATE OR REPLACE FUNCTION public.fn_merge_sub_batches(p_sub_batch_ids uuid[], p_container_id uuid DEFAULT NULL::uuid, p_location_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_destination_id UUID;
  v_operation_id UUID;
  v_prior_adjustment_ids UUID[];
  v_classified_count INTEGER;
BEGIN
  -- Lock the source bags (ascending id) before snapshotting their adjustments.
  -- The unclassified function takes the same locks (re-entrant) and, through
  -- the write-time guards, refuses a reserved bag.
  PERFORM 1
  FROM public.sub_batches sb
  WHERE sb.id = ANY (p_sub_batch_ids)
  ORDER BY sb.id
  FOR UPDATE;

  SELECT COALESCE(array_agg(adjustment.id), '{}'::UUID[])
  INTO v_prior_adjustment_ids
  FROM public.batch_weight_adjustments adjustment
  WHERE adjustment.sub_batch_id = ANY (p_sub_batch_ids);

  v_destination_id :=
    public.fn_merge_sub_batches_without_adjustment_classification(
      p_sub_batch_ids,
      p_container_id,
      p_location_id,
      p_notes
    );

  SELECT lineage.operation_id
  INTO STRICT v_operation_id
  FROM public.sub_batch_lineage lineage
  WHERE lineage.derived_sub_batch_id = v_destination_id
    AND lineage.operation_kind = 'merge'
  LIMIT 1;

  UPDATE public.batch_weight_adjustments adjustment
  SET
    kind = 'merge',
    lineage_operation_id = v_operation_id
  WHERE adjustment.sub_batch_id = ANY (p_sub_batch_ids)
    AND adjustment.id <> ALL (v_prior_adjustment_ids);

  GET DIAGNOSTICS v_classified_count = ROW_COUNT;
  IF v_classified_count != cardinality(p_sub_batch_ids) THEN
    RAISE EXCEPTION 'Merge must create one weight adjustment per source bag';
  END IF;

  RETURN v_destination_id;
END;
$function$
;

-- fn_merge_sub_batches_without_adjustment_classification. Previous definition:
-- 20261009000001_optional_merge_container.sql.
-- Change: assert no source bag is reserved right after the holder check (the
-- bags were already locked first, in ascending id order).
CREATE OR REPLACE FUNCTION public.fn_merge_sub_batches_without_adjustment_classification(p_sub_batch_ids uuid[], p_container_id uuid DEFAULT NULL::uuid, p_location_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_batch_id UUID;
  v_batch_count INTEGER;
  v_holder_count INTEGER;
  v_held_by_org_id UUID;
  v_source_count INTEGER;
  v_organisation_id UUID;
  v_total_weight NUMERIC;
  v_new_sub_batch_id UUID := gen_random_uuid();
  v_operation_id UUID := gen_random_uuid();
  v_merged_at TIMESTAMPTZ := now();
BEGIN
  IF p_sub_batch_ids IS NULL
    OR cardinality(p_sub_batch_ids) < 2 THEN
    RAISE EXCEPTION 'Provide at least two sub-batches to merge';
  END IF;

  IF (
    SELECT count(DISTINCT source_id)
    FROM unnest(p_sub_batch_ids) source_id
  ) != cardinality(p_sub_batch_ids) THEN
    RAISE EXCEPTION 'Sub-batches to merge must be distinct';
  END IF;

  PERFORM sb.id
  FROM public.sub_batches sb
  WHERE sb.id = ANY (p_sub_batch_ids)
  ORDER BY sb.id
  FOR UPDATE;

  GET DIAGNOSTICS v_source_count = ROW_COUNT;

  IF v_source_count != cardinality(p_sub_batch_ids) THEN
    RAISE EXCEPTION 'One or more sub-batches were not found';
  END IF;

  SELECT count(DISTINCT sb.batch_id)
  INTO v_batch_count
  FROM public.sub_batches sb
  WHERE sb.id = ANY (p_sub_batch_ids);

  IF v_batch_count != 1 THEN
    RAISE EXCEPTION 'All sub-batches must belong to the same batch';
  END IF;

  SELECT count(DISTINCT sb.held_by_org_id)
  INTO v_holder_count
  FROM public.sub_batches sb
  WHERE sb.id = ANY (p_sub_batch_ids);

  IF v_holder_count != 1 THEN
    RAISE EXCEPTION 'All sub-batches must be held by the same organisation';
  END IF;

  SELECT sb.batch_id, sb.held_by_org_id
  INTO v_batch_id, v_held_by_org_id
  FROM public.sub_batches sb
  WHERE sb.id = p_sub_batch_ids[1];

  IF NOT public.is_current_bag_custodian(auth.uid(), p_sub_batch_ids[1]) THEN
    RAISE EXCEPTION 'Permission denied: not the current holder of these bags';
  END IF;

  -- The source bags are locked above. A bag reserved for a pending transfer
  -- cannot be merged.
  PERFORM public.assert_bag_not_reserved(source_id)
  FROM unnest(p_sub_batch_ids) source_id;

  v_organisation_id := public.get_user_organisation_id();

  IF p_container_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.containers container
    WHERE container.id = p_container_id
      AND container.organisation_id = v_organisation_id
      AND container.purpose = 'storage'
      AND container.active
  ) THEN
    RAISE EXCEPTION
      'Invalid or inactive storage container %',
      p_container_id;
  END IF;

  IF p_location_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.storage_locations location
    WHERE location.id = p_location_id
      AND location.organisation_id = v_organisation_id
  ) THEN
    RAISE EXCEPTION 'Invalid storage location %', p_location_id;
  END IF;

  SELECT sum(sbcw.current_weight)
  INTO v_total_weight
  FROM public.sub_batch_current_weight sbcw
  WHERE sbcw.id = ANY (p_sub_batch_ids);

  IF EXISTS (
    SELECT 1
    FROM public.sub_batch_current_weight sbcw
    WHERE sbcw.id = ANY (p_sub_batch_ids)
      AND sbcw.current_weight <= 0
  ) THEN
    RAISE EXCEPTION 'Every source sub-batch must have a positive current weight';
  END IF;

  INSERT INTO public.sub_batches (
    id,
    batch_id,
    container_id,
    weight_grams,
    notes,
    held_by_org_id
  ) VALUES (
    v_new_sub_batch_id,
    v_batch_id,
    p_container_id,
    v_total_weight,
    NULLIF(btrim(p_notes), ''),
    v_held_by_org_id
  );

  INSERT INTO public.sub_batch_lineage (
    source_sub_batch_id,
    derived_sub_batch_id,
    operation_kind,
    operation_id,
    created_by
  )
  SELECT
    source_id,
    v_new_sub_batch_id,
    'merge',
    v_operation_id,
    auth.uid()
  FROM unnest(p_sub_batch_ids) source_id;

  INSERT INTO public.batch_weight_adjustments (
    sub_batch_id,
    weight_grams,
    reason,
    created_by
  )
  SELECT
    sbcw.id,
    -sbcw.current_weight,
    format('Merged into sub-batch %s', v_new_sub_batch_id),
    auth.uid()
  FROM public.sub_batch_current_weight sbcw
  WHERE sbcw.id = ANY (p_sub_batch_ids);

  UPDATE public.batch_storage
  SET moved_out_at = v_merged_at
  WHERE sub_batch_id = ANY (p_sub_batch_ids)
    AND moved_out_at IS NULL;

  IF p_location_id IS NOT NULL THEN
    INSERT INTO public.batch_storage (
      batch_id,
      sub_batch_id,
      location_id,
      stored_at,
      notes
    ) VALUES (
      v_batch_id,
      v_new_sub_batch_id,
      p_location_id,
      v_merged_at,
      'Storage after sub-batch merge'
    );
  END IF;

  RETURN v_new_sub_batch_id;
END;
$function$
;

-- fn_merge_batches. Previous definition: 20260911000003_inventory_operations_and_lineage.sql.
-- Change: lock every bag of every source batch and refuse reserved ones before
-- reading holder, assignment or weight.
CREATE OR REPLACE FUNCTION public.fn_merge_batches(p_source_batch_ids uuid[], p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
  v_collection uuid;
  v_batch_code text;
  v_new_id uuid;
  v_same bool;
  v_total_weight numeric;
BEGIN
  IF array_length(p_source_batch_ids, 1) IS NULL OR array_length(p_source_batch_ids, 1) < 2 THEN
    RAISE EXCEPTION 'Provide at least two source batches to merge';
  END IF;

  -- All sources must share the same current custodian
  v_org := assert_same_custodian(p_source_batch_ids);
  IF NOT is_org_member(auth.uid(), v_org) THEN
    RAISE EXCEPTION 'Permission denied: not a member of the custodian organisation';
  END IF;

  -- Lock every bag of every source batch (ascending id) before reading their
  -- holder, assignment or weight, then refuse if any is reserved for a pending
  -- transfer. Without this a transfer completing concurrently could move the
  -- seed after the weight was read here.
  PERFORM public.fn_lock_batch_bags_for_consumption(p_source_batch_ids);

  -- A whole-batch merge zeroes every source batch, so it has to answer for
  -- every bag in them. Reject rather than resolve: a bag held by another
  -- organisation is physically elsewhere, and an open assignment is a
  -- commitment about seed in someone else's hands. Neither may be consumed
  -- here, and an assignment must never be auto-closed or moved to the merged
  -- batch — if a future workflow needs that, it must do it in this same
  -- transaction and never leave an assignment pointing at deleted material.
  IF EXISTS (
    SELECT 1
    FROM sub_batches sb
    WHERE sb.batch_id = ANY (p_source_batch_ids)
      AND sb.held_by_org_id IS DISTINCT FROM v_org
  ) THEN
    RAISE EXCEPTION 'Cannot merge a batch whose bags are held by another organisation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM batch_testing_assignment bta
    JOIN sub_batches sb ON sb.id = bta.sub_batch_id
    WHERE sb.batch_id = ANY (p_source_batch_ids)
      AND bta.closed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot merge a batch with an active testing assignment';
  END IF;

  -- Validate that all batches share the same collection_id
  SELECT COUNT(DISTINCT collection_id) = 1
  INTO v_same
  FROM batches
  WHERE id = ANY (p_source_batch_ids);

  IF NOT v_same THEN
    RAISE EXCEPTION 'All batches must be derived from the same collection';
  END IF;

  -- Validate that all batches have the same code
  SELECT COUNT(DISTINCT code) = 1
  INTO v_same
  FROM batches
  WHERE id = ANY (p_source_batch_ids);

  IF NOT v_same THEN
    RAISE EXCEPTION 'All batches must have the same code to be merged';
  END IF;

  -- Get collection_id and code for the new batch
  SELECT DISTINCT collection_id, code
  INTO v_collection, v_batch_code
  FROM batches
  WHERE id = ANY (p_source_batch_ids);

  -- Validate all source batches are active and get their current weights
  SELECT
      SUM(bcw.current_weight),
      bool_and(bcw.current_weight > 0)
  INTO
      v_total_weight,
      v_same
  FROM batches b
  JOIN batch_current_weight bcw ON bcw.id = b.id
  WHERE b.id = ANY (p_source_batch_ids);

  IF NOT v_same THEN
    RAISE EXCEPTION 'All source batches must be active (current weight > 0)';
  END IF;

  INSERT INTO batches (
    id,
    collection_id,
    code,
    organisation_id,
    weight_grams,
    notes
  )
  VALUES (
    gen_random_uuid(),
    v_collection,
    v_batch_code,  -- Use shared code from source batches
    v_org,
    v_total_weight,
    p_notes
  )
  RETURNING id INTO v_new_id;

  INSERT INTO batch_custody (batch_id, organisation_id, notes)
  VALUES (v_new_id, v_org, 'Custody on merge');

  INSERT INTO batch_merges (merged_batch_id, source_batch_id)
  SELECT v_new_id, unnest(p_source_batch_ids);

  RETURN v_new_id;
END;
$function$
;

-- fn_mix_batches. Previous definition: 20260911000003_inventory_operations_and_lineage.sql.
-- Change: lock every bag of every source batch and refuse reserved ones before
-- reading holder, assignment or weight. Received batches (no collection) are
-- still rejected by the existing species check ('All batches must be of the
-- same species to mix'); that logic is untouched.
CREATE OR REPLACE FUNCTION public.fn_mix_batches(p_source_batch_ids uuid[], p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_org UUID;
  v_new_id UUID;
  v_total_weight NUMERIC;
  v_species_count INTEGER;
  v_ibra_count INTEGER;
  v_species_id UUID;
  v_oldest_date TIMESTAMPTZ;
  v_all_active BOOLEAN;
BEGIN
  IF array_length(p_source_batch_ids, 1) IS NULL OR array_length(p_source_batch_ids, 1) < 2 THEN
    RAISE EXCEPTION 'Provide at least two source batches to mix';
  END IF;

  -- All sources must share the same current custodian
  v_org := assert_same_custodian(p_source_batch_ids);
  IF NOT is_org_member(auth.uid(), v_org) THEN
    RAISE EXCEPTION 'Permission denied: not a member of the custodian organisation';
  END IF;

  -- Lock every bag of every source batch (ascending id) before reading their
  -- holder, assignment or weight, then refuse if any is reserved for a pending
  -- transfer.
  PERFORM public.fn_lock_batch_bags_for_consumption(p_source_batch_ids);

  -- Mixing zeroes every source batch, so it has to answer for every bag in
  -- them. Reject rather than resolve: a bag held by another organisation is
  -- physically elsewhere, and an open assignment is a commitment about seed in
  -- someone else's hands. Neither may be consumed here, and an assignment must
  -- never be auto-closed or moved to the mixed batch.
  IF EXISTS (
    SELECT 1
    FROM sub_batches sb
    WHERE sb.batch_id = ANY (p_source_batch_ids)
      AND sb.held_by_org_id IS DISTINCT FROM v_org
  ) THEN
    RAISE EXCEPTION 'Cannot mix a batch whose bags are held by another organisation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM batch_testing_assignment bta
    JOIN sub_batches sb ON sb.id = bta.sub_batch_id
    WHERE sb.batch_id = ANY (p_source_batch_ids)
      AND bta.closed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot mix a batch with an active testing assignment';
  END IF;

  -- Validate all batches have the same species
  SELECT COUNT(DISTINCT c.species_id)
  INTO v_species_count
  FROM batches b
  JOIN collection c ON c.id = b.collection_id
  WHERE b.id = ANY (p_source_batch_ids);

  IF v_species_count != 1 THEN
    RAISE EXCEPTION 'All batches must be of the same species to mix';
  END IF;

  -- Get the species_id for code generation
  SELECT DISTINCT c.species_id
  INTO v_species_id
  FROM batches b
  JOIN collection c ON c.id = b.collection_id
  WHERE b.id = ANY (p_source_batch_ids);

  -- Validate all batches are from the same IBRA region
  SELECT COUNT(DISTINCT get_ibra_code_from_location(c.location))
  INTO v_ibra_count
  FROM batches b
  JOIN collection c ON c.id = b.collection_id
  WHERE b.id = ANY (p_source_batch_ids);

  IF v_ibra_count != 1 THEN
    RAISE EXCEPTION 'All batches must be from the same IBRA region to mix';
  END IF;

  -- Validate all source batches are active and get their current weights
  SELECT
    SUM(bcw.current_weight),
    bool_and(bcw.current_weight > 0)
  INTO v_total_weight, v_all_active
  FROM batches b
  JOIN batch_current_weight bcw ON bcw.id = b.id
  WHERE b.id = ANY (p_source_batch_ids);

  IF NOT v_all_active THEN
    RAISE EXCEPTION 'All source batches must be active (current weight > 0)';
  END IF;

  -- Get the oldest collection date
  SELECT MIN(c.created_at)
  INTO v_oldest_date
  FROM batches b
  JOIN collection c ON c.id = b.collection_id
  WHERE b.id = ANY (p_source_batch_ids);

  -- Create new mixed batch (collection_id is NULL since it's a mix of multiple collections)
  INSERT INTO batches (
    id, collection_id, organisation_id, weight_grams, notes, created_at
  ) VALUES (
    gen_random_uuid(), NULL, v_org, v_total_weight, p_notes, v_oldest_date
  )
  RETURNING id INTO v_new_id;

  INSERT INTO batch_custody (batch_id, organisation_id, notes)
  VALUES (v_new_id, v_org, 'Custody on mix');

  -- Record mix sources using batch_merges table
  INSERT INTO batch_merges (merged_batch_id, source_batch_id)
  SELECT v_new_id, unnest(p_source_batch_ids);

  -- Create initial sub-batch for the mixed batch
  INSERT INTO sub_batches (batch_id, weight_grams, notes)
  VALUES (v_new_id, v_total_weight, 'Initial sub-batch from mix');

  RETURN v_new_id;
END;
$function$
;

-- fn_set_sub_batch_storage. Previous definition: 20260911000003_inventory_operations_and_lineage.sql.
-- Change: assert the bag is not reserved right after the holder check (the bag
-- was already locked first, before any storage row).
CREATE OR REPLACE FUNCTION public.fn_set_sub_batch_storage(p_sub_batch_id uuid, p_location_id uuid DEFAULT NULL::uuid, p_effective_at timestamp with time zone DEFAULT now(), p_notes text DEFAULT NULL::text)
 RETURNS public.batch_storage
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_batch_id UUID;
  v_organisation_id UUID;
  v_current_weight NUMERIC;
  v_current_storage public.batch_storage%ROWTYPE;
  v_result public.batch_storage%ROWTYPE;
BEGIN
  IF p_sub_batch_id IS NULL THEN
    RAISE EXCEPTION 'A sub-batch is required';
  END IF;

  IF p_effective_at IS NULL THEN
    RAISE EXCEPTION 'An effective storage time is required';
  END IF;

  -- Serialize every transition for the sub-batch. The open-row unique index is
  -- a final invariant guard for direct or concurrent writes.
  SELECT sb.batch_id
  INTO v_batch_id
  FROM public.sub_batches sb
  WHERE sb.id = p_sub_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sub-batch not found';
  END IF;

  -- Storage is a statement about where a physical bag is, so only whoever
  -- holds it may make one. The owner of the parent batch must not be able to
  -- shelve or move a bag that is currently in a Testing organisation's hands.
  IF NOT public.is_current_bag_custodian(auth.uid(), p_sub_batch_id) THEN
    RAISE EXCEPTION 'Permission denied: not the current holder of this bag';
  END IF;

  -- The bag is locked above, before any storage row. A reserved bag's storage
  -- cannot be added, moved or removed.
  PERFORM public.assert_bag_not_reserved(p_sub_batch_id);

  SELECT sbcw.current_weight
  INTO v_current_weight
  FROM public.sub_batch_current_weight sbcw
  WHERE sbcw.id = p_sub_batch_id;

  IF v_current_weight IS NULL OR v_current_weight <= 0 THEN
    RAISE EXCEPTION 'Only a positive-weight sub-batch can be stored';
  END IF;

  v_organisation_id := public.get_user_organisation_id();

  IF p_location_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.storage_locations location
    WHERE location.id = p_location_id
      AND location.organisation_id = v_organisation_id
  ) THEN
    RAISE EXCEPTION 'Invalid storage location %', p_location_id;
  END IF;

  SELECT storage.*
  INTO v_current_storage
  FROM public.batch_storage storage
  WHERE storage.sub_batch_id = p_sub_batch_id
    AND storage.moved_out_at IS NULL
  FOR UPDATE;

  IF NOT FOUND AND p_location_id IS NULL THEN
    RAISE EXCEPTION 'Sub-batch is not currently stored';
  END IF;

  IF v_current_storage.id IS NOT NULL
    AND p_location_id = v_current_storage.location_id THEN
    RAISE EXCEPTION 'Sub-batch is already stored at this location';
  END IF;

  IF v_current_storage.id IS NOT NULL
    AND v_current_storage.stored_at IS NOT NULL
    AND p_effective_at < v_current_storage.stored_at THEN
    RAISE EXCEPTION
      'Effective storage time cannot be before the current storage start';
  END IF;

  IF v_current_storage.id IS NOT NULL THEN
    UPDATE public.batch_storage
    SET
      moved_out_at = p_effective_at,
      notes = CASE
        WHEN p_location_id IS NULL THEN p_notes
        ELSE notes
      END
    WHERE id = v_current_storage.id
    RETURNING * INTO v_result;
  END IF;

  IF p_location_id IS NOT NULL THEN
    INSERT INTO public.batch_storage (
      batch_id,
      sub_batch_id,
      location_id,
      stored_at,
      notes
    ) VALUES (
      v_batch_id,
      p_sub_batch_id,
      p_location_id,
      p_effective_at,
      p_notes
    )
    RETURNING * INTO v_result;
  END IF;

  RETURN v_result;
END;
$function$
;

-- =========================================================================
-- 5. Cleaning received bags (plan 2.10)
-- =========================================================================
--
-- A received batch has no collection and exactly one bag, so it is cleaned
-- through the bag-level path. fn_clean_sub_batch_without_lineage gains the
-- collectionless branch fn_clean_batch already has: outputs are numbered from
-- the parent batch's own code (scoped to the organisation's collectionless
-- batches) and carry its species. The parent's source_collection_code,
-- source_ibra_code and source_collection_year are copied onto each output in
-- the INSERT. These functions are SECURITY DEFINER, so batches_provenance_guard
-- (which rejects non-NULL provenance on insert from authenticated/anon, and any
-- later update) lets the insert through. Outputs get no
-- received_transfer_item_id: that belongs to the original receipt.
-- Existing collection-backed cleaning is unchanged: its parents carry NULL
-- provenance, so the copied values are NULL.

-- fn_clean_sub_batch_without_lineage. Previous definition:
-- 20260911000003_inventory_operations_and_lineage.sql.
-- Changes: bag locked before eligibility and weight are read; reservation
-- check; collectionless branch; provenance copy. The output code pattern is now
-- regex-escaped for both branches, as in fn_clean_batch.
CREATE OR REPLACE FUNCTION public.fn_clean_sub_batch_without_lineage(p_sub_batch_id uuid, p_duration interval DEFAULT NULL::interval, p_material_type text DEFAULT NULL::text, p_material_subtype text DEFAULT NULL::text, p_material_notes text DEFAULT NULL::text, p_is_cleaned boolean DEFAULT false, p_cleaning_notes text DEFAULT NULL::text, p_worker_ids uuid[] DEFAULT '{}'::uuid[], p_outputs jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cleaning_id UUID;
  v_output_batch_id UUID;
  v_batch_id UUID;
  v_collection_id UUID;
  v_collection_code TEXT;
  v_input_code TEXT;
  v_input_species_id UUID;
  v_source_collection_code TEXT;
  v_source_ibra_code TEXT;
  v_source_collection_year SMALLINT;
  v_base_code TEXT;
  v_code_pattern TEXT;
  v_output_species_id UUID;
  v_organisation_id UUID;
  v_sub_batch_weight NUMERIC;
  v_effective_weight NUMERIC;
  v_output JSONB;
  v_quality TEXT;
  v_out_material_type TEXT;
  v_out_weight NUMERIC;
  v_increment INTEGER;
  v_batch_code TEXT;
  v_org_count INTEGER;
BEGIN
  IF p_is_cleaned AND p_duration IS NULL THEN
    RAISE EXCEPTION 'Cleaning duration is required';
  END IF;

  -- Lock the bag before reading its eligibility or weight, so a transfer
  -- completing concurrently cannot move the seed after it was read here.
  PERFORM 1
  FROM sub_batches sb
  WHERE sb.id = p_sub_batch_id
  FOR UPDATE;

  SELECT sb.batch_id, sb.weight_grams, b.collection_id, b.organisation_id,
    b.code, b.species_id,
    b.source_collection_code, b.source_ibra_code, b.source_collection_year
  INTO v_batch_id, v_sub_batch_weight, v_collection_id, v_organisation_id,
    v_input_code, v_input_species_id,
    v_source_collection_code, v_source_ibra_code, v_source_collection_year
  FROM sub_batches sb
  JOIN batches b ON b.id = sb.batch_id
  WHERE sb.id = p_sub_batch_id;

  IF v_batch_id IS NULL THEN
    RAISE EXCEPTION 'Sub-batch not found';
  END IF;

  -- Cleaning consumes the bag entirely, so the gate is bag custody, not batch
  -- ownership: the owner of the parent batch has no business cleaning a bag
  -- that is currently in someone else's hands.
  IF NOT is_current_bag_custodian(auth.uid(), p_sub_batch_id) THEN
    RAISE EXCEPTION 'Permission denied: not the current holder of this bag';
  END IF;

  -- A bag reserved for a pending transfer cannot be cleaned.
  PERFORM public.assert_bag_not_reserved(p_sub_batch_id);

  -- Reject rather than resolve. An open assignment is a physical fact about
  -- seed a Testing organisation is holding; consuming the bag would leave that
  -- assignment pointing at material that no longer exists. The software must
  -- not close it unilaterally, and must not move it to a successor bag.
  IF EXISTS (
    SELECT 1
    FROM batch_testing_assignment bta
    WHERE bta.sub_batch_id = p_sub_batch_id
      AND bta.closed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot clean a bag with an active testing assignment';
  END IF;

  v_effective_weight := v_sub_batch_weight + COALESCE(
    (SELECT SUM(wa.weight_grams)
     FROM batch_weight_adjustments wa
     WHERE wa.sub_batch_id = p_sub_batch_id),
    0
  );

  IF v_effective_weight <= 0 THEN
    RAISE EXCEPTION 'Sub-batch has no weight remaining';
  END IF;

  IF jsonb_array_length(p_outputs) = 0 THEN
    RAISE EXCEPTION 'At least one output is required';
  END IF;

  IF NOT p_is_cleaned THEN
    SELECT COUNT(*)
    INTO v_org_count
    FROM jsonb_array_elements(p_outputs) AS o
    WHERE o->>'quality' != 'ORG';

    IF v_org_count > 0 THEN
      RAISE EXCEPTION 'When not cleaned, only ORG quality output is allowed';
    END IF;
  END IF;

  -- A batch with a collection is numbered from the collection code. One
  -- without (a received, combined or mixed batch) is numbered from its own code
  -- and its outputs carry its species, as fn_clean_batch does.
  IF v_collection_id IS NULL AND (v_input_species_id IS NULL OR v_input_code IS NULL) THEN
    RAISE EXCEPTION 'Parent batch has no collection';
  END IF;

  IF v_collection_id IS NOT NULL THEN
    SELECT code INTO v_base_code
    FROM "collection"
    WHERE id = v_collection_id;

    IF v_base_code IS NULL THEN
      RAISE EXCEPTION 'Collection not found or has no code';
    END IF;
  ELSE
    v_base_code := v_input_code;
    v_output_species_id := v_input_species_id;
  END IF;

  v_code_pattern := regexp_replace(v_base_code, '[.*+?^${}()|[\]\\]', '\\\&', 'g');

  INSERT INTO batch_cleaning (
    input_batch_id, input_sub_batch_id, material_type, material_subtype,
    material_notes, is_cleaned, cleaning_notes,
    worker_ids, duration, created_by, organisation_id
  ) VALUES (
    v_batch_id, p_sub_batch_id, p_material_type, p_material_subtype,
    p_material_notes, p_is_cleaned, p_cleaning_notes,
    COALESCE(p_worker_ids, '{}'::UUID[]), p_duration,
    auth.uid(), v_organisation_id
  )
  RETURNING id INTO v_cleaning_id;

  FOR v_output IN SELECT * FROM jsonb_array_elements(p_outputs)
  LOOP
    v_quality := v_output->>'quality';
    v_out_material_type := v_output->>'material_type';
    v_out_weight := (v_output->>'weight_grams')::NUMERIC;

    SELECT COALESCE(MAX(
      CASE
        WHEN code ~ ('^' || v_code_pattern || '-' || v_quality || '-[0-9]+$')
        THEN CAST(SUBSTRING(code FROM '[0-9]+$') AS INTEGER)
        ELSE 0
      END
    ), 0) + 1
    INTO v_increment
    FROM batches
    WHERE (v_collection_id IS NOT NULL AND collection_id = v_collection_id)
       OR (v_collection_id IS NULL AND collection_id IS NULL AND organisation_id = v_organisation_id);

    v_batch_code := v_base_code || '-' || v_quality || '-' || v_increment::TEXT;

    -- The provenance columns are copied in the INSERT: batches_provenance_guard
    -- rejects later updates, and rejects non-NULL values on insert unless the
    -- caller is the definer owner (this function is SECURITY DEFINER). For a
    -- batch with a collection they are NULL and stay NULL. Outputs get no
    -- received_transfer_item_id: that belongs to the original receipt.
    INSERT INTO batches (
      collection_id, species_id, code, weight_grams, organisation_id,
      source_collection_code, source_ibra_code, source_collection_year
    ) VALUES (
      v_collection_id, v_output_species_id, v_batch_code, v_out_weight, v_organisation_id,
      v_source_collection_code, v_source_ibra_code, v_source_collection_year
    )
    RETURNING id INTO v_output_batch_id;

    INSERT INTO batch_custody (batch_id, organisation_id, notes)
    VALUES (
      v_output_batch_id,
      v_organisation_id,
      'Batch created via sub-batch cleaning'
    );

    INSERT INTO batch_cleaning_output (
      cleaning_id, output_batch_id, quality, material_type, weight_grams
    ) VALUES (
      v_cleaning_id, v_output_batch_id, v_quality, v_out_material_type, v_out_weight
    );

    INSERT INTO sub_batches (batch_id, weight_grams, notes)
    VALUES (v_output_batch_id, v_out_weight, 'Initial sub-batch from cleaning');
  END LOOP;

  INSERT INTO batch_weight_adjustments (
    sub_batch_id, weight_grams, reason, created_by
  ) VALUES (
    p_sub_batch_id,
    -v_effective_weight,
    'Sub-batch cleaned. Fully consumed.',
    auth.uid()
  );

  RETURN v_cleaning_id;
END;
$function$
;

-- fn_clean_sub_batch (wrapper). Previous definition: 20260911000003_inventory_operations_and_lineage.sql.
-- Change: lock the bag before snapshotting its adjustments.
CREATE OR REPLACE FUNCTION public.fn_clean_sub_batch(p_sub_batch_id uuid, p_duration interval DEFAULT NULL::interval, p_material_type text DEFAULT NULL::text, p_material_subtype text DEFAULT NULL::text, p_material_notes text DEFAULT NULL::text, p_is_cleaned boolean DEFAULT false, p_cleaning_notes text DEFAULT NULL::text, p_worker_ids uuid[] DEFAULT '{}'::uuid[], p_outputs jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cleaning_id UUID;
  v_prior_adjustment_ids UUID[];
  v_classified_count INTEGER;
BEGIN
  -- Lock the bag before snapshotting its adjustments (see the inner function,
  -- which also refuses a reserved bag).
  PERFORM 1
  FROM public.sub_batches sb
  WHERE sb.id = p_sub_batch_id
  FOR UPDATE;

  SELECT COALESCE(array_agg(adjustment.id), '{}'::UUID[])
  INTO v_prior_adjustment_ids
  FROM public.batch_weight_adjustments adjustment
  WHERE adjustment.sub_batch_id = p_sub_batch_id;

  v_cleaning_id := public.fn_clean_sub_batch_without_lineage(
    p_sub_batch_id,
    p_duration,
    p_material_type,
    p_material_subtype,
    p_material_notes,
    p_is_cleaned,
    p_cleaning_notes,
    p_worker_ids,
    p_outputs
  );

  INSERT INTO public.sub_batch_lineage (
    source_sub_batch_id,
    derived_sub_batch_id,
    operation_kind,
    operation_id,
    created_by
  )
  SELECT
    p_sub_batch_id,
    output_bag.id,
    'cleaning',
    v_cleaning_id,
    auth.uid()
  FROM public.batch_cleaning_output output
  INNER JOIN public.sub_batches output_bag
    ON output_bag.batch_id = output.output_batch_id
  WHERE output.cleaning_id = v_cleaning_id;

  UPDATE public.batch_weight_adjustments adjustment
  SET
    kind = 'cleaning',
    lineage_operation_id = v_cleaning_id
  WHERE adjustment.sub_batch_id = p_sub_batch_id
    AND adjustment.id <> ALL (v_prior_adjustment_ids);

  GET DIAGNOSTICS v_classified_count = ROW_COUNT;
  IF v_classified_count != 1 THEN
    RAISE EXCEPTION 'Sub-batch cleaning must create one source adjustment';
  END IF;

  RETURN v_cleaning_id;
END;
$function$
;

-- fn_clean_batch. Previous definition: 20260930000002_combined_batch_species_and_cleaning.sql.
-- Change: copy the input batch's provenance columns onto each output (a
-- collectionless input that carries them). A batch that already has bags is
-- still refused, so a received batch goes through fn_clean_sub_batch.
CREATE OR REPLACE FUNCTION public.fn_clean_batch(p_input_batch_id uuid, p_duration interval DEFAULT NULL::interval, p_material_type text DEFAULT NULL::text, p_material_subtype text DEFAULT NULL::text, p_material_notes text DEFAULT NULL::text, p_is_cleaned boolean DEFAULT false, p_cleaning_notes text DEFAULT NULL::text, p_worker_ids uuid[] DEFAULT '{}'::uuid[], p_outputs jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cleaning_id UUID;
  v_output_batch_id UUID;
  v_collection_id UUID;
  v_input_code TEXT;
  v_input_species_id UUID;
  v_source_collection_code TEXT;
  v_source_ibra_code TEXT;
  v_source_collection_year SMALLINT;
  v_base_code TEXT;
  v_code_pattern TEXT;
  v_output_species_id UUID;
  v_organisation_id UUID;
  v_sub_batch_count INTEGER;
  v_output JSONB;
  v_quality TEXT;
  v_out_material_type TEXT;
  v_out_weight NUMERIC;
  v_increment INTEGER;
  v_batch_code TEXT;
  v_org_count INTEGER;
BEGIN
  IF p_is_cleaned AND p_duration IS NULL THEN
    RAISE EXCEPTION 'Cleaning duration is required';
  END IF;

  SELECT b.collection_id, b.organisation_id, b.code, b.species_id,
    b.source_collection_code, b.source_ibra_code, b.source_collection_year
  INTO v_collection_id, v_organisation_id, v_input_code, v_input_species_id,
    v_source_collection_code, v_source_ibra_code, v_source_collection_year
  FROM batches b
  WHERE b.id = p_input_batch_id;

  IF v_organisation_id IS NULL THEN
    RAISE EXCEPTION 'Input batch not found';
  END IF;

  IF v_collection_id IS NULL AND (v_input_species_id IS NULL OR v_input_code IS NULL) THEN
    RAISE EXCEPTION 'Input batch has no collection';
  END IF;

  IF NOT is_current_custodian(auth.uid(), p_input_batch_id) THEN
    RAISE EXCEPTION 'Permission denied: not current custodian of batch';
  END IF;

  SELECT COUNT(*) INTO v_sub_batch_count
  FROM sub_batches WHERE batch_id = p_input_batch_id;

  IF v_sub_batch_count > 0 THEN
    RAISE EXCEPTION 'Cannot clean a batch that already has sub-batches. Use fn_clean_sub_batch instead.';
  END IF;

  IF jsonb_array_length(p_outputs) = 0 THEN
    RAISE EXCEPTION 'At least one output is required';
  END IF;

  IF NOT p_is_cleaned THEN
    SELECT COUNT(*)
    INTO v_org_count
    FROM jsonb_array_elements(p_outputs) AS o
    WHERE o->>'quality' != 'ORG';

    IF v_org_count > 0 THEN
      RAISE EXCEPTION 'When not cleaned, only ORG quality output is allowed';
    END IF;
  END IF;

  IF v_collection_id IS NOT NULL THEN
    SELECT code INTO v_base_code
    FROM "collection"
    WHERE id = v_collection_id;

    IF v_base_code IS NULL THEN
      RAISE EXCEPTION 'Collection not found or has no code';
    END IF;
  ELSE
    v_base_code := v_input_code;
    v_output_species_id := v_input_species_id;
  END IF;

  v_code_pattern := regexp_replace(v_base_code, '[.*+?^${}()|[\]\\]', '\\\&', 'g');

  INSERT INTO batch_cleaning (
    input_batch_id, material_type, material_subtype,
    material_notes, is_cleaned, cleaning_notes,
    worker_ids, duration, created_by, organisation_id
  ) VALUES (
    p_input_batch_id, p_material_type, p_material_subtype,
    p_material_notes, p_is_cleaned, p_cleaning_notes,
    COALESCE(p_worker_ids, '{}'::UUID[]), p_duration,
    auth.uid(), v_organisation_id
  )
  RETURNING id INTO v_cleaning_id;

  FOR v_output IN SELECT * FROM jsonb_array_elements(p_outputs)
  LOOP
    v_quality := v_output->>'quality';
    v_out_material_type := v_output->>'material_type';
    v_out_weight := (v_output->>'weight_grams')::NUMERIC;

    SELECT COALESCE(MAX(
      CASE
        WHEN code ~ ('^' || v_code_pattern || '-' || v_quality || '-[0-9]+$')
        THEN CAST(SUBSTRING(code FROM '[0-9]+$') AS INTEGER)
        ELSE 0
      END
    ), 0) + 1
    INTO v_increment
    FROM batches
    WHERE (v_collection_id IS NOT NULL AND collection_id = v_collection_id)
       OR (v_collection_id IS NULL AND collection_id IS NULL AND organisation_id = v_organisation_id);

    v_batch_code := v_base_code || '-' || v_quality || '-' || v_increment::TEXT;

    -- The provenance columns are copied in the INSERT: batches_provenance_guard
    -- rejects later updates, and rejects non-NULL values on insert unless the
    -- caller is the definer owner (this function is SECURITY DEFINER). For a
    -- batch with a collection they are NULL and stay NULL.
    INSERT INTO batches (
      collection_id, species_id, code, weight_grams, organisation_id,
      source_collection_code, source_ibra_code, source_collection_year
    ) VALUES (
      v_collection_id, v_output_species_id, v_batch_code, v_out_weight, v_organisation_id,
      v_source_collection_code, v_source_ibra_code, v_source_collection_year
    )
    RETURNING id INTO v_output_batch_id;

    INSERT INTO batch_custody (batch_id, organisation_id, notes)
    VALUES (v_output_batch_id, v_organisation_id, 'Batch created via cleaning');

    INSERT INTO batch_cleaning_output (
      cleaning_id, output_batch_id, quality, material_type, weight_grams
    ) VALUES (
      v_cleaning_id, v_output_batch_id, v_quality, v_out_material_type, v_out_weight
    );

    INSERT INTO sub_batches (batch_id, weight_grams, notes)
    VALUES (v_output_batch_id, v_out_weight, 'Initial sub-batch from cleaning');
  END LOOP;

  RETURN v_cleaning_id;
END;
$function$
;

