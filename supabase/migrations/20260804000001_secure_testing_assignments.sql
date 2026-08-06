-- Complete and secure testing-organisation assignments.
--
-- NASTI models testing providers as organisations linked to seed-owning
-- organisations. Assignment records could be created, but the surrounding
-- machinery did not hold together: assigning never moved the seed, returning
-- never moved it back, completion never happened, and several paths bypassed
-- the validation entirely.
--
-- This lands as one migration because it has no useful intermediate state. Each
-- part below closes a hole the others leave open — RPCs without the policy
-- changes still allow direct table writes. Applied as one transaction, the fix
-- is all-or-nothing.
--
-- Sections:
--
--   0. Reshaping the assignment table around the bag.
--   1. Atomic assignment and return RPCs.
--   2. Batch, related-data and custody access rules.
--   3. fn_create_quality_test: completing the assignment with the first test.
--
-- A further section originally secured fn_treat_batch. Treating is no longer a
-- supported workflow — Testing organisations only test — so the function is
-- gone entirely; see 20251016000005 and 20260728000001.
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
-- 0. THE UNIT OF ASSIGNMENT IS A BAG
-- ############################################################################

-- batch_testing_assignment was created in 20251114000005 with a batch key,
-- before sub_batches existed. Everything physical about seed now hangs off a
-- bag — storage, tests, weight adjustments, splitting, merging — so a
-- batch-keyed assignment either exposes every sibling bag to the Testing
-- organisation or lets a whole-batch operation consume more seed than was
-- actually sent.
--
-- These statements live here rather than in the creating migration because
-- each needs something that migration cannot see: sub_batches does not exist
-- until 20260723000001, and the RLS policies written in between address the
-- close timestamp by its original name, which a rename would break at
-- CREATE POLICY time.

-- ============================================================================
-- An assignment ends one of two ways
-- ============================================================================
-- A bag that comes back is 'returned'. A bag entirely consumed in testing is
-- 'consumed' and is not returnable, because there is nothing left to return.
-- One timestamp covers both, so "active" is a single, unambiguous predicate.
ALTER TABLE public.batch_testing_assignment
  RENAME COLUMN returned_at TO closed_at;

ALTER INDEX public.idx_batch_testing_assignment_returned_at
  RENAME TO idx_batch_testing_assignment_closed_at;

COMMENT ON COLUMN public.batch_testing_assignment.closed_at IS
  'When the assignment ended, however it ended. Active means closed_at IS NULL.';

ALTER TABLE public.batch_testing_assignment
  ADD CONSTRAINT batch_testing_assignment_outcome_matches_closed
  CHECK ((closed_at IS NULL) = (outcome IS NULL));

-- ============================================================================
-- The bag key
-- ============================================================================
-- batch_id stays as a denormalised parent lookup key for joins and history.
-- The composite foreign key guarantees the two columns describe the same batch
-- without a policy-time join through sub_batches, following the pattern
-- batch_storage uses in 20260723000001_sub_batches_and_cleaning.sql.
ALTER TABLE public.batch_testing_assignment
  ADD COLUMN sub_batch_id uuid NOT NULL;

ALTER TABLE public.batch_testing_assignment
  ADD CONSTRAINT batch_testing_assignment_sub_batch_matches_batch_fkey
  FOREIGN KEY (sub_batch_id, batch_id)
  REFERENCES public.sub_batches (id, batch_id)
  ON DELETE CASCADE;

CREATE INDEX idx_batch_testing_assignment_sub_batch_id
  ON public.batch_testing_assignment (sub_batch_id);

COMMENT ON COLUMN public.batch_testing_assignment.sub_batch_id IS
  'The bag that was sent. This, not batch_id, is the physical unit of an assignment.';

-- One bag cannot be in two places at once, but several bags of one parent
-- batch can be out at different laboratories simultaneously — which the
-- batch-grained index this replaces made impossible.
CREATE UNIQUE INDEX batch_testing_assignment_one_active_per_bag
  ON public.batch_testing_assignment (sub_batch_id)
  WHERE closed_at IS NULL;

COMMENT ON INDEX public.batch_testing_assignment_one_active_per_bag IS
  'A bag may be assigned to at most one Testing organisation at a time. "Active" means closed_at IS NULL.';


-- ############################################################################
-- 1. ASSIGNMENT AND RETURN
-- ############################################################################

-- Assignment used to be a plain INSERT from an edge function: the function
-- checked the organisation link in application code, then wrote assignment
-- rows. Nothing tied that check to the write, nothing stopped a second active
-- assignment, and nothing moved the seed — so the Testing organisation was
-- expected to test material it had, on paper, never received.
--
-- Both transitions are single database functions here. They validate
-- everything before the first write, lock the rows they depend on, and leave
-- assignment and custody consistent or leave nothing at all. The permissive
-- client mutation policies are dropped at the end: these functions are the only
-- way to move an assignment through its states.
--
-- Custody is a property of the bag: sub_batches.held_by_org_id is the single
-- answer to "who holds this", and neither function writes a batch_custody row.
-- With treating and whole-batch assignment gone, every remaining write to that
-- table just restates batches.organisation_id.

