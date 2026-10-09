-- Testing organisations split and merge the bags sent to them
--
-- fn_split_sub_batch and fn_merge_sub_batches are already gated on who holds
-- the bag, so a laboratory can call them on assigned seed, and lineage already
-- ties every derived bag back to the assignment(s) its seed came from. What did
-- not follow lineage was everything that reads or closes an assignment: it
-- looked only at the exact bag that was sent. After a split the children could
-- be neither tested against the assignment nor returned; after a merge the
-- assigned bags sat at zero while the merged bag was stranded with the lab.
--
-- The rule from here on: an assignment stays open while the laboratory holds
-- any seed descended from the bag it names, and closes — as `returned` or
-- `consumed`, by whichever action spent the last of it — once it holds none.
-- A retained subsample is simply a bag the laboratory keeps, and keeps its
-- assignment open until it is returned or used up.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- Does the assigned laboratory still hold any seed from this assignment?
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_testing_assignment_has_held_seed(p_assignment_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH RECURSIVE descendants (sub_batch_id) AS (
    SELECT assignment.sub_batch_id
    FROM public.batch_testing_assignment assignment
    WHERE assignment.id = p_assignment_id
    UNION
    SELECT lineage.derived_sub_batch_id
    FROM public.sub_batch_lineage lineage
    INNER JOIN descendants
      ON descendants.sub_batch_id = lineage.source_sub_batch_id
  )
  SELECT EXISTS (
    SELECT 1
    FROM descendants
    INNER JOIN public.sub_batches bag
      ON bag.id = descendants.sub_batch_id
    INNER JOIN public.sub_batch_current_weight weight
      ON weight.id = bag.id
    INNER JOIN public.batch_testing_assignment assignment
      ON assignment.id = p_assignment_id
    WHERE bag.held_by_org_id = assignment.assigned_to_org_id
      AND weight.current_weight > 0
  )
$function$
;

-- ---------------------------------------------------------------------------
-- Close every listed open assignment the laboratory no longer holds seed for.
-- Internal: callers have already checked who is asking and locked the rows.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_close_spent_testing_assignments(p_assignment_ids uuid[], p_outcome text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  UPDATE public.batch_testing_assignment assignment
  SET closed_at = now(),
      outcome = p_outcome
  WHERE assignment.id = ANY (p_assignment_ids)
    AND assignment.closed_at IS NULL
    AND NOT public.fn_testing_assignment_has_held_seed(assignment.id);
$function$
;

-- ---------------------------------------------------------------------------
-- The laboratory's inventory: every bag it holds with seed in it, against each
-- open assignment that bag carries seed for. A split child maps to its
-- parent's assignment; a merged bag maps to the union of its sources'.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_testing_held_bags()
 RETURNS TABLE(sub_batch_id uuid, assignment_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH RECURSIVE caller AS (
    SELECT public.get_user_organisation_id() AS org_id
  ),
  held AS (
    SELECT bag.id
    FROM public.sub_batches bag
    INNER JOIN public.sub_batch_current_weight weight
      ON weight.id = bag.id
    INNER JOIN caller
      ON caller.org_id = bag.held_by_org_id
    WHERE weight.current_weight > 0
  ),
  ancestors (held_id, sub_batch_id) AS (
    SELECT held.id, held.id
    FROM held
    UNION
    SELECT ancestors.held_id, lineage.source_sub_batch_id
    FROM public.sub_batch_lineage lineage
    INNER JOIN ancestors
      ON ancestors.sub_batch_id = lineage.derived_sub_batch_id
  )
  SELECT DISTINCT ancestors.held_id, assignment.id
  FROM ancestors
  INNER JOIN public.batch_testing_assignment assignment
    ON assignment.sub_batch_id = ancestors.sub_batch_id
  INNER JOIN caller
    ON caller.org_id = assignment.assigned_to_org_id
  WHERE assignment.closed_at IS NULL
  ORDER BY 1, 2
$function$
;

-- ---------------------------------------------------------------------------
-- Hand one held bag back to the seed's owner.
--
-- Bag-based rather than assignment-based, because after a split or merge an
-- assignment's seed may sit in several bags, or one bag may carry several
-- assignments' seed. Every assignment the bag represents closes as `returned`
-- once the laboratory holds nothing else from it.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_return_held_bag_from_testing(p_sub_batch_id uuid)
 RETURNS SETOF public.batch_testing_assignment
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_caller_org_id uuid;
  v_caller_role public.org_user_types;
  v_holder_org_id uuid;
  v_owner_org_id uuid;
  v_current_weight numeric;
  v_assignment_ids uuid[];
  v_now timestamptz := now();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '28000';
  END IF;

  SELECT ou.organisation_id, ou.role
    INTO v_caller_org_id, v_caller_role
  FROM public.org_user ou
  WHERE ou.user_id = v_user_id
    AND ou.is_active = true
  ORDER BY ou.joined_at ASC
  LIMIT 1;

  IF v_caller_org_id IS NULL THEN
    RAISE EXCEPTION 'Active organisation membership required'
      USING ERRCODE = '42501';
  END IF;

  IF v_caller_role IS DISTINCT FROM 'Admin' THEN
    RAISE EXCEPTION 'Admin role required to return a bag from testing'
      USING ERRCODE = '42501';
  END IF;

  -- Bag first, then its assignments: the same order assignment takes.
  SELECT bag.held_by_org_id, batch.organisation_id
    INTO v_holder_org_id, v_owner_org_id
  FROM public.sub_batches bag
  INNER JOIN public.batches batch ON batch.id = bag.batch_id
  WHERE bag.id = p_sub_batch_id
  FOR UPDATE OF bag;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bag not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_holder_org_id IS DISTINCT FROM v_caller_org_id THEN
    RAISE EXCEPTION 'That bag is not held by your organisation'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(assignment.id ORDER BY assignment.id), '{}'::uuid[])
    INTO v_assignment_ids
  FROM public.fn_resolve_testing_assignments_for_sub_batch(p_sub_batch_id) resolved
  INNER JOIN public.batch_testing_assignment assignment
    ON assignment.id = resolved.assignment_id
  WHERE assignment.assigned_to_org_id = v_caller_org_id
    AND assignment.closed_at IS NULL;

  -- A bag with no open assignment behind it is not testing work. That includes
  -- one whose assignments were all closed: there is nobody to return it to
  -- through this path.
  IF cardinality(v_assignment_ids) = 0 THEN
    RAISE EXCEPTION 'That bag is not part of any open testing assignment'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.batch_testing_assignment assignment
  WHERE assignment.id = ANY (v_assignment_ids)
  ORDER BY assignment.id
  FOR UPDATE;

  SELECT weight.current_weight
    INTO v_current_weight
  FROM public.sub_batch_current_weight weight
  WHERE weight.id = p_sub_batch_id;

  IF v_current_weight IS NULL OR v_current_weight <= 0 THEN
    RAISE EXCEPTION 'That bag has no seed left to return'
      USING ERRCODE = '55000';
  END IF;

  -- Off the laboratory's shelf while it still holds the bag, as
  -- fn_return_bag_from_testing does: the owner cannot read the laboratory's
  -- storage locations, and fn_set_sub_batch_storage is gated on the holder.
  IF EXISTS (
    SELECT 1
    FROM public.batch_storage bs
    WHERE bs.sub_batch_id = p_sub_batch_id
      AND bs.moved_out_at IS NULL
  ) THEN
    PERFORM public.fn_set_sub_batch_storage(
      p_sub_batch_id,
      NULL::uuid,
      v_now,
      'Removed from storage: returned from testing'
    );
  END IF;

  -- A bag the laboratory split or merged into one of its own containers must
  -- not arrive pointing at a container the owner cannot see. The container a
  -- bag was mailed in belongs to the owner, and stays.
  UPDATE public.sub_batches bag
  SET held_by_org_id = v_owner_org_id,
      container_id = CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.containers container
          WHERE container.id = bag.container_id
            AND container.organisation_id = v_owner_org_id
            AND container.purpose = 'storage'
            AND container.active
        ) THEN bag.container_id
        ELSE NULL
      END
  WHERE bag.id = p_sub_batch_id;

  PERFORM public.fn_close_spent_testing_assignments(
    v_assignment_ids,
    'returned'
  );

  RETURN QUERY
  SELECT assignment.*
  FROM public.batch_testing_assignment assignment
  WHERE assignment.id = ANY (v_assignment_ids)
  ORDER BY assignment.id;
END;
$function$
;

-- ---------------------------------------------------------------------------
-- Quality tests follow lineage too. A test on a split child or merged bag
-- completes every open assignment the bag carries seed for, and consuming the
-- last of an assignment's seed closes it — not merely emptying one bag of it.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_create_quality_test_without_adjustment_classification(p_batch_id uuid, p_sub_batch_id uuid, p_result jsonb, p_performed_by_organisation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_test_id UUID;
  v_total_weight NUMERIC := 0;
  v_current_weight NUMERIC;
  v_sub_batch_batch_id UUID;
  v_user_organisation_id UUID;
  v_user_id UUID := (SELECT auth.uid());
  v_assignment_ids UUID[];
  v_now TIMESTAMPTZ := now();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '28000';
  END IF;

  SELECT ou.organisation_id INTO v_user_organisation_id
  FROM public.org_user ou
  WHERE ou.user_id = v_user_id
    AND ou.is_active = true
  ORDER BY ou.joined_at ASC
  LIMIT 1;

  IF v_user_organisation_id IS NULL THEN
    RAISE EXCEPTION 'Active organisation membership required'
      USING ERRCODE = '42501';
  END IF;

  IF p_performed_by_organisation_id IS DISTINCT FROM v_user_organisation_id THEN
    RAISE EXCEPTION 'Test organisation does not match authenticated user'
      USING ERRCODE = '42501';
  END IF;

  -- Validate sub-batch belongs to the batch
  SELECT sb.batch_id INTO v_sub_batch_batch_id
  FROM public.sub_batches sb
  WHERE sb.id = p_sub_batch_id;

  IF v_sub_batch_batch_id IS NULL THEN
    RAISE EXCEPTION 'Sub-batch not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_sub_batch_batch_id != p_batch_id THEN
    RAISE EXCEPTION 'Sub-batch does not belong to the specified batch'
      USING ERRCODE = '22023';
  END IF;

  -- One predicate covers both testers: a General organisation testing a bag it
  -- still holds, and a Testing organisation testing one that was sent to it.
  -- The batch-wide check this replaces let either of them test a sibling bag
  -- that had never left the other's shelf.
  IF NOT public.is_current_bag_custodian(v_user_id, p_sub_batch_id) THEN
    RAISE EXCEPTION 'Not authorised to test this bag'
      USING ERRCODE = '42501';
  END IF;

  -- Weight consumed by the test: nothing for a non-destructive X-Ray
  v_total_weight := public.fn_quality_test_consumed_weight(p_result);

  SELECT sbcw.current_weight
    INTO v_current_weight
  FROM public.sub_batch_current_weight sbcw
  WHERE sbcw.id = p_sub_batch_id;

  -- A test cannot consume seed that is not there. There is no way to reverse a
  -- weight adjustment, so a negative bag would need a hand-written
  -- compensating row to correct.
  IF v_total_weight > COALESCE(v_current_weight, 0) THEN
    RAISE EXCEPTION
      'Test consumes %g but the bag holds %g',
      v_total_weight, COALESCE(v_current_weight, 0)
      USING ERRCODE = '22023';
  END IF;

  -- Every open assignment this bag carries seed for: the bag itself if it was
  -- sent, otherwise whatever its lineage leads back to. Locked before the
  -- first write, in identifier order, so a concurrent return cannot close one
  -- between the test landing and completion being recorded.
  SELECT COALESCE(array_agg(bta.id ORDER BY bta.id), '{}'::UUID[])
    INTO v_assignment_ids
  FROM public.fn_resolve_testing_assignments_for_sub_batch(p_sub_batch_id) resolved
  INNER JOIN public.batch_testing_assignment bta
    ON bta.id = resolved.assignment_id
  WHERE bta.assigned_to_org_id = v_user_organisation_id
    AND bta.closed_at IS NULL;

  PERFORM 1
  FROM public.batch_testing_assignment bta
  WHERE bta.id = ANY (v_assignment_ids)
  ORDER BY bta.id
  FOR UPDATE;

  INSERT INTO public.tests (
    batch_id, sub_batch_id, type, result,
    tested_at, tested_by,
    performed_by_organisation_id
  ) VALUES (
    p_batch_id, p_sub_batch_id, 'quality', p_result,
    now(), v_user_id,
    p_performed_by_organisation_id
  )
  RETURNING id INTO v_test_id;

  -- Create weight adjustment for seeds consumed in testing
  IF v_total_weight > 0 THEN
    INSERT INTO public.batch_weight_adjustments (
      sub_batch_id, weight_grams, reason, created_by
    ) VALUES (
      p_sub_batch_id,
      -v_total_weight,
      'Seeds consumed in quality test (test_id: ' || v_test_id || ')',
      v_user_id
    );
  END IF;

  -- The first test completes an assignment; later tests change nothing.
  UPDATE public.batch_testing_assignment bta
  SET completed_at = COALESCE(bta.completed_at, v_now)
  WHERE bta.id = ANY (v_assignment_ids)
    AND bta.closed_at IS NULL;

  -- Consuming the last of an assignment's seed closes it outright: there is
  -- nothing left to send back, and an assignment left open would sit in the
  -- Testing organisation's outstanding list forever.
  IF v_total_weight > 0 THEN
    PERFORM public.fn_close_spent_testing_assignments(
      v_assignment_ids,
      'consumed'
    );
  END IF;

  RETURN v_test_id;
END;
$function$
;

-- Testing work is complete when the assignment's seed is used up, not when one
-- bag of it is: a split child tested to nothing leaves its siblings to test.
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
    -- The underlying mutation already locks the directly assigned bag. Lock
    -- every represented assignment in UUID order as well so derived or merged
    -- lineage cannot introduce a conflicting lock order later.
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
-- Privileges. A new function starts out executable by PUBLIC, anon and
-- authenticated; replaced functions keep the privileges they had.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.fn_testing_assignment_has_held_seed(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_close_spent_testing_assignments(uuid[], text) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.fn_testing_held_bags() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_testing_held_bags() TO authenticated;

REVOKE ALL ON FUNCTION public.fn_return_held_bag_from_testing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_return_held_bag_from_testing(uuid) TO authenticated;
