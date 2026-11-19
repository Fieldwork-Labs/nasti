-- Ownership transfer: schema (plan 2026-11-18-transfer.md, section 1).
--
-- Part 1 of migration B. It covers link isolation, the directory flag, the
-- ledger constraints and lineage validator, the transfer and reservation
-- tables, provenance columns with their guard, snapshot tables, and RLS and
-- grants. Lifecycle functions, inventory guards and cleaning follow in later
-- migrations.
--
-- Uses the enum values added in 20261118000001_transfer_enums.sql.

-- =========================================================================
-- 1.4 Generalise links: kind, request lifecycle columns, isolation
-- =========================================================================

ALTER TABLE public.organisation_link
  ADD COLUMN kind public.organisation_link_kind NOT NULL DEFAULT 'testing';

ALTER TABLE public.organisation_link_request
  ADD COLUMN kind public.organisation_link_kind NOT NULL DEFAULT 'testing',
  ADD COLUMN declined_at timestamptz,
  ADD COLUMN declined_by uuid REFERENCES auth.users(id),
  ADD COLUMN cancelled_at timestamptz;

-- A request is open, accepted, declined or cancelled, never two of those.
ALTER TABLE public.organisation_link_request
  ADD CONSTRAINT organisation_link_request_single_resolution
  CHECK (num_nonnulls(accepted_at, declined_at, cancelled_at) <= 1);

-- A pair may hold one link per kind. Dropping the constraint drops its index.
ALTER TABLE public.organisation_link
  DROP CONSTRAINT organisation_link_unique;

ALTER TABLE public.organisation_link
  ADD CONSTRAINT organisation_link_unique
  UNIQUE (requesting_org_id, provider_org_id, kind);

-- One open transfer request per directional pair. The predicate is limited to
-- kind = 'transfer', so legacy testing requests (which can contain duplicate
-- pending rows) stay outside the index and cannot block this migration.
CREATE UNIQUE INDEX organisation_link_request_open_transfer_unique
  ON public.organisation_link_request (requesting_org_id, provider_org_id)
  WHERE kind = 'transfer'
    AND accepted_at IS NULL
    AND declined_at IS NULL
    AND cancelled_at IS NULL;

CREATE INDEX idx_organisation_link_request_kind
  ON public.organisation_link_request (kind);

-- Previous latest definition: 20260911000004_testing_work_and_custody.sql
-- (validate_testing_provider_link, testing-only).
CREATE OR REPLACE FUNCTION public.validate_testing_provider_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.kind = 'transfer' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.organisation o
      WHERE o.id = NEW.provider_org_id
        AND o.accepts_transfers
    ) THEN
      RAISE EXCEPTION 'Recipient organisation does not accept transfers'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1
      FROM public.organisation o
      WHERE o.id = NEW.provider_org_id
        AND o.is_testing_provider
    ) THEN
      RAISE EXCEPTION 'Provider organisation must offer testing services'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;

-- Widen both triggers (previously INSERT OR UPDATE OF provider_org_id,
-- 20260911000005_permissions_rls_and_integrations.sql) so changing the
-- requester or the kind is revalidated too.
DROP TRIGGER organisation_link_validate_provider ON public.organisation_link;

CREATE TRIGGER organisation_link_validate_provider
  BEFORE INSERT OR UPDATE OF provider_org_id, requesting_org_id, kind
  ON public.organisation_link
  FOR EACH ROW EXECUTE FUNCTION public.validate_testing_provider_link();

DROP TRIGGER organisation_link_request_validate_provider ON public.organisation_link_request;

CREATE TRIGGER organisation_link_request_validate_provider
  BEFORE INSERT OR UPDATE OF provider_org_id, requesting_org_id, kind
  ON public.organisation_link_request
  FOR EACH ROW EXECUTE FUNCTION public.validate_testing_provider_link();

