-- Complete and secure testing-organisation assignments.
--
-- NASTI models testing providers as organisations linked to seed-owning
-- organisations. Assignment records could be created, but the surrounding
-- machinery did not hold together: a full-batch assignment never transferred
-- custody, returning one never transferred it back, completion never happened,
-- and several paths bypassed the validation entirely.
--
-- This lands as one migration because it has no useful intermediate state. Each
-- part below closes a hole the others leave open — RPCs without the policy
-- changes still allow direct table writes; hardened policies without the
-- secured fn_treat_batch still let anon consume a batch by UUID. Applied as one
-- transaction, the fix is all-or-nothing.
--
-- Sections:
--
--   1. Atomic assignment and return RPCs, and the one-active-assignment index.
--   2. Batch, related-data and custody access rules.
--   3. fn_treat_batch: authorisation, custody, and assignment propagation.
--   4. fn_create_quality_test: completing the assignment with the first test.
--
-- Exception codes are a contract with the edge wrappers and are used
-- consistently throughout:
--
--   28000  authentication required          → 401
--   42501  not authorised                   → 403
--   P0002  referenced row not found         → 404
--   55000  state conflict                   → 409
--   22023  invalid request parameter        → 400


-- ############################################################################
-- 1. ASSIGNMENT AND RETURN
-- ############################################################################

-- Assignment used to be a plain INSERT from an edge function: the function
-- checked the organisation link in application code, then wrote assignment
-- rows. Nothing tied that check to the write, nothing stopped a second active
-- assignment for the same batch, and a full-batch assignment never moved
-- custody at all — so the Testing organisation was expected to process seed it
-- had, on paper, never received.
--
-- Both transitions become single database functions here. They validate
-- everything before the first write, lock the rows they depend on, and leave
-- assignment and custody consistent or leave nothing at all. The permissive
-- client mutation policies are dropped at the end: these functions are the only
-- way to move an assignment through its states.

-- ============================================================================
-- At most one active assignment per batch
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS batch_testing_assignment_one_active_per_batch
  ON public.batch_testing_assignment (batch_id)
  WHERE returned_at IS NULL;

COMMENT ON INDEX public.batch_testing_assignment_one_active_per_batch IS
  'A batch may be assigned to at most one Testing organisation at a time. "Active" means returned_at IS NULL.';

