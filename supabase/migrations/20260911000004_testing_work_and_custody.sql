-- Testing work and custody
--
-- Final RPCs for dispatching seed to testing providers, recording work,
-- returning bags, and calculating quality-test statistics.

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.calculate_quality_test_statistics(p_test_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  test_result JSONB;
  batch_id UUID;
  batch_weight NUMERIC;
  repeats JSONB;
  repeat_count INTEGER;
  viability_values NUMERIC[] := ARRAY[]::NUMERIC[];
  per_seed_weights NUMERIC[] := ARRAY[]::NUMERIC[];
  repeat_item JSONB;
  viable_count NUMERIC;
  dead_count NUMERIC;
  total_count NUMERIC;
  weight_grams NUMERIC;
  psu_grams NUMERIC;
  inert_weight NUMERIC;
  other_species_weight NUMERIC;
  total_sample_weight NUMERIC;
  mean_viability NUMERIC;
  mean_seed_weight NUMERIC;
  pure_seed_fraction NUMERIC;
  pure_live_seed_fraction NUMERIC;
  batch_seed_count NUMERIC;
  batch_pure_seed_count INTEGER;
  batch_pure_live_seed_count INTEGER;
  std_dev NUMERIC;
  standard_error NUMERIC;
  result JSONB;
BEGIN
  SELECT t.result, t.batch_id INTO test_result, batch_id
  FROM tests t WHERE t.id = p_test_id;

  IF test_result IS NULL THEN RETURN NULL; END IF;

  SELECT bcw.current_weight INTO batch_weight
  FROM batch_current_weight bcw WHERE bcw.id = batch_id;

  repeats := test_result->'repeats';
  repeat_count := jsonb_array_length(repeats);

  IF repeat_count IS NULL OR repeat_count = 0 THEN RETURN NULL; END IF;

  FOR i IN 0..(repeat_count - 1) LOOP
    repeat_item := repeats->i;
    viable_count := (repeat_item->>'viable_seed_count')::NUMERIC;
    dead_count := (repeat_item->>'dead_seed_count')::NUMERIC;
    weight_grams := (repeat_item->>'weight_grams')::NUMERIC;
    total_count := viable_count + dead_count;

    IF total_count = 0 THEN
      viability_values := array_append(viability_values, 0);
      per_seed_weights := array_append(per_seed_weights, 0);
    ELSE
      viability_values := array_append(viability_values, viable_count / total_count);
      per_seed_weights := array_append(per_seed_weights, weight_grams / total_count);
    END IF;
  END LOOP;

  SELECT AVG(val) INTO mean_viability FROM unnest(viability_values) AS val;
  SELECT AVG(val) INTO mean_seed_weight FROM unnest(per_seed_weights) AS val;

  psu_grams := (test_result->>'psu_grams')::NUMERIC;
  inert_weight := COALESCE((test_result->>'inert_seed_weight_grams')::NUMERIC, 0);
  other_species_weight := COALESCE((test_result->>'other_species_seeds_grams')::NUMERIC, 0);
  total_sample_weight := psu_grams + inert_weight + other_species_weight;

  IF total_sample_weight = 0 THEN
    pure_seed_fraction := 0;
  ELSE
    pure_seed_fraction := psu_grams / total_sample_weight;
  END IF;

  pure_live_seed_fraction := pure_seed_fraction * mean_viability;

  IF batch_weight IS NOT NULL AND batch_weight > 0 AND mean_seed_weight > 0 THEN
    batch_seed_count := batch_weight / mean_seed_weight;
    batch_pure_seed_count := ROUND(batch_seed_count * pure_seed_fraction)::INTEGER;
    batch_pure_live_seed_count := ROUND(batch_seed_count * pure_live_seed_fraction)::INTEGER;
  ELSE
    batch_seed_count := NULL;
    batch_pure_seed_count := NULL;
    batch_pure_live_seed_count := NULL;
  END IF;

  std_dev := calculate_standard_deviation(viability_values);
  IF std_dev IS NOT NULL THEN
    standard_error := std_dev / SQRT(repeat_count);
  ELSE
    standard_error := NULL;
  END IF;

  result := jsonb_build_object(
    'tpsu', ROUND(mean_seed_weight::NUMERIC, 6),
    'psu', ROUND(pure_seed_fraction::NUMERIC, 6),
    'vsu', ROUND(mean_viability::NUMERIC, 6),
    'pls', ROUND(pure_live_seed_fraction::NUMERIC, 6),
    'plsCount', batch_pure_live_seed_count,
    'psuCount', batch_pure_seed_count,
    'standardError', CASE WHEN standard_error IS NOT NULL
                     THEN ROUND(standard_error::NUMERIC, 6) ELSE NULL END
  );

  RETURN result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.calculate_standard_deviation(input_values numeric[])
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  n INTEGER;
  mean_val NUMERIC;
  sum_val NUMERIC;
  sum_squares NUMERIC;
  variance NUMERIC;
BEGIN
  n := array_length(input_values, 1);
  IF n IS NULL OR n < 2 THEN
    RETURN NULL;
  END IF;

  SELECT SUM(val), SUM(val * val)
  INTO sum_val, sum_squares
  FROM unnest(input_values) AS val;

  mean_val := sum_val / n;
  variance := (sum_squares - n * mean_val * mean_val) / (n - 1);
  RETURN SQRT(variance);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_assign_bags_for_testing(p_provider_org_id uuid, p_bags jsonb)
 RETURNS SETOF public.batch_testing_assignment
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_caller_org_id uuid;
  v_caller_role public.org_user_types;
  v_bag_ids uuid[] := '{}'::uuid[];
  v_assignment_ids uuid[] := '{}'::uuid[];
  v_requests jsonb;
  v_item jsonb;
  v_raw text;
  v_bag_id uuid;
  v_assigned_bag_id uuid;
  v_batch_id uuid;
  v_holder_org_id uuid;
  v_sample_weight numeric;
  v_container_id uuid;
  v_current_weight numeric;
  v_split_ids uuid[];
  v_transfer_event_id uuid;
  v_transfer_item_id uuid;
  v_owner_org_id uuid;
  v_moved_weight numeric;
  v_assignment_id uuid;
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
    RAISE EXCEPTION 'Admin role required to assign bags for testing'
      USING ERRCODE = '42501';
  END IF;

  -- --------------------------------------------------------------------
  -- Request shape. Identifiers are cast defensively: a malformed uuid would
  -- otherwise surface to the edge wrapper as 22P02, which is outside the
  -- code contract above and maps to nothing useful.
  -- --------------------------------------------------------------------
  IF jsonb_typeof(p_bags) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_bags) = 0 THEN
    RAISE EXCEPTION 'At least one bag is required'
      USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT jsonb_array_elements(p_bags) LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Every entry must be an object describing one bag'
        USING ERRCODE = '22023';
    END IF;

    v_raw := nullif(v_item ->> 'sub_batch_id', '');

    IF v_raw IS NULL THEN
      RAISE EXCEPTION 'Every entry requires a sub_batch_id'
        USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_bag_id := v_raw::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'sub_batch_id % is not a valid identifier', v_raw
        USING ERRCODE = '22023';
    END;

    IF v_bag_id = ANY (v_bag_ids) THEN
      RAISE EXCEPTION 'A bag may appear only once in an assignment request'
        USING ERRCODE = '22023';
    END IF;

    v_raw := nullif(v_item ->> 'sample_weight_grams', '');

    IF v_raw IS NOT NULL THEN
      BEGIN
        v_sample_weight := v_raw::numeric;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'sample_weight_grams % is not a number', v_raw
          USING ERRCODE = '22023';
      END;

      IF v_sample_weight <= 0 THEN
        RAISE EXCEPTION 'sample_weight_grams must be greater than zero'
          USING ERRCODE = '22023';
      END IF;
    END IF;

    v_raw := nullif(v_item ->> 'container_id', '');

    IF v_raw IS NOT NULL THEN
      BEGIN
        v_container_id := v_raw::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'container_id % is not a valid identifier', v_raw
          USING ERRCODE = '22023';
      END;
    END IF;

    v_bag_ids := v_bag_ids || v_bag_id;
  END LOOP;

  -- Work in identifier order from here on, which is also the order the rows
  -- come back in.
  SELECT jsonb_agg(e ORDER BY (e ->> 'sub_batch_id')::uuid)
    INTO v_requests
  FROM jsonb_array_elements(p_bags) AS e;

  -- --------------------------------------------------------------------
  -- An accepted link is the whole permission check. The link used to carry
  -- can_test and can_process flags, but with treating gone every assignment
  -- is the same thing, so there was nothing left for them to discriminate.
  -- --------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM public.organisation o WHERE o.id = p_provider_org_id
  ) THEN
    RAISE EXCEPTION 'Testing provider not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organisation o
    WHERE o.id = p_provider_org_id
      AND o.is_testing_provider
  ) THEN
    RAISE EXCEPTION 'Bags may only be assigned to a testing provider'
      USING ERRCODE = '42501';
  END IF;

  -- A row in organisation_link is an accepted link; requests live in their own
  -- table until they are accepted. Matching on requesting_org_id is also what
  -- proves the caller is the General side of the relationship.
  IF NOT EXISTS (
    SELECT 1
    FROM public.organisation_link ol
    WHERE ol.requesting_org_id = v_caller_org_id
      AND ol.provider_org_id = p_provider_org_id
  ) THEN
    RAISE EXCEPTION 'Your organisation is not linked to that testing provider'
      USING ERRCODE = '42501';
  END IF;

  -- --------------------------------------------------------------------
  -- Lock before checking, bags first and then their parent batches, each in
  -- identifier order. Two concurrent multi-bag requests therefore queue
  -- behind one another instead of deadlocking.
  -- --------------------------------------------------------------------
  PERFORM 1
  FROM public.sub_batches sb
  WHERE sb.id = ANY (v_bag_ids)
  ORDER BY sb.id
  FOR UPDATE;

  PERFORM 1
  FROM public.batches b
  WHERE b.id IN (
    SELECT sb.batch_id
    FROM public.sub_batches sb
    WHERE sb.id = ANY (v_bag_ids)
  )
  ORDER BY b.id
  FOR UPDATE;

  PERFORM 1
  FROM public.batch_testing_assignment bta
  WHERE bta.sub_batch_id = ANY (v_bag_ids)
    AND bta.closed_at IS NULL
  ORDER BY bta.sub_batch_id
  FOR UPDATE;

  -- --------------------------------------------------------------------
  -- Validate every bag before writing anything: the request is all or
  -- nothing, and a partially valid multi-bag request must leave no trace.
  -- --------------------------------------------------------------------
  FOR v_item IN SELECT jsonb_array_elements(v_requests) LOOP
    v_bag_id := (v_item ->> 'sub_batch_id')::uuid;
    v_sample_weight := nullif(v_item ->> 'sample_weight_grams', '')::numeric;
    v_container_id := nullif(v_item ->> 'container_id', '')::uuid;

    SELECT sb.batch_id, sb.held_by_org_id, b.organisation_id
      INTO v_batch_id, v_holder_org_id, v_owner_org_id
    FROM public.sub_batches sb
    INNER JOIN public.batches b ON b.id = sb.batch_id
    WHERE sb.id = v_bag_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Bag % not found', v_bag_id
        USING ERRCODE = 'P0002';
    END IF;

    -- Checked before the holder test on purpose. An assigned bag is held by the
    -- laboratory, so the holder test would also reject it — but with "not held
    -- by your organisation", which describes a consequence rather than the
    -- cause and invites the caller to go looking for a custody problem that
    -- does not exist. A double-send is a conflict, and says so.
    IF EXISTS (
      SELECT 1
      FROM public.batch_testing_assignment bta
      WHERE bta.sub_batch_id = v_bag_id
        AND bta.closed_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Bag % already has an active testing assignment', v_bag_id
        USING ERRCODE = '55000';
    END IF;

    -- Dispatch requires both ownership and physical custody. A provider can
    -- send seed it owns, but custody alone never permits forwarding another
    -- organisation's seed to a third party.
    IF v_holder_org_id IS DISTINCT FROM v_caller_org_id THEN
      RAISE EXCEPTION 'Bag % is not held by your organisation', v_bag_id
        USING ERRCODE = '42501';
    END IF;

    IF v_owner_org_id IS DISTINCT FROM v_caller_org_id THEN
      RAISE EXCEPTION 'Bag % is not owned by your organisation', v_bag_id
        USING ERRCODE = '42501';
    END IF;

    SELECT sbcw.current_weight
      INTO v_current_weight
    FROM public.sub_batch_current_weight sbcw
    WHERE sbcw.id = v_bag_id;

    IF v_current_weight IS NULL OR v_current_weight <= 0 THEN
      RAISE EXCEPTION 'Bag % has no seed left to send', v_bag_id
        USING ERRCODE = '22023';
    END IF;

    -- Strictly less: sending the whole bag is what omitting the sample weight
    -- means, and a split that leaves the source at zero would strand it.
    IF v_sample_weight IS NOT NULL AND v_sample_weight >= v_current_weight THEN
      RAISE EXCEPTION
        'Sample weight must be less than the current weight of bag %', v_bag_id
        USING ERRCODE = '22023';
    END IF;

    IF v_container_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.containers c
      WHERE c.id = v_container_id
        AND c.organisation_id = v_caller_org_id
        AND c.purpose = 'storage'
        AND c.active
    ) THEN
      RAISE EXCEPTION
        'Mailing container % must be an active storage container of your organisation',
        v_container_id
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  -- --------------------------------------------------------------------
  -- Writes
  -- --------------------------------------------------------------------
  INSERT INTO public.seed_transfer_event (
    sender_org_id,
    recipient_org_id,
    kind,
    effective_at,
    recorded_at,
    recorded_by
  ) VALUES (
    v_caller_org_id,
    p_provider_org_id,
    'testing_dispatch',
    v_now,
    v_now,
    v_user_id
  )
  RETURNING id INTO v_transfer_event_id;

  FOR v_item IN SELECT jsonb_array_elements(v_requests) LOOP
    v_bag_id := (v_item ->> 'sub_batch_id')::uuid;
    v_sample_weight := nullif(v_item ->> 'sample_weight_grams', '')::numeric;
    v_container_id := nullif(v_item ->> 'container_id', '')::uuid;

    SELECT sb.batch_id
      INTO v_batch_id
    FROM public.sub_batches sb
    WHERE sb.id = v_bag_id;

    IF v_sample_weight IS NOT NULL THEN
      -- The child is created under the same parent batch and, because the
      -- caller holds the source, held by the caller — so the transfer below
      -- reads the same either way.
      v_split_ids := public.fn_split_sub_batch(
        v_bag_id,
        jsonb_build_array(
          jsonb_build_object(
            'weight_grams', v_sample_weight,
            'container_id', v_container_id,
            'notes', 'Sample sent for testing'
          )
        )
      );

      v_assigned_bag_id := v_split_ids[1];
    ELSE
      v_assigned_bag_id := v_bag_id;

      IF v_container_id IS NOT NULL THEN
        UPDATE public.sub_batches
        SET container_id = v_container_id
        WHERE id = v_assigned_bag_id;
      END IF;
    END IF;

    SELECT b.organisation_id, sbcw.current_weight
      INTO v_owner_org_id, v_moved_weight
    FROM public.sub_batches sb
    INNER JOIN public.batches b ON b.id = sb.batch_id
    INNER JOIN public.sub_batch_current_weight sbcw ON sbcw.id = sb.id
    WHERE sb.id = v_assigned_bag_id;

    INSERT INTO public.seed_transfer_item (
      transfer_event_id,
      sub_batch_id,
      batch_id,
      owner_org_id,
      weight_grams
    ) VALUES (
      v_transfer_event_id,
      v_assigned_bag_id,
      v_batch_id,
      v_owner_org_id,
      v_moved_weight
    )
    RETURNING id INTO v_transfer_item_id;

    -- An assigned bag is in the mail, not on a shelf. Close its storage row
    -- while the caller still holds it — fn_set_sub_batch_storage is gated on
    -- the bag's holder, and the next statement hands the bag over.
    IF EXISTS (
      SELECT 1
      FROM public.batch_storage bs
      WHERE bs.sub_batch_id = v_assigned_bag_id
        AND bs.moved_out_at IS NULL
    ) THEN
      PERFORM public.fn_set_sub_batch_storage(
        v_assigned_bag_id,
        NULL::uuid,
        v_now,
        'Removed from storage: assigned for testing'
      );
    END IF;

    UPDATE public.sub_batches
    SET held_by_org_id = p_provider_org_id
    WHERE id = v_assigned_bag_id;

    INSERT INTO public.batch_testing_assignment (
      batch_id,
      sub_batch_id,
      assigned_to_org_id,
      assigned_by_org_id,
      assigned_at,
      outbound_transfer_item_id
    ) VALUES (
      v_batch_id,
      v_assigned_bag_id,
      p_provider_org_id,
      v_caller_org_id,
      v_now,
      v_transfer_item_id
    )
    RETURNING id INTO v_assignment_id;

    v_assignment_ids := v_assignment_ids || v_assignment_id;
  END LOOP;

  RETURN QUERY
  SELECT bta.*
  FROM public.batch_testing_assignment bta
  WHERE bta.id = ANY (v_assignment_ids)
  ORDER BY bta.sub_batch_id;
