-- ---------------------------------------------------------------------------
-- Fixes from the inventory branch review.
--
-- 1. A direct bag write must be authorised against the parent batch, not only
--    against the holder it claims. Cross-organisation custody goes through the
--    transfer RPCs, which are SECURITY DEFINER and so unaffected by RLS.
-- 2. A quality test locks its bag before checking custody and weight, so two
--    concurrent destructive tests cannot both spend the same seed.
-- 3. The assignment-based return delegates to the lineage-aware bag return, so
--    an assignment stays open while the laboratory still holds a split child.
-- 4. A quality test's consumed weight is fixed once recorded: its adjustment is
--    not reconciled on edit, so an edit must not change it.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Parent-batch authorisation on direct bag writes
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "sub_batches_insert" ON public.sub_batches;

create policy "sub_batches_insert"
  on "public"."sub_batches"
  as permissive
  for insert
  to authenticated
with check (((held_by_org_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)) AND public.is_batch_owner(batch_id)));

-- Reparenting a bag is not a direct edit: it would move seed into a batch the
-- caller never had to be authorised for.
REVOKE UPDATE (batch_id) ON public.sub_batches FROM authenticated;

-- ---------------------------------------------------------------------------
-- 2. Lock the bag before a quality test checks it
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_create_quality_test(p_batch_id uuid, p_sub_batch_id uuid, p_result jsonb, p_performed_by_organisation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_test_id UUID;
  v_user_id UUID := (SELECT auth.uid());
  v_current_weight NUMERIC;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  -- Bag first, then its assignments: the order assignment, return and split
  -- take. Held to commit, so a concurrent test, split or transfer of the same
  -- bag waits and then sees this test's adjustment when it reads the weight.
  -- Taken before the classification wrapper snapshots the bag's adjustments.
  PERFORM 1
  FROM public.sub_batches bag
  WHERE bag.id = p_sub_batch_id
  FOR UPDATE;

  v_test_id := public.fn_create_quality_test_without_work_completion(
    p_batch_id,
    p_sub_batch_id,
    p_result,
    p_performed_by_organisation_id
  );

  SELECT weight.current_weight
    INTO v_current_weight
  FROM public.sub_batch_current_weight weight
  WHERE weight.id = p_sub_batch_id;

  IF v_current_weight = 0 THEN
    -- Lock every represented assignment in UUID order as well so derived or
    -- merged lineage cannot introduce a conflicting lock order later.
    PERFORM 1
    FROM public.batch_testing_assignment assignment
    WHERE assignment.id IN (
      SELECT resolved.assignment_id
      FROM public.fn_resolve_testing_assignments_for_sub_batch(
        p_sub_batch_id
      ) resolved
    )
    ORDER BY assignment.id
    FOR UPDATE;

    INSERT INTO public.batch_testing_assignment_status_audit (
      assignment_id,
      old_work_status,
      new_work_status,
      note,
      actor_id,
      recorded_at
    )
    SELECT
      assignment.id,
      assignment.work_status,
      'completed',
      NULL,
      v_user_id,
      v_now
    FROM public.batch_testing_assignment assignment
    WHERE assignment.id IN (
      SELECT resolved.assignment_id
      FROM public.fn_resolve_testing_assignments_for_sub_batch(
        p_sub_batch_id
      ) resolved
    )
      AND assignment.work_closed_at IS NULL
      AND NOT public.fn_testing_assignment_has_held_seed(assignment.id)
    ORDER BY assignment.id;

    UPDATE public.batch_testing_assignment assignment
    SET work_closed_at = v_now,
        work_status = 'completed',
        work_status_note = NULL,
        work_closed_by = v_user_id
    WHERE assignment.id IN (
      SELECT resolved.assignment_id
      FROM public.fn_resolve_testing_assignments_for_sub_batch(
        p_sub_batch_id
      ) resolved
    )
      AND assignment.work_closed_at IS NULL
      AND NOT public.fn_testing_assignment_has_held_seed(assignment.id);
  END IF;

  RETURN v_test_id;
END;
$function$
;

-- ---------------------------------------------------------------------------
-- 3. Assignment-based return follows lineage
--
-- Kept for its errors (a consumed or closed assignment says why), then hands
-- the assignment's bag to fn_return_held_bag_from_testing, which closes the
-- assignment only once the laboratory holds none of its seed. The assignment
-- is read without a lock: the delegate locks the bag and then the
-- assignments, and locking the assignment first here would invert that order.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_return_bag_from_testing(p_assignment_id uuid)
 RETURNS public.batch_testing_assignment
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_caller_org_id uuid;
  v_assignment public.batch_testing_assignment;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '28000';
  END IF;

  SELECT ou.organisation_id
    INTO v_caller_org_id
  FROM public.org_user ou
  WHERE ou.user_id = v_user_id
    AND ou.is_active = true
  ORDER BY ou.joined_at ASC
  LIMIT 1;

  IF v_caller_org_id IS NULL THEN
    RAISE EXCEPTION 'Active organisation membership required'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_assignment
  FROM public.batch_testing_assignment bta
  WHERE bta.id = p_assignment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Testing assignment not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_assignment.assigned_to_org_id IS DISTINCT FROM v_caller_org_id THEN
    RAISE EXCEPTION 'That assignment was not made to your organisation'
      USING ERRCODE = '42501';
  END IF;

  IF v_assignment.outcome = 'consumed' THEN
    RAISE EXCEPTION 'That bag was entirely consumed in testing and cannot be returned'
      USING ERRCODE = '55000';
  END IF;

  IF v_assignment.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'That assignment has already been closed'
      USING ERRCODE = '55000';
  END IF;

  PERFORM 1
  FROM public.fn_return_held_bag_from_testing(v_assignment.sub_batch_id);

  SELECT * INTO v_assignment
  FROM public.batch_testing_assignment bta
  WHERE bta.id = p_assignment_id;

  RETURN v_assignment;
END;
$function$
;

-- ---------------------------------------------------------------------------
-- 4. A quality test's consumed weight cannot change on edit
--
-- The test's consumption adjustment is written once, when the test is
-- created. Changing the type (X-Ray consumes nothing) or the replicate weights
-- afterwards would leave inventory and the recorded result disagreeing.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_guard_quality_test_consumed_weight()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF public.fn_quality_test_consumed_weight(NEW.result)
     IS DISTINCT FROM public.fn_quality_test_consumed_weight(OLD.result) THEN
    RAISE EXCEPTION 'The seed a test consumed cannot be changed: keep its type and replicate weights'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE TRIGGER tests_consumed_weight_immutable
  BEFORE UPDATE OF result ON public.tests
  FOR EACH ROW
  WHEN (NEW.type = 'quality')
  EXECUTE FUNCTION public.fn_guard_quality_test_consumed_weight();

REVOKE ALL ON FUNCTION public.fn_guard_quality_test_consumed_weight() FROM PUBLIC, anon;