-- ============================================================================
-- Assignment
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_assign_batches_for_testing(
  p_testing_org_id uuid,
  p_assignments jsonb
)
RETURNS SETOF public.batch_testing_assignment
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_caller_org_id uuid;
  v_caller_role public.org_user_types;
  v_can_test boolean;
  v_can_process boolean;
  v_has_sample boolean := false;
  v_has_full boolean := false;
  v_batch_ids uuid[] := '{}'::uuid[];
  v_item jsonb;
  v_batch_id uuid;
  v_type text;
  v_sample_weight numeric;
  v_batch_weight numeric;
  v_custodian_org_id uuid;
  v_now timestamptz := now();
  -- current_batch_custody picks the newest row by received_at alone, so two
  -- custody rows written in one transaction with now() would tie and leave the
  -- current custodian ambiguous. clock_timestamp() advances within the
  -- transaction and keeps the history strictly ordered.
  v_received_at timestamptz := clock_timestamp();
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
    RAISE EXCEPTION 'Admin role required to assign batches for testing'
      USING ERRCODE = '42501';
  END IF;

  -- --------------------------------------------------------------------
  -- Request shape
  -- --------------------------------------------------------------------
  IF jsonb_typeof(p_assignments) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_assignments) = 0 THEN
    RAISE EXCEPTION 'At least one batch assignment is required'
      USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT jsonb_array_elements(p_assignments) LOOP
    v_batch_id := nullif(v_item ->> 'batch_id', '')::uuid;
    v_type := v_item ->> 'assignment_type';

    IF v_batch_id IS NULL THEN
      RAISE EXCEPTION 'Every assignment requires a batch_id'
        USING ERRCODE = '22023';
    END IF;

    IF v_type IS DISTINCT FROM 'sample' AND v_type IS DISTINCT FROM 'full_batch' THEN
      RAISE EXCEPTION 'assignment_type must be either sample or full_batch'
        USING ERRCODE = '22023';
    END IF;

    IF v_batch_id = ANY (v_batch_ids) THEN
      RAISE EXCEPTION 'A batch may appear only once in an assignment request'
        USING ERRCODE = '22023';
    END IF;

    IF v_type = 'sample' THEN
      v_sample_weight := nullif(v_item ->> 'sample_weight_grams', '')::numeric;

      IF v_sample_weight IS NULL OR v_sample_weight <= 0 THEN
        RAISE EXCEPTION 'A sample assignment requires a positive sample_weight_grams'
          USING ERRCODE = '22023';
      END IF;

      v_has_sample := true;
    ELSE
      v_has_full := true;
    END IF;

    v_batch_ids := v_batch_ids || v_batch_id;
  END LOOP;

  -- --------------------------------------------------------------------
  -- The link decides which assignment types are permitted at all
  -- --------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM public.organisation o WHERE o.id = p_testing_org_id
  ) THEN
    RAISE EXCEPTION 'Testing organisation not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organisation o
    WHERE o.id = p_testing_org_id
      AND o.type = 'Testing'
  ) THEN
    RAISE EXCEPTION 'Batches may only be assigned to a Testing organisation'
      USING ERRCODE = '42501';
  END IF;

  SELECT ol.can_test, ol.can_process
    INTO v_can_test, v_can_process
  FROM public.organisation_link ol
  WHERE ol.general_org_id = v_caller_org_id
    AND ol.testing_org_id = p_testing_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Your organisation is not linked to that Testing organisation'
      USING ERRCODE = '42501';
  END IF;

  IF v_has_sample AND NOT v_can_test THEN
    RAISE EXCEPTION 'The link with that Testing organisation does not permit sample testing'
      USING ERRCODE = '42501';
  END IF;

  IF v_has_full AND NOT v_can_process THEN
    RAISE EXCEPTION 'The link with that Testing organisation does not permit full batch processing'
      USING ERRCODE = '42501';
  END IF;

  -- --------------------------------------------------------------------
  -- Lock before checking. Ordering by id keeps two concurrent multi-batch
  -- requests from deadlocking against each other.
  -- --------------------------------------------------------------------
  PERFORM 1
  FROM public.batches b
  WHERE b.id = ANY (v_batch_ids)
  ORDER BY b.id
  FOR UPDATE;

  PERFORM 1
  FROM public.batch_testing_assignment bta
  WHERE bta.batch_id = ANY (v_batch_ids)
    AND bta.returned_at IS NULL
  ORDER BY bta.batch_id
  FOR UPDATE;

  FOR v_item IN SELECT jsonb_array_elements(p_assignments) LOOP
    v_batch_id := (v_item ->> 'batch_id')::uuid;
    v_type := v_item ->> 'assignment_type';

    IF NOT EXISTS (
      SELECT 1 FROM public.batches b WHERE b.id = v_batch_id
    ) THEN
      RAISE EXCEPTION 'Batch % not found', v_batch_id
        USING ERRCODE = 'P0002';
    END IF;

    SELECT b.weight_grams
      INTO v_batch_weight
    FROM public.batches b
    WHERE b.id = v_batch_id
      AND b.organisation_id = v_caller_org_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Batch % is not owned by your organisation', v_batch_id
        USING ERRCODE = '42501';
    END IF;

    SELECT bc.organisation_id
      INTO v_custodian_org_id
    FROM public.batch_custody bc
    WHERE bc.batch_id = v_batch_id
    ORDER BY bc.received_at DESC, bc.id DESC
    LIMIT 1;

    IF v_custodian_org_id IS DISTINCT FROM v_caller_org_id THEN
      RAISE EXCEPTION 'Batch % is not in your organisation''s custody', v_batch_id
        USING ERRCODE = '42501';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.batch_testing_assignment bta
      WHERE bta.batch_id = v_batch_id
        AND bta.returned_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Batch % already has an active testing assignment', v_batch_id
        USING ERRCODE = '55000';
    END IF;

    IF v_type = 'sample' THEN
      v_sample_weight := (v_item ->> 'sample_weight_grams')::numeric;

      IF v_batch_weight IS NULL THEN
        RAISE EXCEPTION 'Batch % has no recorded weight to take a sample from', v_batch_id
          USING ERRCODE = '22023';
      END IF;

      IF v_sample_weight >= v_batch_weight THEN
        RAISE EXCEPTION 'Sample weight must be less than the current batch weight'
          USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;

  -- --------------------------------------------------------------------
  -- Writes. The custody CTE is data-modifying, so it runs to completion
  -- whether or not the outer query reads from it.
  -- --------------------------------------------------------------------
  RETURN QUERY
  WITH requested AS (
    SELECT
      (e ->> 'batch_id')::uuid AS batch_id,
      e ->> 'assignment_type' AS assignment_type,
      CASE
        WHEN e ->> 'assignment_type' = 'sample'
          THEN round((e ->> 'sample_weight_grams')::numeric)::integer
      END AS sample_weight_grams
    FROM jsonb_array_elements(p_assignments) AS e
  ),
  inserted AS (
    INSERT INTO public.batch_testing_assignment (
      batch_id,
      assigned_to_org_id,
      assigned_by_org_id,
      assignment_type,
      sample_weight_grams,
      assigned_at
    )
    SELECT
      r.batch_id,
      p_testing_org_id,
      v_caller_org_id,
      r.assignment_type,
      r.sample_weight_grams,
      v_now
    FROM requested r
    RETURNING *
  ),
  transferred AS (
    -- A sample stays with the owner; only a full batch changes hands.
    INSERT INTO public.batch_custody (
      batch_id,
      organisation_id,
      previous_organisation_id,
      transferred_by,
      received_at,
      notes
    )
    SELECT
      r.batch_id,
      p_testing_org_id,
      v_caller_org_id,
      v_user_id,
      v_received_at,
      'Custody transferred for testing'
    FROM requested r
    WHERE r.assignment_type = 'full_batch'
    RETURNING 1
  )
  SELECT * FROM inserted ORDER BY batch_id;