-- ============================================================================
-- Assignment
-- ============================================================================
-- Each element of p_bags describes one bag to send:
--
--   {
--     "sub_batch_id":       "<bag uuid>",
--     "sample_weight_grams": 25,               -- optional
--     "container_id":       "<container uuid>" -- optional, the mailing container
--   }
--
-- With a sample weight the function splits that weight off the named bag and
-- assigns the child; without one it assigns the named bag itself. A sample is
-- not a distinct kind of thing any more — it is just a smaller bag — so the
-- split goes through fn_split_sub_batch rather than repeating weight
-- arithmetic that would then have to be kept in step with it.
CREATE OR REPLACE FUNCTION public.fn_assign_bags_for_testing(
  p_testing_org_id uuid,
  p_bags jsonb
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
    RAISE EXCEPTION 'Bags may only be assigned to a Testing organisation'
      USING ERRCODE = '42501';
  END IF;

  -- A row in organisation_link is an accepted link; requests live in their own
  -- table until they are accepted. Matching on general_org_id is also what
  -- proves the caller is the General side of the relationship.
  IF NOT EXISTS (
    SELECT 1
    FROM public.organisation_link ol
    WHERE ol.general_org_id = v_caller_org_id
      AND ol.testing_org_id = p_testing_org_id
  ) THEN
    RAISE EXCEPTION 'Your organisation is not linked to that Testing organisation'
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

    SELECT sb.batch_id, sb.held_by_org_id
      INTO v_batch_id, v_holder_org_id
    FROM public.sub_batches sb
    WHERE sb.id = v_bag_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Bag % not found', v_bag_id
        USING ERRCODE = 'P0002';
    END IF;

    -- Holding the bag, not owning the parent batch, is what entitles an
    -- organisation to send it: a bag already out at a laboratory is not the
    -- owner's to forward.
    IF v_holder_org_id IS DISTINCT FROM v_caller_org_id THEN
      RAISE EXCEPTION 'Bag % is not held by your organisation', v_bag_id
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

    IF EXISTS (
      SELECT 1
      FROM public.batch_testing_assignment bta
      WHERE bta.sub_batch_id = v_bag_id
        AND bta.closed_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Bag % already has an active testing assignment', v_bag_id
        USING ERRCODE = '55000';
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
    SET held_by_org_id = p_testing_org_id
    WHERE id = v_assigned_bag_id;

    INSERT INTO public.batch_testing_assignment (
      batch_id,
      sub_batch_id,
      assigned_to_org_id,
      assigned_by_org_id,
      assigned_at
    ) VALUES (
      v_batch_id,
      v_assigned_bag_id,
      p_testing_org_id,
      v_caller_org_id,
      v_now
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
$$;

COMMENT ON FUNCTION public.fn_assign_bags_for_testing(uuid, jsonb) IS
  'Sends one or more held bags to a linked Testing organisation, splitting a sample off first where a sample weight is given. Moves each assigned bag out of storage and into the Testing organisation''s hands. All or nothing.';

REVOKE ALL PRIVILEGES ON FUNCTION public.fn_assign_bags_for_testing(uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_assign_bags_for_testing(uuid, jsonb)
  TO authenticated;

-- ============================================================================
-- Return
-- ============================================================================
-- The subsample parameters this function used to take are gone. A Testing
-- organisation that wants to keep part of what it was sent performs an
-- ordinary fn_split_sub_batch beforehand: the retained bag is then held by
-- Testing, has no assignment of its own, and is invisible to the sender —
-- which is what "retained" was always supposed to mean.
CREATE OR REPLACE FUNCTION public.fn_return_bag_from_testing(
  p_assignment_id uuid
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
$$;

COMMENT ON FUNCTION public.fn_return_bag_from_testing(uuid) IS
  'Closes an active testing assignment as returned and puts the bag back in the parent batch owner''s hands. A consumed assignment cannot be returned.';

REVOKE ALL PRIVILEGES ON FUNCTION public.fn_return_bag_from_testing(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_return_bag_from_testing(uuid)
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

-- Access follows ownership and who is holding the seed, and nothing else.
--
-- The rule replaced here granted batch SELECT to anyone who appeared anywhere
-- in the custody history, and to anyone named on any assignment row whether or
-- not it had been returned. Both are permanent grants: once a Testing
-- organisation had held a batch, it could read it forever, and returning the
-- assignment took nothing away.
--
-- The replacement has two explicit cases and no others:
--
--   owner  — batches.organisation_id, which no assignment ever changes, so a
--            General organisation always sees its own seed;
--   holder — an organisation holding at least one bag of the batch right now.
--
-- Holding rather than "named on an assignment" is what makes access end when
-- the bag goes home, and what stops the batch-grained predicate this replaces
-- from handing a Testing organisation the siblings it was never sent.

-- ============================================================================
-- Access predicates
-- ============================================================================
-- These are SECURITY DEFINER for the same reason is_current_custodian is: a
-- policy predicate needs to see the unfiltered assignment and ownership rows to
-- answer correctly, and reading them as the caller would re-enter RLS.
--
-- is_current_bag_custodian, can_read_sub_batch and holds_any_bag_of_batch are
-- defined alongside is_current_custodian in 20260723000005.

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
      OR public.holds_any_bag_of_batch(p_batch_id)
$$;

COMMENT ON FUNCTION public.can_read_batch(uuid) IS
  'Batch read boundary: the owning organisation, or one holding at least one of its bags. This is parent metadata only — bag visibility is can_read_sub_batch.';

REVOKE ALL PRIVILEGES ON FUNCTION public.is_batch_owner(uuid) FROM PUBLIC, anon;
REVOKE ALL PRIVILEGES ON FUNCTION public.can_read_batch(uuid) FROM PUBLIC, anon;
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
--
-- sub_batches policies are not restated here. Bag visibility is bag-grained
-- and belongs with the other bag policies in 20260723000005; the
-- can_read_batch(batch_id) rule that used to sit here is precisely the sibling
-- leak this plan removes.

-- ============================================================================
-- collection and species
-- ============================================================================
-- A Testing organisation needs the collection and its species to make sense of
-- what it is testing, and loses both once it is holding none of the batch.
DROP POLICY IF EXISTS collection_select ON public.collection;

CREATE POLICY collection_select ON public.collection
  FOR SELECT TO authenticated
  USING (
    organisation_id = (SELECT public.get_user_organisation_id())
    OR EXISTS (
      SELECT 1
      FROM public.batches b
      WHERE b.collection_id = collection.id
        AND public.holds_any_bag_of_batch(b.id)
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
        AND public.holds_any_bag_of_batch(b.id)
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
-- A test is a fact about one bag, so it is visible to whoever can see that bag
-- — which covers the owner watching results come in from a laboratory — plus
-- the organisation that performed it, which keeps its own record after the bag
-- has gone home.
DROP POLICY IF EXISTS tests_select ON public.tests;

CREATE POLICY tests_select ON public.tests
  FOR SELECT TO authenticated
  USING (
    public.can_read_sub_batch(sub_batch_id)
    OR (
      performed_by_organisation_id IS NOT NULL
      AND performed_by_organisation_id = (SELECT public.get_user_organisation_id())
    )
  );

-- ============================================================================
-- containers
-- ============================================================================
-- Seed arrives in something, and the receiving organisation has to be able to
-- name it. Widening the catalogue to one container at a time keeps that from
-- exposing the rest of the sender's containers — and, unlike storage_locations,
-- a container is a physical object that genuinely changed hands.
DROP POLICY IF EXISTS containers_select ON public.containers;

CREATE POLICY containers_select ON public.containers
  FOR SELECT TO authenticated
  USING (
    organisation_id = (SELECT public.get_user_organisation_id())
    OR EXISTS (
      SELECT 1
      FROM public.sub_batches sb
      WHERE sb.container_id = containers.id
        AND public.can_read_sub_batch(sb.id)
    )
  );

-- storage_locations is deliberately left alone. A Testing organisation never
-- sees where the sender shelves anything, and an assigned bag has no storage
-- row at all while it is in transit.


-- ############################################################################
-- 3. QUALITY TEST COMPLETION
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
--
-- The parameter signature is unchanged, but three things about the body are
-- not. Authorisation is now bag custody alone, which covers both testers and
-- refuses the sibling bags the batch-wide check used to allow. The consumed
-- weight is checked against what the bag actually holds, where before a 60 g
-- test against a 50 g bag simply drove it to −10 g. And completion lands on
-- the assignment for this bag rather than on every assignment sharing the
-- parent batch.

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
$$;

COMMENT ON FUNCTION public.fn_create_quality_test(uuid, uuid, jsonb, uuid) IS
  'Records a quality test against one bag, deducts the seed it consumed, completes that bag''s testing assignment, and closes it as consumed if nothing is left — all in one transaction.';

REVOKE ALL PRIVILEGES
  ON FUNCTION public.fn_create_quality_test(uuid, uuid, jsonb, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE
  ON FUNCTION public.fn_create_quality_test(uuid, uuid, jsonb, uuid)
  TO authenticated;