-- Recipient approval is enforced in SQL. Direct client writes may only touch
-- kind = 'testing' rows, in both the old row (USING) and the new row
-- (WITH CHECK). Transfer rows are written only by the transfer RPCs.
-- Previous definitions: 20260911000005_permissions_rls_and_integrations.sql.
ALTER POLICY "organisation_link_delete" ON public.organisation_link
  USING (
    public.is_org_member((SELECT auth.uid()), requesting_org_id)
    AND (SELECT public.auth_org_role()) = 'Admin'
    AND kind = 'testing'
  );

ALTER POLICY "organisation_link_insert" ON public.organisation_link
  WITH CHECK (
    public.is_org_member((SELECT auth.uid()), provider_org_id)
    AND (SELECT public.auth_org_role()) = 'Admin'
    AND kind = 'testing'
  );

ALTER POLICY "organisation_link_update" ON public.organisation_link
  USING (
    public.is_org_member((SELECT auth.uid()), requesting_org_id)
    AND (SELECT public.auth_org_role()) = 'Admin'
    AND kind = 'testing'
  )
  WITH CHECK (
    public.is_org_member((SELECT auth.uid()), requesting_org_id)
    AND (SELECT public.auth_org_role()) = 'Admin'
    AND kind = 'testing'
  );

ALTER POLICY "organisation_link_request_delete" ON public.organisation_link_request
  USING (
    public.is_org_member((SELECT auth.uid()), requesting_org_id)
    AND (SELECT public.auth_org_role()) = 'Admin'
    AND kind = 'testing'
  );

ALTER POLICY "organisation_link_request_insert" ON public.organisation_link_request
  WITH CHECK (
    public.is_org_member((SELECT auth.uid()), requesting_org_id)
    AND (SELECT public.auth_org_role()) = 'Admin'
    AND kind = 'testing'
  );

ALTER POLICY "organisation_link_request_update" ON public.organisation_link_request
  USING (
    public.is_org_member((SELECT auth.uid()), provider_org_id)
    AND (SELECT public.auth_org_role()) = 'Admin'
    AND kind = 'testing'
  )
  WITH CHECK (
    public.is_org_member((SELECT auth.uid()), provider_org_id)
    AND (SELECT public.auth_org_role()) = 'Admin'
    AND kind = 'testing'
  );

-- Only testing links expose a requesting org's full row to the provider's
-- members. Transfer partners see each other through the RPCs, names only.
-- Previous definition: 20260911000005_permissions_rls_and_integrations.sql.
ALTER POLICY "organisation_select" ON public.organisation
  USING (
    id = (SELECT public.get_user_organisation_id())
    OR is_testing_provider
    OR EXISTS (
      SELECT 1
      FROM public.organisation_link ol
      JOIN public.org_user ou ON ou.organisation_id = ol.provider_org_id
      WHERE ol.requesting_org_id = organisation.id
        AND ol.kind = 'testing'
        AND ou.user_id = (SELECT auth.uid())
    )
  );

-- Testing code reads only testing links.
-- Previous definition: 20260911000004_testing_work_and_custody.sql.
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
      AND kind = 'testing'
  );
$function$
;

-- (fn_assign_bags_for_testing gets the same filter further down, once
-- is_bag_reserved exists.)

-- =========================================================================
-- 1.3 Directory flag
-- =========================================================================

ALTER TABLE public.organisation
  ADD COLUMN accepts_transfers boolean NOT NULL DEFAULT false;

CREATE INDEX idx_organisation_accepts_transfers
  ON public.organisation (accepts_transfers)
  WHERE accepts_transfers;

-- Invoker trigger: a client write arrives as the authenticated or anon role.
-- SECURITY DEFINER RPCs run as the function owner, so they pass.
CREATE OR REPLACE FUNCTION public.guard_organisation_accepts_transfers()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' AND NEW.accepts_transfers THEN
      RAISE EXCEPTION 'accepts_transfers can only be changed through fn_set_accepts_transfers'
        USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'UPDATE'
       AND NEW.accepts_transfers IS DISTINCT FROM OLD.accepts_transfers THEN
      RAISE EXCEPTION 'accepts_transfers can only be changed through fn_set_accepts_transfers'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE TRIGGER organisation_accepts_transfers_guard
  BEFORE INSERT OR UPDATE OF accepts_transfers
  ON public.organisation
  FOR EACH ROW EXECUTE FUNCTION public.guard_organisation_accepts_transfers();