END;
$$;

COMMENT ON FUNCTION public.fn_assign_batches_for_testing(uuid, jsonb) IS
  'Assigns one or more owned batches to a linked Testing organisation. Full-batch assignments transfer custody; samples do not. All or nothing.';

REVOKE ALL PRIVILEGES ON FUNCTION public.fn_assign_batches_for_testing(uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_assign_batches_for_testing(uuid, jsonb)
  TO authenticated;

-- ============================================================================
-- Return
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_return_batch_from_testing(
  p_assignment_id uuid,
  p_subsample_weight_grams numeric DEFAULT NULL,
  p_subsample_storage_location_id uuid DEFAULT NULL
)
RETURNS public.batch_testing_assignment
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_caller_org_id uuid;
  v_caller_role public.org_user_types;
  v_assignment public.batch_testing_assignment;
  v_custodian_org_id uuid;
  v_now timestamptz := now();
  -- See fn_assign_batches_for_testing: custody history must not tie on
  -- received_at, so it advances with the clock rather than the transaction.
  v_received_at timestamptz := clock_timestamp();
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
    RAISE EXCEPTION 'Admin role required to return a batch from testing'
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

  IF v_assignment.returned_at IS NOT NULL THEN
    RAISE EXCEPTION 'That assignment has already been returned'
      USING ERRCODE = '55000';
  END IF;

  -- --------------------------------------------------------------------
  -- Retained QA subsample metadata: both fields or neither
  -- --------------------------------------------------------------------
  IF (p_subsample_weight_grams IS NULL) <> (p_subsample_storage_location_id IS NULL) THEN
    RAISE EXCEPTION 'A retained subsample needs both a weight and a storage location'
      USING ERRCODE = '22023';
  END IF;

  IF p_subsample_weight_grams IS NOT NULL THEN
    IF p_subsample_weight_grams <= 0 THEN
      RAISE EXCEPTION 'Retained subsample weight must be greater than zero'
        USING ERRCODE = '22023';
    END IF;

    IF v_assignment.assignment_type = 'sample'
       AND p_subsample_weight_grams > v_assignment.sample_weight_grams THEN
      RAISE EXCEPTION 'Retained subsample cannot be heavier than the sample that was sent'
        USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.storage_locations sl
      WHERE sl.id = p_subsample_storage_location_id
        AND sl.organisation_id = v_caller_org_id
        AND sl.active = true
    ) THEN
      RAISE EXCEPTION 'Retained subsample must be stored in an active location of your organisation'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- --------------------------------------------------------------------
  -- Custody goes back only for a full batch; a sample never left.
  -- --------------------------------------------------------------------
  IF v_assignment.assignment_type = 'full_batch' THEN
    PERFORM 1
    FROM public.batches b
    WHERE b.id = v_assignment.batch_id
    FOR UPDATE;

    SELECT bc.organisation_id
      INTO v_custodian_org_id
    FROM public.batch_custody bc
    WHERE bc.batch_id = v_assignment.batch_id
    ORDER BY bc.received_at DESC, bc.id DESC
    LIMIT 1;

    IF v_custodian_org_id IS DISTINCT FROM v_caller_org_id THEN
      RAISE EXCEPTION 'That batch is no longer in your organisation''s custody'
        USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.batch_custody (
      batch_id,
      organisation_id,
      previous_organisation_id,
      transferred_by,
      received_at,
      notes
    )
    VALUES (
      v_assignment.batch_id,
      v_assignment.assigned_by_org_id,
      v_caller_org_id,
      v_user_id,
      v_received_at,
      'Custody returned from testing'
    );
  END IF;

  -- Returning an untested assignment still closes it out.
  UPDATE public.batch_testing_assignment bta
  SET returned_at = v_now,
      completed_at = COALESCE(bta.completed_at, v_now),
      subsample_weight_grams = COALESCE(
        round(p_subsample_weight_grams)::integer,
        bta.subsample_weight_grams
      ),
      subsample_storage_location_id = COALESCE(
        p_subsample_storage_location_id,
        bta.subsample_storage_location_id
      )
  WHERE bta.id = p_assignment_id
  RETURNING * INTO v_assignment;

  RETURN v_assignment;