END;
$function$
;

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
      AND assignment.work_closed_at IS NULL;
  END IF;

  RETURN v_test_id;
END;
$function$
;

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
  v_repeat JSONB;
  v_sub_batch_batch_id UUID;
  v_user_organisation_id UUID;
  v_user_id UUID := (SELECT auth.uid());
  v_assignment_id UUID;
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

  -- Calculate total weight consumed from repeats
  FOR v_repeat IN SELECT * FROM jsonb_array_elements(p_result -> 'repeats')
  LOOP
    v_total_weight := v_total_weight + COALESCE((v_repeat ->> 'weight_grams')::NUMERIC, 0);
  END LOOP;

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

  -- Take the assignment's lock before the first write so a concurrent return
  -- cannot close it between the test landing and completion being recorded.
  -- At most one row can match: the partial unique index says so.
  SELECT bta.id
    INTO v_assignment_id
  FROM public.batch_testing_assignment bta
  WHERE bta.sub_batch_id = p_sub_batch_id
    AND bta.closed_at IS NULL
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

  -- The first test completes this bag's assignment; later tests change
  -- nothing. Consuming the last of the bag closes it outright: there is
  -- nothing left to send back, and an assignment left open would sit in the
  -- Testing organisation's outstanding list forever while active_sub_batches
  -- has already dropped the bag.
  IF v_assignment_id IS NOT NULL THEN
    UPDATE public.batch_testing_assignment bta
    SET completed_at = COALESCE(bta.completed_at, v_now),
        closed_at = CASE
          WHEN v_total_weight > 0 AND v_current_weight - v_total_weight = 0
            THEN v_now
          ELSE bta.closed_at
        END,
        outcome = CASE
          WHEN v_total_weight > 0 AND v_current_weight - v_total_weight = 0
            THEN 'consumed'
          ELSE bta.outcome
        END
    WHERE bta.id = v_assignment_id;
  END IF;

  RETURN v_test_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_create_quality_test_without_work_completion(p_batch_id uuid, p_sub_batch_id uuid, p_result jsonb, p_performed_by_organisation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_test_id UUID;
  v_prior_adjustment_ids UUID[];
  v_total_weight NUMERIC := 0;
  v_repeat JSONB;
  v_classified_count INTEGER;
BEGIN
  SELECT COALESCE(array_agg(adjustment.id), '{}'::UUID[])
  INTO v_prior_adjustment_ids
  FROM public.batch_weight_adjustments adjustment
  WHERE adjustment.sub_batch_id = p_sub_batch_id;

  FOR v_repeat IN SELECT * FROM jsonb_array_elements(p_result -> 'repeats')
  LOOP
    v_total_weight := v_total_weight
      + COALESCE((v_repeat ->> 'weight_grams')::NUMERIC, 0);
  END LOOP;

  v_test_id :=
    public.fn_create_quality_test_without_adjustment_classification(
      p_batch_id,
      p_sub_batch_id,
      p_result,
      p_performed_by_organisation_id
    );

  UPDATE public.batch_weight_adjustments adjustment
  SET
    kind = 'test_consumption',
    test_id = v_test_id
  WHERE adjustment.sub_batch_id = p_sub_batch_id
    AND adjustment.id <> ALL (v_prior_adjustment_ids);

  GET DIAGNOSTICS v_classified_count = ROW_COUNT;
  IF v_classified_count != (
    CASE WHEN v_total_weight > 0 THEN 1 ELSE 0 END
  ) THEN
    RAISE EXCEPTION 'Quality test adjustment count does not match consumption';
  END IF;

  RETURN v_test_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_resolve_testing_assignments_for_sub_batch(p_sub_batch_id uuid)
 RETURNS TABLE(assignment_id uuid)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH RECURSIVE ancestors (sub_batch_id) AS (
    VALUES (p_sub_batch_id)
    UNION
    SELECT lineage.source_sub_batch_id
    FROM public.sub_batch_lineage lineage
    INNER JOIN ancestors
      ON ancestors.sub_batch_id = lineage.derived_sub_batch_id
  )
  SELECT DISTINCT assignment.id
  FROM ancestors
  INNER JOIN public.batch_testing_assignment assignment
    ON assignment.sub_batch_id = ancestors.sub_batch_id
  ORDER BY assignment.id;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_return_bag_from_testing(p_assignment_id uuid)
 RETURNS public.batch_testing_assignment
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_caller_org_id uuid;
  v_caller_role public.org_user_types;
  v_assignment public.batch_testing_assignment;
  v_owner_org_id uuid;
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

  SELECT * INTO v_assignment
  FROM public.batch_testing_assignment bta
  WHERE bta.id = p_assignment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Testing assignment not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_assignment.assigned_to_org_id IS DISTINCT FROM v_caller_org_id THEN
    RAISE EXCEPTION 'That assignment was not made to your organisation'
      USING ERRCODE = '42501';
  END IF;

  -- Checked ahead of the general closed test so the caller is told why, not
  -- merely that they are too late: testing used the bag up.
  IF v_assignment.outcome = 'consumed' THEN
    RAISE EXCEPTION 'That bag was entirely consumed in testing and cannot be returned'
      USING ERRCODE = '55000';
  END IF;

  IF v_assignment.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'That assignment has already been closed'
      USING ERRCODE = '55000';
  END IF;

  -- The bag goes back to the parent batch's owner. Ownership is the right
  -- answer rather than "whoever sent it" because temporary custody never moves
  -- batches.organisation_id, so the two cannot disagree.
  SELECT b.organisation_id
    INTO v_owner_org_id
  FROM public.batches b
  WHERE b.id = v_assignment.batch_id
  FOR UPDATE;

  IF v_owner_org_id IS NULL THEN
    RAISE EXCEPTION 'Batch not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- Symmetric with assignment, which takes the bag off the sender's shelf: a
  -- bag the Testing organisation shelved must not go back still pointing at one
  -- of their storage locations. The owner cannot even resolve that location's
  -- name — storage_locations stays organisation-scoped — so the row would
  -- render as a bag stored nowhere legible. Closed here, while Testing still
  -- holds the bag and so still passes the RPC's own custody gate; the bag is in
  -- transit until the owner stores it again.
  IF EXISTS (
    SELECT 1
    FROM public.batch_storage bs
    WHERE bs.sub_batch_id = v_assignment.sub_batch_id
      AND bs.moved_out_at IS NULL
  ) THEN
    PERFORM public.fn_set_sub_batch_storage(
      v_assignment.sub_batch_id,
      NULL::uuid,
      v_now,
      'Removed from storage: returned from testing'
    );
  END IF;

  UPDATE public.sub_batches
  SET held_by_org_id = v_owner_org_id
  WHERE id = v_assignment.sub_batch_id;

  -- completed_at means "the first test was recorded" and is left alone: a bag
  -- can come back untested, and back-filling the timestamp on return would
  -- make the record claim a test that never happened.
  UPDATE public.batch_testing_assignment bta
  SET closed_at = v_now,
      outcome = 'returned'
  WHERE bta.id = p_assignment_id
  RETURNING * INTO v_assignment;

  RETURN v_assignment;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_return_bags_from_testing(p_items jsonb, p_work_status text DEFAULT NULL::text, p_work_status_note text DEFAULT NULL::text, p_is_final boolean DEFAULT false, p_variance_reason text DEFAULT NULL::text)
 RETURNS TABLE(transfer_event_id uuid, transfer_item_id uuid, source_sub_batch_id uuid, returned_sub_batch_id uuid, returned_weight_grams numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_result RECORD;
  v_remaining_weight NUMERIC;
  v_reason TEXT := nullif(btrim(p_variance_reason), '');
BEGIN
  FOR v_result IN
    SELECT movement.*
    FROM public.fn_return_bags_from_testing_without_final_variance(
      p_items,
      p_work_status,
      p_work_status_note
    ) movement
  LOOP
    IF p_is_final THEN
      SELECT weight.current_weight
        INTO v_remaining_weight
      FROM public.sub_batch_current_weight weight
      WHERE weight.id = v_result.source_sub_batch_id;

      IF v_remaining_weight > 0 THEN
        IF v_reason IS NULL THEN
          RAISE EXCEPTION 'A variance reason is required for a final return shortage'
            USING ERRCODE = '22023';
        END IF;

        INSERT INTO public.batch_weight_adjustments (
          sub_batch_id,
          weight_grams,
          reason,
          created_by,
          kind,
          transfer_item_id
        ) VALUES (
          v_result.source_sub_batch_id,
          -v_remaining_weight,
          v_reason,
          v_user_id,
          'variance',
          v_result.transfer_item_id
        );
      END IF;
    END IF;

    transfer_event_id := v_result.transfer_event_id;
    transfer_item_id := v_result.transfer_item_id;
    source_sub_batch_id := v_result.source_sub_batch_id;
    returned_sub_batch_id := v_result.returned_sub_batch_id;
    returned_weight_grams := v_result.returned_weight_grams;
    RETURN NEXT;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_return_bags_from_testing_without_final_variance(p_items jsonb, p_work_status text DEFAULT NULL::text, p_work_status_note text DEFAULT NULL::text)
 RETURNS TABLE(transfer_event_id uuid, transfer_item_id uuid, source_sub_batch_id uuid, returned_sub_batch_id uuid, returned_weight_grams numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_caller_org_id UUID;
  v_caller_role public.org_user_types;
  v_item JSONB;
  v_raw TEXT;
  v_source_id UUID;
  v_source_ids UUID[] := '{}'::UUID[];
  v_assignment_ids UUID[] := '{}'::UUID[];
  v_open_assignment_ids UUID[] := '{}'::UUID[];
  v_assignment_id UUID;
  v_batch_id UUID;
  v_owner_org_id UUID;
  v_request_owner_org_id UUID;
  v_holder_org_id UUID;
  v_current_weight NUMERIC;
  v_return_weight NUMERIC;
  v_returned_ids UUID[];
  v_returned_id UUID;
  v_transfer_event_id UUID;
  v_transfer_item_id UUID;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '28000';
  END IF;

  SELECT member.organisation_id, member.role
    INTO v_caller_org_id, v_caller_role
  FROM public.org_user member
  WHERE member.user_id = v_user_id
    AND member.is_active = true
  ORDER BY member.joined_at, member.organisation_id
  LIMIT 1;

  IF v_caller_org_id IS NULL THEN
    RAISE EXCEPTION 'Active organisation membership required'
      USING ERRCODE = '42501';
  END IF;

  IF v_caller_role IS DISTINCT FROM 'Admin' THEN
    RAISE EXCEPTION 'Testing Admin role required to return seed'
      USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one return item is required'
      USING ERRCODE = '22023';
  END IF;

  -- Parse identifiers before locking so malformed input maps to the public
  -- invalid-parameter contract instead of leaking a cast error.
  FOR v_item IN SELECT jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Every return item must be an object'
        USING ERRCODE = '22023';
    END IF;

    v_raw := nullif(v_item ->> 'sub_batch_id', '');
    IF v_raw IS NULL THEN
      RAISE EXCEPTION 'Every return item requires a sub_batch_id'
        USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_source_id := v_raw::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'sub_batch_id % is not a valid identifier', v_raw
        USING ERRCODE = '22023';
    END;

    IF v_source_id = ANY (v_source_ids) THEN
      RAISE EXCEPTION 'A bag may appear only once in a return request'
        USING ERRCODE = '22023';
    END IF;

    v_source_ids := array_append(v_source_ids, v_source_id);
  END LOOP;

  -- All custody mutations take source bags, assignments, and their immutable
  -- outbound transfer rows in stable UUID order.
  PERFORM 1
  FROM public.sub_batches bag
  WHERE bag.id = ANY (v_source_ids)
  ORDER BY bag.id
  FOR UPDATE;

  IF NOT FOUND OR (
    SELECT count(*)
    FROM public.sub_batches bag
    WHERE bag.id = ANY (v_source_ids)
  ) <> cardinality(v_source_ids) THEN
    RAISE EXCEPTION 'One or more return bags were not found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT resolved.assignment_id), '{}'::UUID[])
    INTO v_assignment_ids
  FROM unnest(v_source_ids) source_id
  CROSS JOIN LATERAL
    public.fn_resolve_testing_assignments_for_sub_batch(source_id) resolved;

  IF cardinality(v_assignment_ids) = 0 THEN
    RAISE EXCEPTION 'Returned seed must represent a testing assignment'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.batch_testing_assignment assignment
  WHERE assignment.id = ANY (v_assignment_ids)
  ORDER BY assignment.id
  FOR UPDATE;

  PERFORM 1
  FROM public.seed_transfer_item transfer_item
  WHERE transfer_item.id IN (
    SELECT assignment.outbound_transfer_item_id
    FROM public.batch_testing_assignment assignment
    WHERE assignment.id = ANY (v_assignment_ids)
  )
  ORDER BY transfer_item.id
  FOR KEY SHARE;

  -- Validate every item before writing the transfer header or closing work.
  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(p_items)
    ORDER BY (value ->> 'sub_batch_id')::UUID
  LOOP
    v_source_id := (v_item ->> 'sub_batch_id')::UUID;

    SELECT
      bag.batch_id,
      bag.held_by_org_id,
      batch.organisation_id,
      weight.current_weight
      INTO
        v_batch_id,
        v_holder_org_id,
        v_owner_org_id,
        v_current_weight
    FROM public.sub_batches bag
    INNER JOIN public.batches batch ON batch.id = bag.batch_id
    INNER JOIN public.sub_batch_current_weight weight ON weight.id = bag.id
    WHERE bag.id = v_source_id;

    IF v_holder_org_id IS DISTINCT FROM v_caller_org_id THEN
      RAISE EXCEPTION 'Bag % is not held by your organisation', v_source_id
        USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.fn_resolve_testing_assignments_for_sub_batch(
        v_source_id
      ) resolved
      INNER JOIN public.batch_testing_assignment assignment
        ON assignment.id = resolved.assignment_id
      WHERE assignment.assigned_to_org_id = v_caller_org_id
    ) THEN
      RAISE EXCEPTION 'Bag % is not part of your testing work', v_source_id
        USING ERRCODE = '42501';
    END IF;

    IF v_request_owner_org_id IS NULL THEN
      v_request_owner_org_id := v_owner_org_id;
    ELSIF v_request_owner_org_id IS DISTINCT FROM v_owner_org_id THEN
      RAISE EXCEPTION 'One return request must have one seed owner'
        USING ERRCODE = '22023';
    END IF;

    IF v_current_weight IS NULL OR v_current_weight <= 0 THEN
      RAISE EXCEPTION 'Bag % has no seed left to return', v_source_id
        USING ERRCODE = '22023';
    END IF;

    v_raw := nullif(v_item ->> 'weight_grams', '');
    IF v_raw IS NULL THEN
      v_return_weight := v_current_weight;
    ELSE
      BEGIN
        v_return_weight := v_raw::NUMERIC;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'weight_grams % is not a number', v_raw
          USING ERRCODE = '22023';
      END;
    END IF;

    IF v_return_weight <= 0 OR v_return_weight > v_current_weight THEN
      RAISE EXCEPTION
        'Return weight for bag % must be positive and no greater than %g',
        v_source_id,
        v_current_weight
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  SELECT COALESCE(array_agg(assignment.id ORDER BY assignment.id), '{}'::UUID[])
    INTO v_open_assignment_ids
  FROM public.batch_testing_assignment assignment
  WHERE assignment.id = ANY (v_assignment_ids)
    AND assignment.work_closed_at IS NULL;

  IF cardinality(v_open_assignment_ids) > 0 AND p_work_status IS NULL THEN
    RAISE EXCEPTION 'The first return requires an explicit work status'
      USING ERRCODE = '22023';
  END IF;

  FOREACH v_assignment_id IN ARRAY v_open_assignment_ids LOOP
    PERFORM public.fn_set_testing_assignment_work_status(
      v_assignment_id,
      p_work_status,
      p_work_status_note
    );
  END LOOP;

  INSERT INTO public.seed_transfer_event (
    sender_org_id,
    recipient_org_id,
    kind,
    effective_at,
    recorded_at,
    recorded_by
  ) VALUES (
    v_caller_org_id,
    v_request_owner_org_id,
    'return',
    v_now,
    v_now,
    v_user_id
  )
  RETURNING id INTO v_transfer_event_id;

  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(p_items)
    ORDER BY (value ->> 'sub_batch_id')::UUID
  LOOP
    v_source_id := (v_item ->> 'sub_batch_id')::UUID;

    SELECT bag.batch_id, batch.organisation_id, weight.current_weight
      INTO v_batch_id, v_owner_org_id, v_current_weight
    FROM public.sub_batches bag
    INNER JOIN public.batches batch ON batch.id = bag.batch_id
    INNER JOIN public.sub_batch_current_weight weight ON weight.id = bag.id
    WHERE bag.id = v_source_id;

    v_return_weight := COALESCE(
      nullif(v_item ->> 'weight_grams', '')::NUMERIC,
      v_current_weight
    );

    v_returned_ids := public.fn_split_sub_batch(
      v_source_id,
      jsonb_build_array(
        jsonb_build_object(
          'weight_grams', v_return_weight,
          'notes', 'Returned from testing'
        )
      )
    );
    v_returned_id := v_returned_ids[1];

    -- A whole return leaves a zero-weight lab source. Close only that source's
    -- storage; a partial source remains held and stored by the lab.
    IF v_return_weight = v_current_weight AND EXISTS (
      SELECT 1
      FROM public.batch_storage storage
      WHERE storage.sub_batch_id = v_source_id
        AND storage.moved_out_at IS NULL
    ) THEN
      PERFORM public.fn_set_sub_batch_storage(
        v_source_id,
        NULL::UUID,
        v_now,
        'Removed from storage: fully returned from testing'
      );
    END IF;

    UPDATE public.sub_batches bag
    SET held_by_org_id = v_owner_org_id,
        container_id = NULL
    WHERE bag.id = v_returned_id;

    INSERT INTO public.seed_transfer_item (
      transfer_event_id,
      sub_batch_id,
      batch_id,
      owner_org_id,
      weight_grams
    ) VALUES (
      v_transfer_event_id,
      v_returned_id,
      v_batch_id,
      v_owner_org_id,
      v_return_weight
    )
    RETURNING id INTO v_transfer_item_id;

    INSERT INTO public.batch_testing_assignment_return_item (
      assignment_id,
      transfer_item_id
    )
    SELECT resolved.assignment_id, v_transfer_item_id
    FROM public.fn_resolve_testing_assignments_for_sub_batch(
      v_source_id
    ) resolved
    ORDER BY resolved.assignment_id;

    transfer_event_id := v_transfer_event_id;
    transfer_item_id := v_transfer_item_id;
    source_sub_batch_id := v_source_id;
    returned_sub_batch_id := v_returned_id;
    returned_weight_grams := v_return_weight;
    RETURN NEXT;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_set_testing_assignment_work_status(p_assignment_id uuid, p_work_status text, p_note text DEFAULT NULL::text)
 RETURNS public.batch_testing_assignment
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_caller_org_id UUID;
  v_caller_role public.org_user_types;
  v_assignment public.batch_testing_assignment;
  v_old_work_status TEXT;
  v_note TEXT := nullif(btrim(p_note), '');
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '28000';
  END IF;

  SELECT member.organisation_id, member.role
    INTO v_caller_org_id, v_caller_role
  FROM public.org_user member
  WHERE member.user_id = v_user_id
    AND member.is_active = true
  ORDER BY member.joined_at, member.organisation_id
  LIMIT 1;

  IF v_caller_org_id IS NULL THEN
    RAISE EXCEPTION 'Active organisation membership required'
      USING ERRCODE = '42501';
  END IF;

  IF v_caller_role IS DISTINCT FROM 'Admin' THEN
    RAISE EXCEPTION 'Testing Admin role required to close or correct work'
      USING ERRCODE = '42501';
  END IF;

  SELECT assignment.*
    INTO v_assignment
  FROM public.batch_testing_assignment assignment
  WHERE assignment.id = p_assignment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Testing assignment not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_assignment.assigned_to_org_id IS DISTINCT FROM v_caller_org_id THEN
    RAISE EXCEPTION 'Only the assigned testing provider may change work status'
      USING ERRCODE = '42501';
  END IF;

  IF p_work_status IS NULL OR p_work_status NOT IN (
    'completed',
    'partially_completed',
    'not_completed'
  ) THEN
    RAISE EXCEPTION 'Invalid testing work status'
      USING ERRCODE = '22023';
  END IF;

  IF p_work_status IN ('partially_completed', 'not_completed')
    AND v_note IS NULL THEN
    RAISE EXCEPTION 'A note is required for partial or not-completed work'
      USING ERRCODE = '22023';
  END IF;

  IF v_assignment.work_status IS NOT DISTINCT FROM p_work_status
    AND v_assignment.work_status_note IS NOT DISTINCT FROM v_note THEN
    RAISE EXCEPTION 'Testing work already has that status and note'
      USING ERRCODE = '22023';
  END IF;

  v_old_work_status := v_assignment.work_status;

  UPDATE public.batch_testing_assignment assignment
  SET work_closed_at = COALESCE(assignment.work_closed_at, v_now),
      work_closed_by = COALESCE(assignment.work_closed_by, v_user_id),
      work_status = p_work_status,
      work_status_note = v_note
  WHERE assignment.id = p_assignment_id
  RETURNING assignment.* INTO v_assignment;

  INSERT INTO public.batch_testing_assignment_status_audit (
    assignment_id,
    old_work_status,
    new_work_status,
    note,
    actor_id,
    recorded_at
  ) VALUES (
    p_assignment_id,
    v_old_work_status,
    p_work_status,
    v_note,
    v_user_id,
    v_now
  );

  RETURN v_assignment;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_linked_testing_provider(p_requesting_org_id uuid, p_provider_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM organisation_link
    WHERE requesting_org_id = p_requesting_org_id
      AND provider_org_id = p_provider_org_id
  );
$function$
;

CREATE OR REPLACE FUNCTION public.reject_testing_assignment_status_audit_rewrite()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RAISE EXCEPTION 'Testing assignment status audit is append-only'
    USING ERRCODE = '55000';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_quality_test_statistics()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.type = 'quality' AND NEW.result IS NOT NULL THEN
    UPDATE tests
    SET statistics = calculate_quality_test_statistics(NEW.id)
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_testing_provider_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.organisation o
    WHERE o.id = NEW.provider_org_id
      AND o.is_testing_provider
  ) THEN
    RAISE EXCEPTION 'Provider organisation must offer testing services'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$
;