-- =========================================================================
-- 1.2 Ledger constraints and lineage validator
-- =========================================================================

-- transfer_out requires transfer_item_id and nothing else, like variance.
-- Previous definition: 20260911000001_inventory_foundation.sql.
ALTER TABLE public.batch_weight_adjustments
  DROP CONSTRAINT batch_weight_adjustment_reference_shape;

ALTER TABLE public.batch_weight_adjustments
  ADD CONSTRAINT batch_weight_adjustment_reference_shape CHECK (
    (
      kind = 'test_consumption'
      AND test_id IS NOT NULL
      AND lineage_operation_id IS NULL
      AND transfer_item_id IS NULL
      AND corrects_adjustment_id IS NULL
    )
    OR (
      kind = ANY (ARRAY['split'::public.batch_weight_adjustment_kind, 'merge'::public.batch_weight_adjustment_kind, 'cleaning'::public.batch_weight_adjustment_kind])
      AND test_id IS NULL
      AND lineage_operation_id IS NOT NULL
      AND transfer_item_id IS NULL
      AND corrects_adjustment_id IS NULL
    )
    OR (
      kind = ANY (ARRAY['variance'::public.batch_weight_adjustment_kind, 'transfer_out'::public.batch_weight_adjustment_kind])
      AND test_id IS NULL
      AND lineage_operation_id IS NULL
      AND transfer_item_id IS NOT NULL
      AND corrects_adjustment_id IS NULL
    )
    OR (
      kind = 'correction'
      AND test_id IS NULL
      AND lineage_operation_id IS NULL
      AND transfer_item_id IS NULL
    )
  );

-- ownership_transfer joins the testing_dispatch / return arm.
-- Previous definition: 20260911000001_inventory_foundation.sql.
ALTER TABLE public.seed_transfer_event
  DROP CONSTRAINT seed_transfer_event_reference_shape;

ALTER TABLE public.seed_transfer_event
  ADD CONSTRAINT seed_transfer_event_reference_shape CHECK (
    (
      kind = 'reversal'
      AND reverses_event_id IS NOT NULL
      AND corrects_event_id IS NULL
      AND NULLIF(btrim(reason), '') IS NOT NULL
    )
    OR (
      kind = 'correction'
      AND corrects_event_id IS NOT NULL
      AND reverses_event_id IS NULL
      AND NULLIF(btrim(reason), '') IS NOT NULL
    )
    OR (
      kind = ANY (ARRAY['testing_dispatch'::public.seed_transfer_event_kind, 'return'::public.seed_transfer_event_kind, 'ownership_transfer'::public.seed_transfer_event_kind])
      AND reverses_event_id IS NULL
      AND corrects_event_id IS NULL
    )
  );

-- =========================================================================
-- 1.5 Transfers and reservations
-- =========================================================================

CREATE TABLE public.ownership_transfer (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sender_org_id uuid NOT NULL REFERENCES public.organisation(id),
  recipient_org_id uuid NOT NULL REFERENCES public.organisation(id),
  status text NOT NULL DEFAULT 'pending_link',
  link_request_id uuid REFERENCES public.organisation_link_request(id),
  transfer_event_id uuid REFERENCES public.seed_transfer_event(id),
  notes text,
  -- Client-generated idempotency key, unique per sender.
  request_id uuid NOT NULL,
  -- Normalised input (recipient, bags, quantities, notes) used to tell a
  -- replay from reuse of the key with a different payload. Never exposed to
  -- clients (see column grants below).
  request_fingerprint jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id),
  CONSTRAINT ownership_transfer_pkey PRIMARY KEY (id),
  CONSTRAINT ownership_transfer_distinct_orgs CHECK (sender_org_id <> recipient_org_id),
  CONSTRAINT ownership_transfer_status_check
    CHECK (status IN ('pending_link', 'completed', 'cancelled', 'declined')),
  CONSTRAINT ownership_transfer_completed_has_event
    CHECK (status <> 'completed' OR transfer_event_id IS NOT NULL),
  CONSTRAINT ownership_transfer_request_unique UNIQUE (sender_org_id, request_id)
);