END;
$$;

COMMENT ON FUNCTION public.fn_return_batch_from_testing(uuid, numeric, uuid) IS
  'Closes an active testing assignment, returning custody to the assigning organisation for a full batch and recording optional retained-subsample metadata.';

REVOKE ALL PRIVILEGES ON FUNCTION public.fn_return_batch_from_testing(uuid, numeric, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_return_batch_from_testing(uuid, numeric, uuid)
  TO authenticated;

-- ============================================================================
-- The RPCs are the only mutation boundary
-- ============================================================================
-- SELECT is deliberately left in place: both sides of an assignment, including
-- returned ones, keep reading their own history.
DROP POLICY IF EXISTS batch_testing_assignment_insert ON public.batch_testing_assignment;
DROP POLICY IF EXISTS batch_testing_assignment_update ON public.batch_testing_assignment;
DROP POLICY IF EXISTS batch_testing_assignment_delete ON public.batch_testing_assignment;


-- ############################################################################
-- 2. ACCESS RULES
-- ############################################################################

-- Batch access follows ownership, current custody and active assignments.
--
-- The rule replaced here granted batch SELECT to anyone who appeared anywhere
-- in the custody history, and to anyone named on any assignment row whether or
-- not it had been returned. Both are permanent grants: once a Testing
-- organisation had held a batch, it could read it forever, and returning the
-- assignment took nothing away.
--
-- The replacement has three explicit cases and no others:
--
--   owner            — batches.organisation_id, which temporary custody never
--                      changes, so a General organisation always sees its seed;
--   current custody  — whoever physically holds the batch right now;
--   active assignment — a Testing organisation while returned_at IS NULL.
--
-- Custody history stays append-only: the workflow RPCs add rows, and nothing
-- rewrites or removes them.

-- ============================================================================
-- Access predicates
-- ============================================================================
-- These are SECURITY DEFINER for the same reason is_current_custodian is: a
-- policy predicate needs to see the unfiltered assignment and ownership rows to
-- answer correctly, and reading them as the caller would re-enter RLS.

CREATE OR REPLACE FUNCTION public.has_active_testing_assignment(p_batch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.batch_testing_assignment bta
    INNER JOIN public.org_user ou
      ON ou.organisation_id = bta.assigned_to_org_id
    WHERE bta.batch_id = p_batch_id
      AND bta.returned_at IS NULL
      AND ou.user_id = (SELECT auth.uid())
      AND ou.is_active = true
  )
$$;

COMMENT ON FUNCTION public.has_active_testing_assignment(uuid) IS
  'True when the caller belongs to a Testing organisation currently holding an unreturned assignment for the batch.';

CREATE OR REPLACE FUNCTION public.is_batch_owner(p_batch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.batches b
    INNER JOIN public.org_user ou
      ON ou.organisation_id = b.organisation_id
    WHERE b.id = p_batch_id
      AND ou.user_id = (SELECT auth.uid())
      AND ou.is_active = true
  )
$$;

COMMENT ON FUNCTION public.is_batch_owner(uuid) IS
  'True when the caller belongs to the organisation that owns the batch. Ownership is unaffected by temporary custody.';

CREATE OR REPLACE FUNCTION public.can_read_batch(p_batch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT public.is_batch_owner(p_batch_id)
      OR public.is_current_custodian((SELECT auth.uid()), p_batch_id)
      OR public.has_active_testing_assignment(p_batch_id)
$$;

COMMENT ON FUNCTION public.can_read_batch(uuid) IS
  'Batch read boundary: owner, current custodian, or active testing assignment. Past custody and returned assignments grant nothing.';

REVOKE ALL PRIVILEGES ON FUNCTION public.has_active_testing_assignment(uuid) FROM PUBLIC, anon;
REVOKE ALL PRIVILEGES ON FUNCTION public.is_batch_owner(uuid) FROM PUBLIC, anon;
REVOKE ALL PRIVILEGES ON FUNCTION public.can_read_batch(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_testing_assignment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_batch_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_batch(uuid) TO authenticated;

-- ============================================================================
-- batches
-- ============================================================================
DROP POLICY IF EXISTS batches_select ON public.batches;

CREATE POLICY batches_select ON public.batches
  FOR SELECT TO authenticated
  USING (public.can_read_batch(id));

-- Mutation stays with the current custodian, unchanged.

-- ============================================================================
-- sub_batches
-- ============================================================================
-- A sample assignment has to reach the bags to test them, but must not be able
-- to alter them; only the current custodian writes.
DROP POLICY IF EXISTS sub_batches_select ON public.sub_batches;

CREATE POLICY sub_batches_select ON public.sub_batches
  FOR SELECT TO authenticated
  USING (public.can_read_batch(batch_id));

-- ============================================================================
-- collection and species
-- ============================================================================
-- A Testing organisation needs the collection and its species to make sense of
-- what it is testing, and loses both when the assignment is returned.
DROP POLICY IF EXISTS collection_select ON public.collection;

CREATE POLICY collection_select ON public.collection
  FOR SELECT TO authenticated
  USING (
    organisation_id = (SELECT public.get_user_organisation_id())
    OR EXISTS (
      SELECT 1
      FROM public.batches b
      WHERE b.collection_id = collection.id
        AND public.has_active_testing_assignment(b.id)
    )
  );

DROP POLICY IF EXISTS species_select ON public.species;

CREATE POLICY species_select ON public.species
  FOR SELECT TO authenticated
  USING (
    organisation_id = (SELECT public.get_user_organisation_id())
    OR EXISTS (
      SELECT 1
      FROM public.collection c
      INNER JOIN public.batches b ON b.collection_id = c.id
      WHERE c.species_id = species.id
        AND public.has_active_testing_assignment(b.id)
    )
  );

-- ============================================================================
-- batch_custody
-- ============================================================================
-- History is readable by the owner and the current custodian, and append-only
-- for everybody: the workflow RPCs are the only writers.
DROP POLICY IF EXISTS batch_custody_select ON public.batch_custody;
DROP POLICY IF EXISTS batch_custody_update ON public.batch_custody;
DROP POLICY IF EXISTS batch_custody_delete ON public.batch_custody;

CREATE POLICY batch_custody_select ON public.batch_custody
  FOR SELECT TO authenticated
  USING (
    public.is_batch_owner(batch_id)
    OR public.is_current_custodian((SELECT auth.uid()), batch_id)
  );

-- ============================================================================
-- tests
-- ============================================================================
-- The owner keeps sight of results produced on its seed while a Testing
-- organisation holds it.
DROP POLICY IF EXISTS tests_select ON public.tests;

CREATE POLICY tests_select ON public.tests
  FOR SELECT TO authenticated
  USING (
    public.is_batch_owner(batch_id)
    OR public.is_current_custodian((SELECT auth.uid()), batch_id)
    OR (
      performed_by_organisation_id IS NOT NULL
      AND performed_by_organisation_id = (SELECT public.get_user_organisation_id())
    )
  );


-- ############################################################################
-- 3. TREATMENT
-- ############################################################################

-- Secure fn_treat_batch and make treatment carry the assignment forward.
--
-- The numeric-signature fn_treat_batch introduced in 20260728000001 is
-- SECURITY DEFINER, and the migration granted EXECUTE to authenticated without
-- revoking the default PUBLIC grant that every new function receives. The
-- effective result on the local database is that anon can execute it. It also
-- never looked at auth.uid(): anyone holding a batch UUID could consume that
-- batch and mint a successor, entirely outside RLS.
--
-- Two further defects are fixed here:
--
--   * output custody was given to batches.organisation_id, the owner. When a
--     Testing organisation treated a batch it was holding, the successor
--     appeared in the owner's custody and vanished from the hands actually
--     holding the seed.
--   * an active assignment was COPIED to the output while the input's
--     assignment stayed open, leaving two active assignments for one physical
--     lot of seed. The assignment now moves.
--
-- The parameter signature is unchanged so that the web client and generated
-- types keep working.

CREATE OR REPLACE FUNCTION public.fn_treat_batch(
  p_input_batch_id UUID,
  p_output_weight NUMERIC,
  p_treat JSONB,
  p_quality_assessment public.batch_quality,
  p_origin_batch_weight NUMERIC DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_caller_org_id UUID;
  v_output_batch_id UUID;
  v_collection_id UUID;
  v_batch_code TEXT;
  v_collection_code TEXT;
  v_increment INTEGER;
  v_organisation_id UUID;
  v_input_weight NUMERIC;
  v_custodian_org_id UUID;
  v_assignment public.batch_testing_assignment;
  v_sub_batch RECORD;
  v_received_at timestamptz := clock_timestamp();
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

  -- ----------------------------------------------------------------
  -- Lock the input batch and its assignment before deciding anything
  -- ----------------------------------------------------------------
  SELECT b.collection_id, b.organisation_id, b.weight_grams
    INTO v_collection_id, v_organisation_id, v_input_weight
  FROM public.batches b
  WHERE b.id = p_input_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Input batch not found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_assignment
  FROM public.batch_testing_assignment bta
  WHERE bta.batch_id = p_input_batch_id
    AND bta.returned_at IS NULL
  FOR UPDATE;

  -- A sample is seed on loan for testing, not custody of the batch.
  IF FOUND
     AND v_assignment.assignment_type = 'sample'
     AND v_assignment.assigned_to_org_id = v_caller_org_id THEN
    RAISE EXCEPTION 'A sample assignment does not permit treating the batch'
      USING ERRCODE = '42501';
  END IF;

  SELECT bc.organisation_id
    INTO v_custodian_org_id
  FROM public.batch_custody bc
  WHERE bc.batch_id = p_input_batch_id
  ORDER BY bc.received_at DESC, bc.id DESC
  LIMIT 1;

  IF v_custodian_org_id IS DISTINCT FROM v_caller_org_id THEN
    RAISE EXCEPTION 'Only the current custodian may treat this batch'
      USING ERRCODE = '42501';
  END IF;

  -- ----------------------------------------------------------------
  -- Validate the request
  -- ----------------------------------------------------------------
  IF v_collection_id IS NULL THEN
    RAISE EXCEPTION 'Input batch has no collection'
      USING ERRCODE = 'P0002';
  END IF;

  IF p_output_weight IS NULL OR p_output_weight <= 0 THEN
    RAISE EXCEPTION 'Output weight must be greater than zero'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_treat) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_treat) = 0 THEN
    RAISE EXCEPTION 'At least one treatment must be recorded'
      USING ERRCODE = '22023';
  END IF;

  -- A batch with no recorded weight is an origin batch: the caller states the
  -- weight now, and it becomes the input weight.
  IF v_input_weight IS NULL THEN
    IF p_origin_batch_weight IS NULL THEN
      RAISE EXCEPTION 'origin_batch_weight must be provided when treating a batch with NULL weight'
        USING ERRCODE = '22023';
    END IF;

    IF p_origin_batch_weight <= 0 THEN
      RAISE EXCEPTION 'Origin batch weight must be greater than zero'
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.batches
    SET weight_grams = p_origin_batch_weight
    WHERE id = p_input_batch_id;

    v_input_weight := p_origin_batch_weight;
  ELSIF v_input_weight <= 0 THEN
    RAISE EXCEPTION 'Input batch weight must be greater than zero'
      USING ERRCODE = '22023';
  END IF;

  SELECT c.code INTO v_collection_code
  FROM public.collection c
  WHERE c.id = v_collection_id;

  IF v_collection_code IS NULL THEN
    RAISE EXCEPTION 'Collection not found or has no code'
      USING ERRCODE = 'P0002';
  END IF;

  -- ----------------------------------------------------------------
  -- Create the successor
  -- ----------------------------------------------------------------
  SELECT COALESCE(MAX(
    CASE
      WHEN b.code ~ ('^' || v_collection_code || '-' || p_quality_assessment::text || '-[0-9]+$')
      THEN CAST(SUBSTRING(b.code FROM '[0-9]+$') AS INTEGER)
      ELSE 0
    END
  ), 0) + 1
  INTO v_increment
  FROM public.batches b
  WHERE b.collection_id = v_collection_id;

  v_batch_code := v_collection_code || '-' || p_quality_assessment::text || '-' || v_increment::text;

  -- Ownership follows the input batch, never the custodian: a Testing
  -- organisation treating seed on someone else's behalf does not acquire it.
  INSERT INTO public.batches (
    collection_id,
    code,
    weight_grams,
    notes,
    organisation_id
  ) VALUES (
    v_collection_id,
    v_batch_code,
    p_output_weight,
    p_notes,
    v_organisation_id
  )
  RETURNING id INTO v_output_batch_id;

  -- Custody follows the hands the seed is actually in.
  INSERT INTO public.batch_custody (
    batch_id,
    organisation_id,
    previous_organisation_id,
    transferred_by,
    received_at,
    notes
  ) VALUES (
    v_output_batch_id,
    v_custodian_org_id,
    NULL,
    v_user_id,
    v_received_at,
    'Batch created via treating'
  );

  INSERT INTO public.treatments (
    input_batch_id,
    output_batch_id,
    treat,
    quality_assessment,
    notes,
    created_by,
    organisation_id
  ) VALUES (
    p_input_batch_id,
    v_output_batch_id,
    p_treat,
    p_quality_assessment,
    p_notes,
    v_user_id,
    v_organisation_id
  );

  INSERT INTO public.sub_batches (batch_id, weight_grams, notes)
  VALUES (v_output_batch_id, p_output_weight, 'Initial sub-batch from treating');

  -- Consume the input batch's bags.
  FOR v_sub_batch IN
    SELECT sb.id, sb.weight_grams + COALESCE(
      (
        SELECT SUM(wa.weight_grams)
        FROM public.batch_weight_adjustments wa
        WHERE wa.sub_batch_id = sb.id
      ),
      0
    ) AS effective_weight
    FROM public.sub_batches sb
    WHERE sb.batch_id = p_input_batch_id
  LOOP
    IF v_sub_batch.effective_weight > 0 THEN
      INSERT INTO public.batch_weight_adjustments (
        sub_batch_id,
        weight_grams,
        reason,
        created_by
      ) VALUES (
        v_sub_batch.id,
        -v_sub_batch.effective_weight,
        'Batch treated (' || p_treat::text || '). Output weight: ' || p_output_weight || 'g.',
        v_user_id
      );
    END IF;
  END LOOP;

  -- ----------------------------------------------------------------
  -- The assignment follows the seed rather than being duplicated
  -- ----------------------------------------------------------------
  IF v_assignment.id IS NOT NULL
     AND v_assignment.assignment_type = 'full_batch' THEN
    UPDATE public.batch_testing_assignment
    SET batch_id = v_output_batch_id
    WHERE id = v_assignment.id;
  END IF;

  RETURN v_output_batch_id;
END;
$$;

COMMENT ON FUNCTION public.fn_treat_batch(uuid, numeric, jsonb, public.batch_quality, numeric, text) IS
  'Treats a batch held by the caller into a successor batch. Ownership is preserved, custody follows the current custodian, and an active full-batch testing assignment moves to the successor.';

REVOKE ALL PRIVILEGES
  ON FUNCTION public.fn_treat_batch(uuid, numeric, jsonb, public.batch_quality, numeric, text)
  FROM PUBLIC, anon;
GRANT EXECUTE
  ON FUNCTION public.fn_treat_batch(uuid, numeric, jsonb, public.batch_quality, numeric, text)
  TO authenticated;


-- ############################################################################
-- 4. QUALITY TEST COMPLETION
-- ############################################################################

-- Recording the first quality test completes the testing assignment.
--
-- Completion used to be a separate step the client was expected to take, and
-- the client never took it: useCompleteAssignment called an edge function named
-- complete_testing_assignment that was never deployed. Assignments therefore
-- stayed "pending" forever, however many tests were recorded against them.
--
-- Completion belongs with the test that causes it, in the same transaction, so
-- there is no window where a test exists and its assignment has not advanced.
-- Only the active assignment addressed to the organisation doing the testing is
-- touched, and only when it has not already been completed, so repeat and
-- corrected tests leave the state machine alone.
--
-- The parameter signature and the existing authorisation checks are unchanged;
-- search_path is pinned, which the original definition omitted.

CREATE OR REPLACE FUNCTION public.fn_create_quality_test(
  p_batch_id uuid,
  p_sub_batch_id uuid,
  p_result jsonb,
  p_performed_by_organisation_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_test_id UUID;
  v_total_weight NUMERIC := 0;
  v_repeat JSONB;
  v_sub_batch_batch_id UUID;
  v_user_organisation_id UUID;
  v_user_id UUID := (SELECT auth.uid());
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

  IF NOT (
    public.is_current_custodian(v_user_id, p_batch_id)
    OR EXISTS (
      SELECT 1
      FROM public.batch_testing_assignment bta
      WHERE bta.batch_id = p_batch_id
        AND bta.assigned_to_org_id = v_user_organisation_id
        AND bta.returned_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'Not authorised to test this batch'
      USING ERRCODE = '42501';
  END IF;

  -- Calculate total weight consumed from repeats
  FOR v_repeat IN SELECT * FROM jsonb_array_elements(p_result -> 'repeats')
  LOOP
    v_total_weight := v_total_weight + COALESCE((v_repeat ->> 'weight_grams')::NUMERIC, 0);
  END LOOP;

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

  -- The first test completes the assignment; later tests change nothing.
  UPDATE public.batch_testing_assignment bta
  SET completed_at = now()
  WHERE bta.batch_id = p_batch_id
    AND bta.assigned_to_org_id = p_performed_by_organisation_id
    AND bta.returned_at IS NULL
    AND bta.completed_at IS NULL;

  RETURN v_test_id;
END;
$$;

COMMENT ON FUNCTION public.fn_create_quality_test(uuid, uuid, jsonb, uuid) IS
  'Records a quality test, deducts the seed it consumed, and completes the active testing assignment for the performing organisation — all in one transaction.';

REVOKE ALL PRIVILEGES
  ON FUNCTION public.fn_create_quality_test(uuid, uuid, jsonb, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE
  ON FUNCTION public.fn_create_quality_test(uuid, uuid, jsonb, uuid)
  TO authenticated;