CREATE INDEX idx_ownership_transfer_sender ON public.ownership_transfer (sender_org_id);
CREATE INDEX idx_ownership_transfer_recipient ON public.ownership_transfer (recipient_org_id);
CREATE INDEX idx_ownership_transfer_link_request ON public.ownership_transfer (link_request_id)
  WHERE link_request_id IS NOT NULL;
CREATE INDEX idx_ownership_transfer_pending ON public.ownership_transfer (sender_org_id, recipient_org_id)
  WHERE status = 'pending_link';
CREATE UNIQUE INDEX ownership_transfer_event_unique ON public.ownership_transfer (transfer_event_id)
  WHERE transfer_event_id IS NOT NULL;

CREATE TABLE public.ownership_transfer_item (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES public.ownership_transfer(id),
  -- The bag that will move, after any split.
  sub_batch_id uuid NOT NULL REFERENCES public.sub_batches(id) ON DELETE RESTRICT,
  weight_grams numeric NOT NULL,
  -- Set on completion.
  seed_transfer_item_id uuid REFERENCES public.seed_transfer_item(id),
  received_batch_id uuid REFERENCES public.batches(id),
  received_sub_batch_id uuid REFERENCES public.sub_batches(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ownership_transfer_item_pkey PRIMARY KEY (id),
  CONSTRAINT ownership_transfer_item_weight_positive CHECK (weight_grams > 0),
  CONSTRAINT ownership_transfer_item_bag_once UNIQUE (transfer_id, sub_batch_id),
  -- The completion mapping is written in one UPDATE.
  CONSTRAINT ownership_transfer_item_mapping_complete CHECK (
    (seed_transfer_item_id IS NULL) = (received_batch_id IS NULL)
    AND (seed_transfer_item_id IS NULL) = (received_sub_batch_id IS NULL)
  )
);

CREATE INDEX idx_ownership_transfer_item_transfer ON public.ownership_transfer_item (transfer_id);
CREATE INDEX idx_ownership_transfer_item_sub_batch ON public.ownership_transfer_item (sub_batch_id);
CREATE UNIQUE INDEX ownership_transfer_item_seed_item_unique
  ON public.ownership_transfer_item (seed_transfer_item_id)
  WHERE seed_transfer_item_id IS NOT NULL;
CREATE UNIQUE INDEX ownership_transfer_item_received_bag_unique
  ON public.ownership_transfer_item (received_sub_batch_id)
  WHERE received_sub_batch_id IS NOT NULL;
CREATE UNIQUE INDEX ownership_transfer_item_received_batch_unique
  ON public.ownership_transfer_item (received_batch_id)
  WHERE received_batch_id IS NOT NULL;

-- One row is one active reservation. The primary key makes a second
-- reservation of the same bag impossible. Rows are inserted when a pending
-- transfer is created and deleted, in the same transaction, when it
-- completes, is declined or is cancelled.
CREATE TABLE public.sub_batch_reservation (
  sub_batch_id uuid NOT NULL REFERENCES public.sub_batches(id) ON DELETE RESTRICT,
  transfer_id uuid NOT NULL REFERENCES public.ownership_transfer(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sub_batch_reservation_pkey PRIMARY KEY (sub_batch_id)
);

CREATE INDEX idx_sub_batch_reservation_transfer ON public.sub_batch_reservation (transfer_id);

CREATE OR REPLACE FUNCTION public.is_bag_reserved(p_sub_batch_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.sub_batch_reservation r
    WHERE r.sub_batch_id = p_sub_batch_id
  );
$function$
;

CREATE OR REPLACE FUNCTION public.assert_bag_not_reserved(p_sub_batch_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF p_sub_batch_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.sub_batch_reservation r
    WHERE r.sub_batch_id = p_sub_batch_id
  ) THEN
    RAISE EXCEPTION 'Bag is reserved for a pending transfer'
      USING ERRCODE = '55000';
  END IF;
END;
$function$
;

-- Callable by signed-in users (UI badges, invoker guard triggers); never anon.
REVOKE ALL ON FUNCTION public.is_bag_reserved(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assert_bag_not_reserved(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_bag_reserved(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_bag_not_reserved(uuid) TO authenticated;

-- fn_assign_bags_for_testing: kind = 'testing' link filter and the reservation
-- check. Previous (and only) definition: 20260911000004_testing_work_and_custody.sql.
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
      AND ol.kind = 'testing'
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

    -- A bag reserved for a pending ownership transfer is locked until the
    -- transfer completes, is declined or is cancelled. The bag lock is already
    -- held, so the answer cannot change under us.
    IF public.is_bag_reserved(v_bag_id) THEN
      RAISE EXCEPTION 'Bag is reserved for a pending transfer'
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
-- validate_sub_batch_lineage_edge: a 'transfer' edge is the only cross-owner
-- edge, and only while its completion mapping exists. Everything else is
-- unchanged. Previous definition: 20260911000003_inventory_operations_and_lineage.sql.
CREATE OR REPLACE FUNCTION public.validate_sub_batch_lineage_edge()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_source_batch_id UUID;
  v_derived_batch_id UUID;
  v_source_owner_org_id UUID;
  v_derived_owner_org_id UUID;
BEGIN
  SELECT sb.batch_id, b.organisation_id
  INTO v_source_batch_id, v_source_owner_org_id
  FROM public.sub_batches sb
  INNER JOIN public.batches b ON b.id = sb.batch_id
  WHERE sb.id = NEW.source_sub_batch_id;

  SELECT sb.batch_id, b.organisation_id
  INTO v_derived_batch_id, v_derived_owner_org_id
  FROM public.sub_batches sb
  INNER JOIN public.batches b ON b.id = sb.batch_id
  WHERE sb.id = NEW.derived_sub_batch_id;

  IF v_source_batch_id IS NULL OR v_derived_batch_id IS NULL THEN
    RAISE EXCEPTION 'Lineage bags must exist'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.operation_kind = 'transfer' THEN
    -- operation_id is the seed_transfer_item of the source bag. The edge is
    -- valid only while the transfer is being completed: the item mapping has
    -- been written (completion step 3.7) and the transfer is not yet marked
    -- completed (step 4).
    IF NOT EXISTS (
      SELECT 1
      FROM public.seed_transfer_item sti
      INNER JOIN public.seed_transfer_event ste
        ON ste.id = sti.transfer_event_id
      INNER JOIN public.ownership_transfer_item oti
        ON oti.seed_transfer_item_id = sti.id
      INNER JOIN public.ownership_transfer ot
        ON ot.id = oti.transfer_id
      WHERE sti.id = NEW.operation_id
        AND sti.sub_batch_id = NEW.source_sub_batch_id
        AND ste.kind = 'ownership_transfer'
        AND oti.received_sub_batch_id = NEW.derived_sub_batch_id
        AND ot.status = 'pending_link'
        AND ot.sender_org_id = v_source_owner_org_id
        AND ot.recipient_org_id = v_derived_owner_org_id
    ) THEN
      RAISE EXCEPTION 'Transfer lineage must match a transfer being completed'
        USING ERRCODE = '23514';
    END IF;
  ELSIF v_source_owner_org_id IS DISTINCT FROM v_derived_owner_org_id THEN
    RAISE EXCEPTION 'Lineage cannot cross seed owners'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.operation_kind IN ('split', 'merge')
    AND v_source_batch_id IS DISTINCT FROM v_derived_batch_id THEN
    RAISE EXCEPTION '% lineage must stay within one parent batch',
      NEW.operation_kind
      USING ERRCODE = '23514';
  END IF;

  IF NEW.operation_kind = 'split' AND EXISTS (
    SELECT 1
    FROM public.sub_batch_lineage lineage
    WHERE lineage.operation_kind = 'split'
      AND lineage.operation_id = NEW.operation_id
      AND lineage.source_sub_batch_id <> NEW.source_sub_batch_id
  ) THEN
    RAISE EXCEPTION 'A split operation must have one source bag'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.operation_kind = 'merge' AND EXISTS (
    SELECT 1
    FROM public.sub_batch_lineage lineage
    WHERE lineage.operation_kind = 'merge'
      AND lineage.operation_id = NEW.operation_id
      AND lineage.derived_sub_batch_id <> NEW.derived_sub_batch_id
  ) THEN
    RAISE EXCEPTION 'A merge operation must have one derived bag'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.operation_kind = 'cleaning' AND NOT EXISTS (
    SELECT 1
    FROM public.batch_cleaning cleaning
    INNER JOIN public.batch_cleaning_output output
      ON output.cleaning_id = cleaning.id
    INNER JOIN public.sub_batches derived
      ON derived.batch_id = output.output_batch_id
    INNER JOIN public.sub_batches source
      ON source.id = NEW.source_sub_batch_id
    WHERE cleaning.id = NEW.operation_id
      AND derived.id = NEW.derived_sub_batch_id
      AND (
        cleaning.input_sub_batch_id = NEW.source_sub_batch_id
        OR (
          cleaning.input_sub_batch_id IS NULL
          AND source.batch_id = output.output_batch_id
          AND derived.batch_id = source.batch_id
        )
      )
  ) THEN
    RAISE EXCEPTION 'Cleaning lineage must match its cleaning input and output'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    WITH RECURSIVE descendants (sub_batch_id) AS (
      SELECT NEW.derived_sub_batch_id
      UNION
      SELECT lineage.derived_sub_batch_id
      FROM public.sub_batch_lineage lineage
      INNER JOIN descendants
        ON descendants.sub_batch_id = lineage.source_sub_batch_id
    )
    SELECT 1
    FROM descendants
    WHERE sub_batch_id = NEW.source_sub_batch_id
  ) THEN
    RAISE EXCEPTION 'Lineage edge would create a cycle'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$
;

-- =========================================================================
-- 1.6 Provenance on the received batch
-- =========================================================================

ALTER TABLE public.batches
  ADD COLUMN received_transfer_item_id uuid
    REFERENCES public.seed_transfer_item(id) ON DELETE RESTRICT,
  ADD COLUMN source_collection_code text,
  ADD COLUMN source_ibra_code text,
  ADD COLUMN source_collection_year smallint;

-- A transfer item produces exactly one received batch.
CREATE UNIQUE INDEX batches_received_transfer_item_unique
  ON public.batches (received_transfer_item_id)
  WHERE received_transfer_item_id IS NOT NULL;

-- Invoker trigger. authenticated holds table-level INSERT and UPDATE on
-- batches, so the provenance columns are protected by role instead:
--   * INSERT: a non-NULL value is rejected when current_user is authenticated
--     or anon. SECURITY DEFINER paths (completion, cleaning) run as the
--     function owner and pass.
--   * UPDATE: any change to these columns is rejected for every role. They
--     are immutable after insert.
CREATE OR REPLACE FUNCTION public.guard_batch_provenance_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF current_user IN ('authenticated', 'anon')
       AND (
         NEW.received_transfer_item_id IS NOT NULL
         OR NEW.source_collection_code IS NOT NULL
         OR NEW.source_ibra_code IS NOT NULL
         OR NEW.source_collection_year IS NOT NULL
       ) THEN
      RAISE EXCEPTION 'Batch provenance columns cannot be set directly'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.received_transfer_item_id IS DISTINCT FROM OLD.received_transfer_item_id
     OR NEW.source_collection_code IS DISTINCT FROM OLD.source_collection_code
     OR NEW.source_ibra_code IS DISTINCT FROM OLD.source_ibra_code
     OR NEW.source_collection_year IS DISTINCT FROM OLD.source_collection_year THEN
    RAISE EXCEPTION 'Batch provenance columns are immutable'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE TRIGGER batches_provenance_guard
  BEFORE INSERT OR UPDATE OF received_transfer_item_id, source_collection_code, source_ibra_code, source_collection_year
  ON public.batches
  FOR EACH ROW EXECUTE FUNCTION public.guard_batch_provenance_columns();

-- Test results captured at completion. No FK to tests: later edits and
-- deletions on the sender's batch must leave the snapshot intact.
CREATE TABLE public.ownership_transfer_test_snapshot (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ownership_transfer_item_id uuid NOT NULL REFERENCES public.ownership_transfer_item(id),
  -- 0 for this transfer's source batch, n for earlier hops.
  hop integer NOT NULL,
  source_test_id uuid NOT NULL,
  type text NOT NULL,
  quality_test_type text,
  statistics jsonb,
  -- Already projected to named fields; never the raw result (free-text notes).
  result jsonb,
  tested_at timestamptz,
  performed_by_organisation_id uuid REFERENCES public.organisation(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ownership_transfer_test_snapshot_pkey PRIMARY KEY (id),
  CONSTRAINT ownership_transfer_test_snapshot_hop_check CHECK (hop >= 0),
  CONSTRAINT ownership_transfer_test_snapshot_unique
    UNIQUE (ownership_transfer_item_id, hop, source_test_id)
);

CREATE INDEX idx_ownership_transfer_test_snapshot_item
  ON public.ownership_transfer_test_snapshot (ownership_transfer_item_id);

-- Storage periods captured at completion: dates and durations only. No
-- location, container or notes.
CREATE TABLE public.ownership_transfer_storage_snapshot (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ownership_transfer_item_id uuid NOT NULL REFERENCES public.ownership_transfer_item(id),
  hop integer NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL,
  duration interval NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ownership_transfer_storage_snapshot_pkey PRIMARY KEY (id),
  CONSTRAINT ownership_transfer_storage_snapshot_hop_check CHECK (hop >= 0),
  CONSTRAINT ownership_transfer_storage_snapshot_period_check CHECK (ended_at >= started_at)
);

CREATE INDEX idx_ownership_transfer_storage_snapshot_item
  ON public.ownership_transfer_storage_snapshot (ownership_transfer_item_id);

-- =========================================================================
-- 1.7 RLS and grants
-- =========================================================================

ALTER TABLE public.ownership_transfer ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ownership_transfer_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sub_batch_reservation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ownership_transfer_test_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ownership_transfer_storage_snapshot ENABLE ROW LEVEL SECURITY;

-- New tables in public are granted to anon and authenticated by default.
-- Start from nothing, then grant back only what clients may read.
REVOKE ALL ON TABLE
  public.ownership_transfer,
  public.ownership_transfer_item,
  public.sub_batch_reservation,
  public.ownership_transfer_test_snapshot,
  public.ownership_transfer_storage_snapshot
FROM anon, authenticated;

-- Members of the sender or recipient organisation can read a transfer and its
-- items. There are no write policies: everything goes through RPCs.
CREATE POLICY "ownership_transfer_select"
  ON public.ownership_transfer
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    public.is_org_member((SELECT auth.uid()), sender_org_id)
    OR public.is_org_member((SELECT auth.uid()), recipient_org_id)
  );

CREATE POLICY "ownership_transfer_item_select"
  ON public.ownership_transfer_item
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.ownership_transfer ot
      WHERE ot.id = ownership_transfer_item.transfer_id
        AND (
          public.is_org_member((SELECT auth.uid()), ot.sender_org_id)
          OR public.is_org_member((SELECT auth.uid()), ot.recipient_org_id)
        )
    )
  );

-- Column-level grant: request_fingerprint is deliberately absent, so the
-- replay input never reaches a client. Select explicit columns, not *.
-- Any column added to ownership_transfer later needs its own grant.
GRANT SELECT (
  id,
  sender_org_id,
  recipient_org_id,
  status,
  link_request_id,
  transfer_event_id,
  notes,
  request_id,
  created_by,
  created_at,
  resolved_at,
  resolved_by
) ON TABLE public.ownership_transfer TO authenticated;

GRANT SELECT ON TABLE public.ownership_transfer_item TO authenticated;

-- sub_batch_reservation and both snapshot tables have RLS on, no policies and
-- no client grants. They are read through SECURITY DEFINER functions only.
