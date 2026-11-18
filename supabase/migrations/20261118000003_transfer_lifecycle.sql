-- Ownership transfer: lifecycle functions (plan 2026-11-18-transfer.md,
-- sections 2.1 to 2.7, 2.9 and the function grants of 1.7).
--
-- Part 2 of migration B. Depends on 20261118000001_transfer_enums.sql and
-- 20261118000002_transfer_schema.sql. Everything here is a NEW function: no
-- existing function is redefined. The reservation guards on existing tables
-- and the bag-first storage RPC live in 20261118000004.
--
-- Contents
--   Internal helpers   fn_transfer_resolve_caller, fn_transfer_lock_pair,
--                      fn_transfer_bag_problem, fn_transfer_source_facts,
--                      fn_transfer_send_result, projection helpers,
--                      fn_transfer_authorise_received_batch
--   Internal steps     fn_close_storage_for_transfer,
--                      fn_complete_ownership_transfer
--   Public RPCs        fn_transfer_directory, fn_send_bags_for_transfer,
--                      fn_respond_transfer_link_request,
--                      fn_cancel_ownership_transfer, fn_set_accepts_transfers,
--                      fn_received_batch_provenance,
--                      fn_received_batch_storage_history,
--                      fn_list_transfer_link_requests,
--                      fn_sub_batch_reservations, fn_received_batch_sources
--
-- Caller resolution (all RPCs): auth.uid(), then the caller's first active
-- org_user row ordered by joined_at, exactly as fn_assign_bags_for_testing
-- does. Role and permissions come from that same org_user row.
--
-- Lock order (plan 2.1): recipient organisation row, then the advisory pair
-- lock, then bags, then batches (each ascending by id), then re-check state.
--
-- Error contract: 28000 no session, 42501 not permitted, P0002 not found,
-- 55000 state conflict, 22023 invalid argument, 23505 key collision.

-- =========================================================================
-- Internal helpers
-- =========================================================================

-- Returns the caller's organisation id and raises when the caller lacks the
-- required level: 'member' (any active member), 'inventory' (Admin, or the
-- inventory permission) or 'admin' (Admin role only).
CREATE OR REPLACE FUNCTION public.fn_transfer_resolve_caller(p_level text DEFAULT 'member')
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_org_id uuid;
  v_role public.org_user_types;
  v_permissions text[];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '28000';
  END IF;

  SELECT ou.organisation_id, ou.role, ou.permissions::text[]
    INTO v_org_id, v_role, v_permissions
  FROM public.org_user ou
  WHERE ou.user_id = v_user_id
    AND ou.is_active = true
  ORDER BY ou.joined_at ASC
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Active organisation membership required'
      USING ERRCODE = '42501';
  END IF;

  IF p_level = 'admin' AND v_role IS DISTINCT FROM 'Admin' THEN
    RAISE EXCEPTION 'Admin role required'
      USING ERRCODE = '42501';
  END IF;

  IF p_level = 'inventory'
     AND v_role IS DISTINCT FROM 'Admin'
     AND NOT ('inventory' = ANY (COALESCE(v_permissions, '{}'::text[]))) THEN
    RAISE EXCEPTION 'Your account does not have inventory access'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_org_id;
END;
$function$
;

-- Transaction-scoped advisory lock for one directional pair (plan 2.1 step 2).
CREATE OR REPLACE FUNCTION public.fn_transfer_lock_pair(p_sender_org_id uuid, p_recipient_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      p_sender_org_id::text || ':' || p_recipient_org_id::text || ':transfer',
      0
    )
  );
END;
$function$
;

-- One row (code, message) describing why a bag cannot be transferred, or no
-- rows when it can. The caller already holds the bag and batch locks.
--   p_transfer_id NULL     a new send: the bag must not be reserved.
--   p_transfer_id given    accept: the bag must be reserved by that transfer.
--   p_expected_weight      accept: the bag must still weigh what was reserved.
CREATE OR REPLACE FUNCTION public.fn_transfer_bag_problem(
  p_sub_batch_id uuid,
  p_sender_org_id uuid,
  p_transfer_id uuid DEFAULT NULL,
  p_expected_weight numeric DEFAULT NULL
)
 RETURNS TABLE(code text, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
DECLARE
  v_batch_id uuid;
  v_holder_org_id uuid;
  v_owner_org_id uuid;
  v_current_weight numeric;
BEGIN
  SELECT sb.batch_id, sb.held_by_org_id, b.organisation_id
    INTO v_batch_id, v_holder_org_id, v_owner_org_id
  FROM public.sub_batches sb
  INNER JOIN public.batches b ON b.id = sb.batch_id
  WHERE sb.id = p_sub_batch_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'P0002'::text, format('Bag %s not found', p_sub_batch_id);
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.batch_testing_assignment bta
    WHERE bta.sub_batch_id = p_sub_batch_id
      AND bta.closed_at IS NULL
  ) THEN
    RETURN QUERY SELECT '55000'::text,
      format('Bag %s already has an active testing assignment', p_sub_batch_id);
    RETURN;
  END IF;

  IF p_transfer_id IS NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.sub_batch_reservation r
      WHERE r.sub_batch_id = p_sub_batch_id
    ) THEN
      RETURN QUERY SELECT '55000'::text, 'Bag is reserved for a pending transfer'::text;
      RETURN;
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1
    FROM public.sub_batch_reservation r
    WHERE r.sub_batch_id = p_sub_batch_id
      AND r.transfer_id = p_transfer_id
  ) THEN
    RETURN QUERY SELECT '55000'::text,
      format('Bag %s is no longer reserved for this transfer', p_sub_batch_id);
    RETURN;
  END IF;

  IF v_holder_org_id IS DISTINCT FROM p_sender_org_id THEN
    RETURN QUERY SELECT '42501'::text,
      format('Bag %s is not held by your organisation', p_sub_batch_id);
    RETURN;
  END IF;

  IF v_owner_org_id IS DISTINCT FROM p_sender_org_id THEN
    RETURN QUERY SELECT '42501'::text,
      format('Bag %s is not owned by your organisation', p_sub_batch_id);
    RETURN;
  END IF;

  SELECT sbcw.current_weight
    INTO v_current_weight
  FROM public.sub_batch_current_weight sbcw
  WHERE sbcw.id = p_sub_batch_id;

  IF v_current_weight IS NULL OR v_current_weight <= 0 THEN
    RETURN QUERY SELECT '22023'::text,
      format('Bag %s has no seed left to send', p_sub_batch_id);
    RETURN;
  END IF;

  -- Active inventory (plan "How it maps"): the parent batch must not have been
  -- consumed by a merge, mix or combine, and the bag must not be a cleaning
  -- input. Both leave a positive current weight behind.
  IF EXISTS (
    SELECT 1
    FROM public.batch_merges bm
    WHERE bm.source_batch_id = v_batch_id
  ) THEN
    RETURN QUERY SELECT '55000'::text,
      format('Bag %s belongs to a batch that has been merged', p_sub_batch_id);
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.batch_cleaning bc
    WHERE bc.input_sub_batch_id = p_sub_batch_id
  ) THEN
    RETURN QUERY SELECT '55000'::text,
      format('Bag %s has been cleaned', p_sub_batch_id);
    RETURN;
  END IF;

  IF p_expected_weight IS NOT NULL AND v_current_weight IS DISTINCT FROM p_expected_weight THEN
    RETURN QUERY SELECT '55000'::text,
      format('Bag %s no longer has the weight that was reserved', p_sub_batch_id);
    RETURN;
  END IF;

  RETURN;
END;
$function$
;

-- What a batch's seed is, as the next owner is allowed to know it: species
-- (with the identifiers needed to match or create the recipient's species
-- row), collection code, IBRA code and collection year. A batch with a
-- collection reads them from the collection. A collectionless batch (a
-- received batch, or what cleaning it produced) carries them in its own
-- source_* columns. Where those are empty too (a combined batch) the batch's
-- own code stands in as the collection code.
CREATE OR REPLACE FUNCTION public.fn_transfer_source_facts(p_batch_id uuid)
 RETURNS TABLE(
   species_id uuid,
   species_name text,
   species_ala_guid text,
   species_indigenous_name text,
   collection_code text,
   ibra_code text,
   collection_year smallint
 )
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT
    s.id,
    s.name::text,
    s.ala_guid::text,
    s.indigenous_name::text,
    (CASE
      WHEN b.collection_id IS NOT NULL THEN c.code
      ELSE COALESCE(b.source_collection_code, b.code)
    END)::text,
    (CASE
      WHEN b.collection_id IS NOT NULL THEN public.get_ibra_code_from_location(c.location)
      ELSE b.source_ibra_code
    END)::text,
    (CASE
      WHEN b.collection_id IS NOT NULL THEN extract(year FROM c.collected_on)::smallint
      ELSE b.source_collection_year
    END)::smallint
  FROM public.batches b
  LEFT JOIN public.collection c ON c.id = b.collection_id
  LEFT JOIN public.species s ON s.id = COALESCE(c.species_id, b.species_id)
  WHERE b.id = p_batch_id
$function$
;

-- ---- Result projection (plan 2.7) -----------------------------------------

CREATE OR REPLACE FUNCTION public.fn_transfer_numeric_or_null(p_value jsonb)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN jsonb_typeof(p_value) = 'number' THEN (p_value #>> '{}')::numeric
    ELSE NULL
  END
$function$
;

-- The subtype of a quality test (x-ray, cut test, tz, germination), NULL for
-- other test types and for any value outside the known set.
CREATE OR REPLACE FUNCTION public.fn_transfer_quality_test_type(p_type text, p_result jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN p_type = 'quality'
      AND jsonb_typeof(p_result) = 'object'
      AND (p_result ->> 'test_type') IN ('x-ray', 'cut test', 'tz', 'germination')
      THEN p_result ->> 'test_type'
    ELSE NULL
  END
$function$
;

-- Named numeric fields only. plsCount and psuCount are estimates for the
-- sender's whole tested batch and are deliberately left out.
CREATE OR REPLACE FUNCTION public.fn_transfer_project_statistics(p_statistics jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN jsonb_typeof(p_statistics) = 'object' THEN
      jsonb_strip_nulls(jsonb_build_object(
        'pls', public.fn_transfer_numeric_or_null(p_statistics -> 'pls'),
        'psu', public.fn_transfer_numeric_or_null(p_statistics -> 'psu'),
        'vsu', public.fn_transfer_numeric_or_null(p_statistics -> 'vsu'),
        'tpsu', public.fn_transfer_numeric_or_null(p_statistics -> 'tpsu'),
        'standardError', public.fn_transfer_numeric_or_null(p_statistics -> 'standardError')
      ))
    ELSE NULL
  END
$function$
;

-- Quality results: test_type, psu_grams, inert_seed_weight_grams,
-- other_species_seeds_grams, relative_humidity_percent and repeats, each
-- repeat rebuilt from weight_grams, viable_seed_count and dead_seed_count.
-- Free-text notes and every unknown field are dropped. Other test types
-- (germination has no defined result shape in the app) project to NULL, so
-- the recipient sees the type, date, performer and statistics only.
CREATE OR REPLACE FUNCTION public.fn_transfer_project_result(p_type text, p_result jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN p_type = 'quality' AND jsonb_typeof(p_result) = 'object' THEN
      jsonb_strip_nulls(jsonb_build_object(
        'test_type', public.fn_transfer_quality_test_type(p_type, p_result),
        'psu_grams', public.fn_transfer_numeric_or_null(p_result -> 'psu_grams'),
        'inert_seed_weight_grams', public.fn_transfer_numeric_or_null(p_result -> 'inert_seed_weight_grams'),
        'other_species_seeds_grams', public.fn_transfer_numeric_or_null(p_result -> 'other_species_seeds_grams'),
        'relative_humidity_percent', public.fn_transfer_numeric_or_null(p_result -> 'relative_humidity_percent'),
        'repeats', COALESCE(
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'weight_grams', public.fn_transfer_numeric_or_null(e.item -> 'weight_grams'),
                'viable_seed_count', public.fn_transfer_numeric_or_null(e.item -> 'viable_seed_count'),
                'dead_seed_count', public.fn_transfer_numeric_or_null(e.item -> 'dead_seed_count')
              )
              ORDER BY e.ord
            )
            FROM jsonb_array_elements(
              CASE
                WHEN jsonb_typeof(p_result -> 'repeats') = 'array' THEN p_result -> 'repeats'
                ELSE '[]'::jsonb
              END
            ) WITH ORDINALITY AS e(item, ord)
            WHERE jsonb_typeof(e.item) = 'object'
          ),
          '[]'::jsonb
        )
      ))
    ELSE NULL
  END
$function$
;

-- ---- Result of a send -------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_transfer_send_result(
  p_transfer_id uuid,
  p_link_request_created boolean,
  p_replayed boolean
)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'transfer', jsonb_build_object(
      'id', ot.id,
      'status', ot.status,
      'sender_org_id', ot.sender_org_id,
      'sender_org_name', so.name,
      'recipient_org_id', ot.recipient_org_id,
      'recipient_org_name', ro.name,
      'link_request_id', ot.link_request_id,
      'created_at', ot.created_at
    ),
    'link_request_created', p_link_request_created,
    'replayed', p_replayed,
    'items', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'sub_batch_id', oti.sub_batch_id,
            'weight_grams', oti.weight_grams,
            'species_name', f.species_name,
            'collection_code', f.collection_code
          )
          ORDER BY oti.sub_batch_id
        )
        FROM public.ownership_transfer_item oti
        INNER JOIN public.sub_batches sb ON sb.id = oti.sub_batch_id
        CROSS JOIN LATERAL public.fn_transfer_source_facts(sb.batch_id) f
        WHERE oti.transfer_id = ot.id
      ),
      '[]'::jsonb
    )
  )
  FROM public.ownership_transfer ot
  INNER JOIN public.organisation so ON so.id = ot.sender_org_id
  INNER JOIN public.organisation ro ON ro.id = ot.recipient_org_id
  WHERE ot.id = p_transfer_id
$function$
;

-- ---- Authorising a read of a received batch (plan 2.7) ----------------------

-- Returns the chain of ownership_transfer_item ids that explain a received
-- batch, newest hop first: element 1 is the transfer that delivered
-- p_batch_id to the caller, element 2 the transfer that delivered the source
-- batch to that sender, and so on. The caller's organisation must own the
-- batch. Every hop's saved mapping is checked against the ledger: a forged
-- batches.received_transfer_item_id, or one pointing at another
-- organisation's transfer, finds nothing and raises P0002. An earlier hop that
-- fails its check ends the chain there instead of failing the read.
CREATE OR REPLACE FUNCTION public.fn_transfer_authorise_received_batch(p_batch_id uuid)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_org_id uuid := public.fn_transfer_resolve_caller('member');
  v_current public.batches;
  v_next public.batches;
  v_chain uuid[] := '{}'::uuid[];
  v_item_id uuid;
  v_source_batch_id uuid;
  v_sender_org_id uuid;
  v_depth integer := 0;
BEGIN
  SELECT b.*
    INTO v_current
  FROM public.batches b
  WHERE b.id = p_batch_id
    AND b.organisation_id = v_org_id
    AND b.received_transfer_item_id IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Received batch not found'
      USING ERRCODE = 'P0002';
  END IF;

  LOOP
    v_depth := v_depth + 1;
    EXIT WHEN v_depth > 25;

    v_item_id := NULL;

    SELECT oti.id, sti.batch_id, ot.sender_org_id
      INTO v_item_id, v_source_batch_id, v_sender_org_id
    FROM public.ownership_transfer_item oti
    INNER JOIN public.ownership_transfer ot ON ot.id = oti.transfer_id
    INNER JOIN public.seed_transfer_event ste ON ste.id = ot.transfer_event_id
    INNER JOIN public.seed_transfer_item sti ON sti.id = oti.seed_transfer_item_id
    INNER JOIN public.sub_batches received_bag ON received_bag.id = oti.received_sub_batch_id
    WHERE oti.seed_transfer_item_id = v_current.received_transfer_item_id
      AND oti.received_batch_id = v_current.id
      AND ot.status = 'completed'
      AND ot.recipient_org_id = v_current.organisation_id
      AND ste.kind = 'ownership_transfer'
      AND ste.sender_org_id = ot.sender_org_id
      AND ste.recipient_org_id = ot.recipient_org_id
      AND sti.transfer_event_id = ste.id
      AND sti.sub_batch_id = oti.sub_batch_id
      AND sti.owner_org_id = ot.sender_org_id
      AND received_bag.batch_id = v_current.id;

    IF v_item_id IS NULL THEN
      IF v_depth = 1 THEN
        RAISE EXCEPTION 'Received batch not found'
          USING ERRCODE = 'P0002';
      END IF;

      EXIT;
    END IF;

    v_chain := v_chain || v_item_id;

    SELECT b.*
      INTO v_next
    FROM public.batches b
    WHERE b.id = v_source_batch_id;

    -- The previous hop continues only through a batch the sender itself
    -- received, and owns.
    EXIT WHEN NOT FOUND
      OR v_next.received_transfer_item_id IS NULL
      OR v_next.organisation_id IS DISTINCT FROM v_sender_org_id;

    v_current := v_next;
  END LOOP;

  RETURN v_chain;
END;
$function$
;

-- =========================================================================
-- 2.4 Internal completion steps
-- =========================================================================

-- Closes a bag's open storage row because the seed is leaving the
-- organisation. A no-op when the bag is not stored. Unlike
-- fn_set_sub_batch_storage it does not ask who holds the bag, so a recipient
-- accepting a transfer can run it, and it does not raise on an unstored bag.
-- The caller already holds the bag lock; the bag is locked again here so the
-- bag-then-storage-row order holds for any other caller.
CREATE OR REPLACE FUNCTION public.fn_close_storage_for_transfer(
  p_sub_batch_id uuid,
  p_at timestamptz,
  p_note text
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_at timestamptz := COALESCE(p_at, now());
BEGIN
  PERFORM 1
  FROM public.sub_batches sb
  WHERE sb.id = p_sub_batch_id
  FOR UPDATE;

  UPDATE public.batch_storage bs
  SET moved_out_at = GREATEST(v_at, bs.stored_at),
      notes = p_note
  WHERE bs.sub_batch_id = p_sub_batch_id
    AND bs.moved_out_at IS NULL;
END;
$function$
;

-- Completes a pending_link transfer. Internal: called from
-- fn_send_bags_for_transfer (immediate send) and
-- fn_respond_transfer_link_request (accept), which have taken the locks of
-- plan 2.1 and checked that the transfer is pending_link. It runs under
-- either party's auth.uid() and does no caller-org checks of its own.
-- All of it is one transaction: any failure rolls back the whole completion.
CREATE OR REPLACE FUNCTION public.fn_complete_ownership_transfer(p_transfer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_now timestamptz := now();
  v_transfer public.ownership_transfer;
  v_sender_name text;
  v_recipient_name text;
  v_event_id uuid;
  v_item public.ownership_transfer_item;
  v_source_batch public.batches;
  v_facts record;
  v_holder_org_id uuid;
  v_moved_weight numeric;
  v_seed_item_id uuid;
  v_recipient_species_id uuid;
  v_new_batch_id uuid;
  v_new_bag_id uuid;
  v_prior_item_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '28000';
  END IF;

  SELECT ot.*
    INTO v_transfer
  FROM public.ownership_transfer ot
  WHERE ot.id = p_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_transfer.status IS DISTINCT FROM 'pending_link' THEN
    RAISE EXCEPTION 'Transfer is not pending'
      USING ERRCODE = '55000';
  END IF;

  SELECT o.name INTO v_sender_name
  FROM public.organisation o WHERE o.id = v_transfer.sender_org_id;

  SELECT o.name INTO v_recipient_name
  FROM public.organisation o WHERE o.id = v_transfer.recipient_org_id;

  -- 1. Release the reservations first, so the guards on reserved bags do not
  -- block this completion's own writes.
  DELETE FROM public.sub_batch_reservation r
  WHERE r.transfer_id = p_transfer_id;

  -- 2. The ledger event.
  INSERT INTO public.seed_transfer_event (
    sender_org_id,
    recipient_org_id,
    kind,
    effective_at,
    recorded_at,
    recorded_by
  ) VALUES (
    v_transfer.sender_org_id,
    v_transfer.recipient_org_id,
    'ownership_transfer',
    v_now,
    v_now,
    v_user_id
  )
  RETURNING id INTO v_event_id;

  -- 3. One pass per item, in bag id order.
  FOR v_item IN
    SELECT oti.*
    FROM public.ownership_transfer_item oti
    WHERE oti.transfer_id = p_transfer_id
    ORDER BY oti.sub_batch_id
  LOOP
    SELECT b.*
      INTO v_source_batch
    FROM public.sub_batches sb
    INNER JOIN public.batches b ON b.id = sb.batch_id
    WHERE sb.id = v_item.sub_batch_id;

    SELECT sb.held_by_org_id, sbcw.current_weight
      INTO v_holder_org_id, v_moved_weight
    FROM public.sub_batches sb
    INNER JOIN public.sub_batch_current_weight sbcw ON sbcw.id = sb.id
    WHERE sb.id = v_item.sub_batch_id;

    IF v_holder_org_id IS DISTINCT FROM v_transfer.sender_org_id
       OR v_source_batch.organisation_id IS DISTINCT FROM v_transfer.sender_org_id
       OR v_moved_weight IS NULL
       OR v_moved_weight <= 0 THEN
      RAISE EXCEPTION 'Bag % can no longer be transferred', v_item.sub_batch_id
        USING ERRCODE = '55000';
    END IF;

    -- 3.1 Close storage.
    PERFORM public.fn_close_storage_for_transfer(
      v_item.sub_batch_id,
      v_now,
      'Transferred to ' || v_recipient_name
    );

    -- 3.2 The ledger item for the source bag, owned by the sender.
    INSERT INTO public.seed_transfer_item (
      transfer_event_id,
      sub_batch_id,
      batch_id,
      owner_org_id,
      weight_grams
    ) VALUES (
      v_event_id,
      v_item.sub_batch_id,
      v_source_batch.id,
      v_transfer.sender_org_id,
      v_moved_weight
    )
    RETURNING id INTO v_seed_item_id;

    -- 3.3 The recipient's species row: ala_guid first, then a
    -- case-insensitive name, otherwise a new row copying name, ala_guid and
    -- indigenous_name.
    SELECT f.*
      INTO v_facts
    FROM public.fn_transfer_source_facts(v_source_batch.id) f;

    v_recipient_species_id := NULL;

    IF v_facts.species_id IS NOT NULL THEN
      IF v_facts.species_ala_guid IS NOT NULL THEN
        SELECT s.id
          INTO v_recipient_species_id
        FROM public.species s
        WHERE s.organisation_id = v_transfer.recipient_org_id
          AND s.ala_guid = v_facts.species_ala_guid
        ORDER BY s.created_at, s.id
        LIMIT 1;
      END IF;

      IF v_recipient_species_id IS NULL THEN
        SELECT s.id
          INTO v_recipient_species_id
        FROM public.species s
        WHERE s.organisation_id = v_transfer.recipient_org_id
          AND lower(s.name) = lower(v_facts.species_name)
        ORDER BY s.created_at, s.id
        LIMIT 1;
      END IF;

      IF v_recipient_species_id IS NULL THEN
        -- The recipient row is only locked FOR SHARE, so two senders can reach
        -- this point together: let the loser of the unique (organisation,
        -- name) or (organisation, ala_guid) index find the winner's row.
        INSERT INTO public.species (organisation_id, name, ala_guid, indigenous_name)
        VALUES (
          v_transfer.recipient_org_id,
          v_facts.species_name,
          v_facts.species_ala_guid,
          v_facts.species_indigenous_name
        )
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_recipient_species_id;

        IF v_recipient_species_id IS NULL THEN
          SELECT s.id
            INTO v_recipient_species_id
          FROM public.species s
          WHERE s.organisation_id = v_transfer.recipient_org_id
            AND (
              (v_facts.species_ala_guid IS NOT NULL AND s.ala_guid = v_facts.species_ala_guid)
              OR lower(s.name) = lower(v_facts.species_name)
            )
          ORDER BY s.created_at, s.id
          LIMIT 1;
        END IF;
      END IF;
    END IF;

    -- 3.4 The received batch. Provenance columns are set in the INSERT: the
    -- guard allows a definer to insert them and forbids any later change.
    INSERT INTO public.batches (
      organisation_id,
      collection_id,
      species_id,
      code,
      weight_grams,
      received_transfer_item_id,
      source_collection_code,
      source_ibra_code,
      source_collection_year
    ) VALUES (
      v_transfer.recipient_org_id,
      NULL,
      v_recipient_species_id,
      v_facts.collection_code,
      v_moved_weight,
      v_seed_item_id,
      v_facts.collection_code,
      v_facts.ibra_code,
      v_facts.collection_year
    )
    RETURNING id INTO v_new_batch_id;

    INSERT INTO public.batch_custody (
      batch_id,
      organisation_id,
      transferred_by,
      previous_organisation_id,
      notes
    ) VALUES (
      v_new_batch_id,
      v_transfer.recipient_org_id,
      v_user_id,
      v_transfer.sender_org_id,
      'Received by ownership transfer'
    );

    -- 3.5 The received bag.
    INSERT INTO public.sub_batches (
      batch_id,
      container_id,
      weight_grams,
      notes,
      held_by_org_id
    ) VALUES (
      v_new_batch_id,
      NULL,
      v_moved_weight,
      'Received by ownership transfer',
      v_transfer.recipient_org_id
    )
    RETURNING id INTO v_new_bag_id;

    -- 3.6 The source bag goes to zero. It stays in the sender's batch, so
    -- active_sub_batches drops it.
    INSERT INTO public.batch_weight_adjustments (
      sub_batch_id,
      weight_grams,
      reason,
      created_by,
      kind,
      transfer_item_id
    ) VALUES (
      v_item.sub_batch_id,
      -v_moved_weight,
      'Transferred to ' || v_recipient_name,
      v_user_id,
      'transfer_out',
      v_seed_item_id
    );

    -- 3.7 The mapping, in one UPDATE.
    UPDATE public.ownership_transfer_item
    SET seed_transfer_item_id = v_seed_item_id,
        received_batch_id = v_new_batch_id,
        received_sub_batch_id = v_new_bag_id
    WHERE id = v_item.id;

    -- 3.8 The lineage edge. The validator needs 3.7 and a transfer that is
    -- still pending_link.
    INSERT INTO public.sub_batch_lineage (
      source_sub_batch_id,
      derived_sub_batch_id,
      operation_kind,
      operation_id,
      created_by
    ) VALUES (
      v_item.sub_batch_id,
      v_new_bag_id,
      'transfer',
      v_seed_item_id,
      v_user_id
    );

    -- 3.9a Test results, captured now. The latest live test of each type or
    -- quality subtype on the source batch, as named fields only.
    INSERT INTO public.ownership_transfer_test_snapshot (
      ownership_transfer_item_id,
      hop,
      source_test_id,
      type,
      quality_test_type,
      statistics,
      result,
      tested_at,
      performed_by_organisation_id
    )
    SELECT
      v_item.id,
      0,
      w.id,
      w.type,
      w.quality_test_type,
      public.fn_transfer_project_statistics(w.statistics),
      public.fn_transfer_project_result(w.type, w.result),
      w.tested_at,
      COALESCE(w.performed_by_organisation_id, v_transfer.sender_org_id)
    FROM (
      SELECT DISTINCT ON (t.type, public.fn_transfer_quality_test_type(t.type, t.result))
        t.id,
        t.type,
        public.fn_transfer_quality_test_type(t.type, t.result) AS quality_test_type,
        t.statistics,
        t.result,
        t.tested_at,
        t.performed_by_organisation_id
      FROM public.tests t
      WHERE t.batch_id = v_source_batch.id
        AND t.deleted_at IS NULL
      ORDER BY
        t.type,
        public.fn_transfer_quality_test_type(t.type, t.result),
        t.tested_at DESC NULLS LAST,
        t.id DESC
    ) w;

    -- 3.9b Storage periods, captured now. Walk the source bag and its split
    -- and merge ancestors. Each ancestor's periods end where the transferred
    -- seed left that bag: the lineage edge's time, or this completion for the
    -- source bag itself. The walk does not cross a transfer or cleaning edge.
    -- An ancestor reached on several paths keeps its latest cutoff, so each
    -- storage row yields one period.
    WITH RECURSIVE ancestors (sub_batch_id, cutoff) AS (
      SELECT v_item.sub_batch_id, v_now
      UNION
      SELECT lineage.source_sub_batch_id, LEAST(a.cutoff, lineage.created_at)
      FROM ancestors a
      INNER JOIN public.sub_batch_lineage lineage
        ON lineage.derived_sub_batch_id = a.sub_batch_id
       AND lineage.operation_kind IN ('split', 'merge')
    ),
    caps AS (
      SELECT a.sub_batch_id, max(a.cutoff) AS cutoff
      FROM ancestors a
      GROUP BY a.sub_batch_id
    ),
    periods AS (
      SELECT
        bs.stored_at AS started_at,
        GREATEST(bs.stored_at, LEAST(COALESCE(bs.moved_out_at, c.cutoff), c.cutoff)) AS ended_at
      FROM caps c
      INNER JOIN public.batch_storage bs ON bs.sub_batch_id = c.sub_batch_id
      WHERE bs.stored_at IS NOT NULL
        AND bs.stored_at < c.cutoff
    )
    INSERT INTO public.ownership_transfer_storage_snapshot (
      ownership_transfer_item_id,
      hop,
      started_at,
      ended_at,
      duration
    )
    SELECT v_item.id, 0, p.started_at, p.ended_at, p.ended_at - p.started_at
    FROM periods p;

    -- 3.9c Onward transfer: when the source batch is itself a receipt, carry
    -- that receipt's captured tests and storage periods forward with the hop
    -- number incremented. The receipt must be a completed transfer into the
    -- sender, mapped to exactly this batch.
    v_prior_item_id := NULL;

    IF v_source_batch.received_transfer_item_id IS NOT NULL THEN
      SELECT prior.id
        INTO v_prior_item_id
      FROM public.ownership_transfer_item prior
      INNER JOIN public.ownership_transfer prior_transfer
        ON prior_transfer.id = prior.transfer_id
      WHERE prior.seed_transfer_item_id = v_source_batch.received_transfer_item_id
        AND prior.received_batch_id = v_source_batch.id
        AND prior_transfer.status = 'completed'
        AND prior_transfer.recipient_org_id = v_transfer.sender_org_id;
    END IF;

    IF v_prior_item_id IS NOT NULL THEN
      INSERT INTO public.ownership_transfer_test_snapshot (
        ownership_transfer_item_id,
        hop,
        source_test_id,
        type,
        quality_test_type,
        statistics,
        result,
        tested_at,
        performed_by_organisation_id
      )
      SELECT
        v_item.id,
        s.hop + 1,
        s.source_test_id,
        s.type,
        s.quality_test_type,
        s.statistics,
        s.result,
        s.tested_at,
        s.performed_by_organisation_id
      FROM public.ownership_transfer_test_snapshot s
      WHERE s.ownership_transfer_item_id = v_prior_item_id;

      INSERT INTO public.ownership_transfer_storage_snapshot (
        ownership_transfer_item_id,
        hop,
        started_at,
        ended_at,
        duration
      )
      SELECT v_item.id, s.hop + 1, s.started_at, s.ended_at, s.duration
      FROM public.ownership_transfer_storage_snapshot s
      WHERE s.ownership_transfer_item_id = v_prior_item_id;
    END IF;
  END LOOP;

  -- 4. Mark the transfer completed: status and event in one UPDATE.
  UPDATE public.ownership_transfer
  SET status = 'completed',
      transfer_event_id = v_event_id,
      resolved_at = v_now,
      resolved_by = v_user_id
  WHERE id = p_transfer_id;
END;
$function$
;

-- =========================================================================
-- 2.2 Directory
-- =========================================================================

-- Organisations that accept transfers, other than the caller's own. Names
-- only. is_linked: an accepted transfer link from the caller to that
-- organisation exists. has_pending_request: the caller has an open transfer
-- link request to it.
CREATE OR REPLACE FUNCTION public.fn_transfer_directory()
 RETURNS TABLE(id uuid, name text, is_linked boolean, has_pending_request boolean)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
DECLARE
  v_org_id uuid := public.fn_transfer_resolve_caller('member');
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.name::text,
    EXISTS (
      SELECT 1
      FROM public.organisation_link ol
      WHERE ol.requesting_org_id = v_org_id
        AND ol.provider_org_id = o.id
        AND ol.kind = 'transfer'
    ),
    EXISTS (
      SELECT 1
      FROM public.organisation_link_request r
      WHERE r.requesting_org_id = v_org_id
        AND r.provider_org_id = o.id
        AND r.kind = 'transfer'
        AND r.accepted_at IS NULL
        AND r.declined_at IS NULL
        AND r.cancelled_at IS NULL
    )
  FROM public.organisation o
  WHERE o.accepts_transfers
    AND o.id <> v_org_id
  ORDER BY o.name, o.id;
END;
$function$
;

-- =========================================================================
-- 2.3 Send
-- =========================================================================

-- p_bags: [{"sub_batch_id": uuid, "sample_weight_grams": number|null}, ...]
-- Returns {transfer, link_request_created, replayed, items}; see the contract
-- in the plan and the edge function send_bags_for_transfer.
-- Recipient not found: P0002. Recipient not opted in: 42501.
CREATE OR REPLACE FUNCTION public.fn_send_bags_for_transfer(
  p_recipient_org_id uuid,
  p_bags jsonb,
  p_notes text,
  p_request_id uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_caller_org_id uuid;
  v_notes text := NULLIF(btrim(p_notes), '');
  v_item jsonb;
  v_raw text;
  v_bag_id uuid;
  v_sample_weight numeric;
  v_bag_ids uuid[] := '{}'::uuid[];
  v_entries jsonb := '[]'::jsonb;
  v_requests jsonb;
  v_fingerprint jsonb;
  v_existing public.ownership_transfer;
  v_recipient_accepts boolean;
  v_problem_code text;
  v_problem_message text;
  v_current_weight numeric;
  v_transfer_id uuid;
  v_split_ids uuid[];
  v_moved_bag_id uuid;
  v_moved_weight numeric;
  v_link_request_id uuid;
  v_link_request_created boolean := false;
BEGIN
  -- 1. Gate: inventory permission, a request id and a different recipient.
  v_caller_org_id := public.fn_transfer_resolve_caller('inventory');

  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'A request id is required'
      USING ERRCODE = '22023';
  END IF;

  IF p_recipient_org_id IS NULL THEN
    RAISE EXCEPTION 'A recipient organisation is required'
      USING ERRCODE = '22023';
  END IF;

  IF p_recipient_org_id = v_caller_org_id THEN
    RAISE EXCEPTION 'Seed cannot be transferred to your own organisation'
      USING ERRCODE = '22023';
  END IF;

  -- Request shape. Identifiers and numbers are cast defensively so that bad
  -- input surfaces as 22023 rather than a raw cast error.
  IF jsonb_typeof(p_bags) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_bags) = 0 THEN
    RAISE EXCEPTION 'At least one bag is required'
      USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT jsonb_array_elements(p_bags) LOOP
    v_sample_weight := NULL;

    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Every entry must be an object describing one bag'
        USING ERRCODE = '22023';
    END IF;

    v_raw := NULLIF(v_item ->> 'sub_batch_id', '');

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
      RAISE EXCEPTION 'A bag may appear only once in a transfer request'
        USING ERRCODE = '22023';
    END IF;

    v_raw := NULLIF(v_item ->> 'sample_weight_grams', '');

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

    v_bag_ids := v_bag_ids || v_bag_id;
    v_entries := v_entries || jsonb_build_array(
      jsonb_build_object(
        'sub_batch_id', v_bag_id,
        'sample_weight_grams', v_sample_weight
      )
    );
  END LOOP;

  -- Work in bag id order from here on. This is also the normalised form that
  -- goes into the replay fingerprint.
  SELECT jsonb_agg(e ORDER BY (e ->> 'sub_batch_id')::uuid)
    INTO v_requests
  FROM jsonb_array_elements(v_entries) AS e;

  v_fingerprint := jsonb_build_object(
    'recipient_org_id', p_recipient_org_id,
    'bags', v_requests,
    'notes', v_notes
  );

  -- 2. Lock the recipient and the pair (plan 2.1 steps 1 and 2), then look
  -- for a replay before checking anything that can have changed since.
  PERFORM 1
  FROM public.organisation o
  WHERE o.id = p_recipient_org_id
  FOR SHARE;

  PERFORM public.fn_transfer_lock_pair(v_caller_org_id, p_recipient_org_id);

  SELECT ot.*
    INTO v_existing
  FROM public.ownership_transfer ot
  WHERE ot.sender_org_id = v_caller_org_id
    AND ot.request_id = p_request_id;

  IF FOUND THEN
    IF v_existing.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'This request id was already used with different details'
        USING ERRCODE = '22023';
    END IF;

    RETURN public.fn_transfer_send_result(v_existing.id, false, true);
  END IF;

  SELECT o.accepts_transfers
    INTO v_recipient_accepts
  FROM public.organisation o
  WHERE o.id = p_recipient_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recipient organisation not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT v_recipient_accepts THEN
    RAISE EXCEPTION 'Recipient organisation is not accepting transfers'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Lock bags, then their batches, in id order, then validate every bag
  -- before writing anything.
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

  FOR v_item IN SELECT jsonb_array_elements(v_requests) LOOP
    v_bag_id := (v_item ->> 'sub_batch_id')::uuid;
    v_sample_weight := NULLIF(v_item ->> 'sample_weight_grams', '')::numeric;

    SELECT p.code, p.message
      INTO v_problem_code, v_problem_message
    FROM public.fn_transfer_bag_problem(v_bag_id, v_caller_org_id, NULL, NULL) p
    LIMIT 1;

    IF v_problem_code IS NOT NULL THEN
      RAISE EXCEPTION '%', v_problem_message
        USING ERRCODE = v_problem_code;
    END IF;

    SELECT sbcw.current_weight
      INTO v_current_weight
    FROM public.sub_batch_current_weight sbcw
    WHERE sbcw.id = v_bag_id;

    -- Strictly less: sending the whole bag is what omitting the sample weight
    -- means, and a split that leaves the source at zero would strand it.
    IF v_sample_weight IS NOT NULL AND v_sample_weight >= v_current_weight THEN
      RAISE EXCEPTION
        'Sample weight must be less than the current weight of bag %', v_bag_id
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- 4. Claim the request id before any split or reservation. The pair lock
  -- serialises duplicates to the same recipient; a duplicate id aimed at a
  -- different recipient meets the unique key instead and raises 23505.
  INSERT INTO public.ownership_transfer (
    sender_org_id,
    recipient_org_id,
    status,
    notes,
    request_id,
    request_fingerprint,
    created_by
  ) VALUES (
    v_caller_org_id,
    p_recipient_org_id,
    'pending_link',
    v_notes,
    p_request_id,
    v_fingerprint,
    v_user_id
  )
  RETURNING id INTO v_transfer_id;

  FOR v_item IN SELECT jsonb_array_elements(v_requests) LOOP
    v_bag_id := (v_item ->> 'sub_batch_id')::uuid;
    v_sample_weight := NULLIF(v_item ->> 'sample_weight_grams', '')::numeric;

    IF v_sample_weight IS NOT NULL THEN
      -- The child is the bag that moves.
      v_split_ids := public.fn_split_sub_batch(
        v_bag_id,
        jsonb_build_array(
          jsonb_build_object(
            'weight_grams', v_sample_weight,
            'notes', 'Portion sent for transfer'
          )
        )
      );

      v_moved_bag_id := v_split_ids[1];
    ELSE
      v_moved_bag_id := v_bag_id;
    END IF;

    SELECT sbcw.current_weight
      INTO v_moved_weight
    FROM public.sub_batch_current_weight sbcw
    WHERE sbcw.id = v_moved_bag_id;

    INSERT INTO public.ownership_transfer_item (
      transfer_id,
      sub_batch_id,
      weight_grams
    ) VALUES (
      v_transfer_id,
      v_moved_bag_id,
      v_moved_weight
    );
  END LOOP;

  -- 5. Branch on link state, read under the pair lock.
  IF EXISTS (
    SELECT 1
    FROM public.organisation_link ol
    WHERE ol.requesting_org_id = v_caller_org_id
      AND ol.provider_org_id = p_recipient_org_id
      AND ol.kind = 'transfer'
  ) THEN
    PERFORM public.fn_complete_ownership_transfer(v_transfer_id);
  ELSE
    SELECT r.id
      INTO v_link_request_id
    FROM public.organisation_link_request r
    WHERE r.requesting_org_id = v_caller_org_id
      AND r.provider_org_id = p_recipient_org_id
      AND r.kind = 'transfer'
      AND r.accepted_at IS NULL
      AND r.declined_at IS NULL
      AND r.cancelled_at IS NULL
    FOR UPDATE;

    IF v_link_request_id IS NULL THEN
      INSERT INTO public.organisation_link_request (
        requesting_org_id,
        provider_org_id,
        created_by,
        kind
      ) VALUES (
        v_caller_org_id,
        p_recipient_org_id,
        v_user_id,
        'transfer'
      )
      RETURNING id INTO v_link_request_id;

      v_link_request_created := true;
    END IF;

    UPDATE public.ownership_transfer
    SET link_request_id = v_link_request_id
    WHERE id = v_transfer_id;

    INSERT INTO public.sub_batch_reservation (sub_batch_id, transfer_id)
    SELECT oti.sub_batch_id, v_transfer_id
    FROM public.ownership_transfer_item oti
    WHERE oti.transfer_id = v_transfer_id;
  END IF;

  -- 6.
  RETURN public.fn_transfer_send_result(v_transfer_id, v_link_request_created, false);
END;
$function$
;

-- =========================================================================
-- 2.5 Respond to a transfer link request
-- =========================================================================

-- Caller: an Admin of the recipient organisation. Returns the contract in the
-- plan. cancelled_transfer_ids holds the transfers closed without completing:
-- on accept, those whose bags failed re-validation; on decline, every
-- transfer that was waiting on the request. A request that was already
-- accepted, declined or cancelled returns already_resolved = true with the
-- stored outcome and no transfers.
CREATE OR REPLACE FUNCTION public.fn_respond_transfer_link_request(p_request_id uuid, p_accept boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_caller_org_id uuid;
  v_request public.organisation_link_request;
  v_sender_name text;
  v_recipient_name text;
  v_accepts boolean;
  v_transfer record;
  v_bag record;
  v_problem_code text;
  v_problem_message text;
  v_failed boolean;
  v_items jsonb;
  v_completed jsonb := '[]'::jsonb;
  v_cancelled uuid[] := '{}'::uuid[];
BEGIN
  IF p_request_id IS NULL OR p_accept IS NULL THEN
    RAISE EXCEPTION 'A request id and a decision are required'
      USING ERRCODE = '22023';
  END IF;

  v_caller_org_id := public.fn_transfer_resolve_caller('admin');

  SELECT r.*
    INTO v_request
  FROM public.organisation_link_request r
  WHERE r.id = p_request_id
    AND r.kind = 'transfer';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer link request not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_request.provider_org_id IS DISTINCT FROM v_caller_org_id THEN
    RAISE EXCEPTION 'Only an Admin of the recipient organisation can respond to this request'
      USING ERRCODE = '42501';
  END IF;

  -- Locks (plan 2.1): recipient organisation row, pair lock, then the
  -- request, the pending transfers and their bags and batches.
  SELECT o.accepts_transfers
    INTO v_accepts
  FROM public.organisation o
  WHERE o.id = v_request.provider_org_id
  FOR SHARE;

  PERFORM public.fn_transfer_lock_pair(v_request.requesting_org_id, v_request.provider_org_id);

  SELECT r.*
    INTO v_request
  FROM public.organisation_link_request r
  WHERE r.id = p_request_id
  FOR UPDATE;

  SELECT o.name INTO v_sender_name
  FROM public.organisation o WHERE o.id = v_request.requesting_org_id;

  SELECT o.name INTO v_recipient_name
  FROM public.organisation o WHERE o.id = v_request.provider_org_id;

  IF v_request.accepted_at IS NOT NULL
     OR v_request.declined_at IS NOT NULL
     OR v_request.cancelled_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'request_id', p_request_id,
      'accepted', v_request.accepted_at IS NOT NULL,
      'requesting_org_id', v_request.requesting_org_id,
      'requesting_org_name', v_sender_name,
      'recipient_org_id', v_request.provider_org_id,
      'recipient_org_name', v_recipient_name,
      'requested_by', v_request.created_by,
      'already_resolved', true,
      'completed_transfers', '[]'::jsonb,
      'cancelled_transfer_ids', '[]'::jsonb
    );
  END IF;

  PERFORM 1
  FROM public.ownership_transfer ot
  WHERE ot.link_request_id = p_request_id
    AND ot.status = 'pending_link'
  ORDER BY ot.id
  FOR UPDATE;

  PERFORM 1
  FROM public.sub_batches sb
  WHERE sb.id IN (
    SELECT oti.sub_batch_id
    FROM public.ownership_transfer_item oti
    INNER JOIN public.ownership_transfer ot ON ot.id = oti.transfer_id
    WHERE ot.link_request_id = p_request_id
      AND ot.status = 'pending_link'
  )
  ORDER BY sb.id
  FOR UPDATE;

  PERFORM 1
  FROM public.batches b
  WHERE b.id IN (
    SELECT sb.batch_id
    FROM public.sub_batches sb
    WHERE sb.id IN (
      SELECT oti.sub_batch_id
      FROM public.ownership_transfer_item oti
      INNER JOIN public.ownership_transfer ot ON ot.id = oti.transfer_id
      WHERE ot.link_request_id = p_request_id
        AND ot.status = 'pending_link'
    )
  )
  ORDER BY b.id
  FOR UPDATE;

  IF p_accept THEN
    IF NOT v_accepts THEN
      RAISE EXCEPTION 'Your organisation is not accepting transfers'
        USING ERRCODE = '55000';
    END IF;

    -- A dormant link from an earlier acceptance may already exist.
    INSERT INTO public.organisation_link (
      requesting_org_id,
      provider_org_id,
      kind,
      created_by
    ) VALUES (
      v_request.requesting_org_id,
      v_request.provider_org_id,
      'transfer',
      v_user_id
    )
    ON CONFLICT (requesting_org_id, provider_org_id, kind) DO NOTHING;

    UPDATE public.organisation_link_request
    SET accepted_at = now(),
        accepted_by = v_user_id
    WHERE id = p_request_id;

    FOR v_transfer IN
      SELECT ot.id
      FROM public.ownership_transfer ot
      WHERE ot.link_request_id = p_request_id
        AND ot.status = 'pending_link'
      ORDER BY ot.created_at, ot.id
    LOOP
      -- Re-validate the reservation and every eligibility rule of 2.3. A bag
      -- that fails cancels its transfer instead of failing the accept.
      v_failed := false;

      FOR v_bag IN
        SELECT oti.sub_batch_id, oti.weight_grams
        FROM public.ownership_transfer_item oti
        WHERE oti.transfer_id = v_transfer.id
        ORDER BY oti.sub_batch_id
      LOOP
        SELECT p.code, p.message
          INTO v_problem_code, v_problem_message
        FROM public.fn_transfer_bag_problem(
          v_bag.sub_batch_id,
          v_request.requesting_org_id,
          v_transfer.id,
          v_bag.weight_grams
        ) p
        LIMIT 1;

        IF v_problem_code IS NOT NULL THEN
          v_failed := true;
          EXIT;
        END IF;
      END LOOP;

      IF v_failed THEN
        UPDATE public.ownership_transfer
        SET status = 'cancelled',
            resolved_at = now(),
            resolved_by = v_user_id
        WHERE id = v_transfer.id;

        DELETE FROM public.sub_batch_reservation r
        WHERE r.transfer_id = v_transfer.id;

        v_cancelled := v_cancelled || v_transfer.id;
      ELSE
        PERFORM public.fn_complete_ownership_transfer(v_transfer.id);

        SELECT COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'weight_grams', oti.weight_grams,
              'species_name', s.name,
              'collection_code', b.source_collection_code
            )
            ORDER BY oti.sub_batch_id
          ),
          '[]'::jsonb
        )
          INTO v_items
        FROM public.ownership_transfer_item oti
        INNER JOIN public.batches b ON b.id = oti.received_batch_id
        LEFT JOIN public.species s ON s.id = b.species_id
        WHERE oti.transfer_id = v_transfer.id;

        v_completed := v_completed || jsonb_build_array(
          jsonb_build_object('transfer_id', v_transfer.id, 'items', v_items)
        );
      END IF;
    END LOOP;
  ELSE
    WITH declined AS (
      UPDATE public.ownership_transfer
      SET status = 'declined',
          resolved_at = now(),
          resolved_by = v_user_id
      WHERE link_request_id = p_request_id
        AND status = 'pending_link'
      RETURNING id
    )
    SELECT COALESCE(array_agg(d.id), '{}'::uuid[])
      INTO v_cancelled
    FROM declined d;

    DELETE FROM public.sub_batch_reservation r
    WHERE r.transfer_id = ANY (v_cancelled);

    UPDATE public.organisation_link_request
    SET declined_at = now(),
        declined_by = v_user_id
    WHERE id = p_request_id;
  END IF;

  RETURN jsonb_build_object(
    'request_id', p_request_id,
    'accepted', p_accept,
    'requesting_org_id', v_request.requesting_org_id,
    'requesting_org_name', v_sender_name,
    'recipient_org_id', v_request.provider_org_id,
    'recipient_org_name', v_recipient_name,
    'requested_by', v_request.created_by,
    'already_resolved', false,
    'completed_transfers', v_completed,
    'cancelled_transfer_ids', to_jsonb(v_cancelled)
  );
END;
$function$
;

-- =========================================================================
-- 2.6 Cancel
-- =========================================================================

-- The sender (inventory permission) cancels a transfer that is still
-- pending_link. Returns {transfer_id, status, link_request_cancelled,
-- already_cancelled}. Cancelling a transfer that is already cancelled is a
-- no-op; a completed or declined one raises 55000. A split-off portion stays
-- as its own bag.
CREATE OR REPLACE FUNCTION public.fn_cancel_ownership_transfer(p_transfer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_caller_org_id uuid;
  v_transfer public.ownership_transfer;
  v_link_request_cancelled boolean := false;
BEGIN
  IF p_transfer_id IS NULL THEN
    RAISE EXCEPTION 'A transfer id is required'
      USING ERRCODE = '22023';
  END IF;

  v_caller_org_id := public.fn_transfer_resolve_caller('inventory');

  SELECT ot.*
    INTO v_transfer
  FROM public.ownership_transfer ot
  WHERE ot.id = p_transfer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_transfer.sender_org_id IS DISTINCT FROM v_caller_org_id THEN
    RAISE EXCEPTION 'Only the sending organisation can cancel a transfer'
      USING ERRCODE = '42501';
  END IF;

  -- Locks (plan 2.1).
  PERFORM 1
  FROM public.organisation o
  WHERE o.id = v_transfer.recipient_org_id
  FOR SHARE;

  PERFORM public.fn_transfer_lock_pair(v_transfer.sender_org_id, v_transfer.recipient_org_id);

  SELECT ot.*
    INTO v_transfer
  FROM public.ownership_transfer ot
  WHERE ot.id = p_transfer_id
  FOR UPDATE;

  IF v_transfer.status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'transfer_id', p_transfer_id,
      'status', 'cancelled',
      'link_request_cancelled', false,
      'already_cancelled', true
    );
  END IF;

  IF v_transfer.status IS DISTINCT FROM 'pending_link' THEN
    RAISE EXCEPTION 'Transfer is no longer pending'
      USING ERRCODE = '55000';
  END IF;

  PERFORM 1
  FROM public.sub_batches sb
  WHERE sb.id IN (
    SELECT oti.sub_batch_id
    FROM public.ownership_transfer_item oti
    WHERE oti.transfer_id = p_transfer_id
  )
  ORDER BY sb.id
  FOR UPDATE;

  UPDATE public.ownership_transfer
  SET status = 'cancelled',
      resolved_at = now(),
      resolved_by = v_user_id
  WHERE id = p_transfer_id;

  DELETE FROM public.sub_batch_reservation r
  WHERE r.transfer_id = p_transfer_id;

  -- Under the same pair lock, so a concurrent send either attached before
  -- this point or opens a new request after it.
  IF v_transfer.link_request_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.ownership_transfer remaining
       WHERE remaining.link_request_id = v_transfer.link_request_id
         AND remaining.status = 'pending_link'
     ) THEN
    UPDATE public.organisation_link_request
    SET cancelled_at = now()
    WHERE id = v_transfer.link_request_id
      AND accepted_at IS NULL
      AND declined_at IS NULL
      AND cancelled_at IS NULL;

    v_link_request_cancelled := FOUND;
  END IF;

  RETURN jsonb_build_object(
    'transfer_id', p_transfer_id,
    'status', 'cancelled',
    'link_request_cancelled', v_link_request_cancelled,
    'already_cancelled', false
  );
END;
$function$
;

-- =========================================================================
-- 2.9 Incoming transfer availability
-- =========================================================================

-- Admin only. Returns {accepts_transfers, changed, cancelled_request_ids,
-- cancelled_transfer_ids}. Opting out cancels every open incoming transfer
-- request and its pending transfers and releases their reservations; accepted
-- links are kept and work again on opt-in. Cancelled requests stay closed.
CREATE OR REPLACE FUNCTION public.fn_set_accepts_transfers(p_accepts boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_org_id uuid;
  v_current boolean;
  v_sender_id uuid;
  v_cancelled_requests uuid[] := '{}'::uuid[];
  v_cancelled_transfers uuid[] := '{}'::uuid[];
BEGIN
  IF p_accepts IS NULL THEN
    RAISE EXCEPTION 'A value is required'
      USING ERRCODE = '22023';
  END IF;

  v_org_id := public.fn_transfer_resolve_caller('admin');

  -- Plan 2.1 step 1: the settings RPC takes the stronger lock, which waits
  -- for in-flight sends and accepts (FOR SHARE) and holds off new ones.
  SELECT o.accepts_transfers
    INTO v_current
  FROM public.organisation o
  WHERE o.id = v_org_id
  FOR NO KEY UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organisation not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_current = p_accepts THEN
    RETURN jsonb_build_object(
      'accepts_transfers', v_current,
      'changed', false,
      'cancelled_request_ids', '[]'::jsonb,
      'cancelled_transfer_ids', '[]'::jsonb
    );
  END IF;

  IF p_accepts THEN
    UPDATE public.organisation
    SET accepts_transfers = true
    WHERE id = v_org_id;

    RETURN jsonb_build_object(
      'accepts_transfers', true,
      'changed', true,
      'cancelled_request_ids', '[]'::jsonb,
      'cancelled_transfer_ids', '[]'::jsonb
    );
  END IF;

  -- Opt-out. Pair locks in stable (sender id) order.
  FOR v_sender_id IN
    SELECT s.sender_id
    FROM (
      SELECT r.requesting_org_id AS sender_id
      FROM public.organisation_link_request r
      WHERE r.provider_org_id = v_org_id
        AND r.kind = 'transfer'
        AND r.accepted_at IS NULL
        AND r.declined_at IS NULL
        AND r.cancelled_at IS NULL
      UNION
      SELECT ot.sender_org_id
      FROM public.ownership_transfer ot
      WHERE ot.recipient_org_id = v_org_id
        AND ot.status = 'pending_link'
    ) s
    ORDER BY s.sender_id
  LOOP
    PERFORM public.fn_transfer_lock_pair(v_sender_id, v_org_id);
  END LOOP;

  PERFORM 1
  FROM public.ownership_transfer ot
  WHERE ot.recipient_org_id = v_org_id
    AND ot.status = 'pending_link'
  ORDER BY ot.id
  FOR UPDATE;

  PERFORM 1
  FROM public.sub_batches sb
  WHERE sb.id IN (
    SELECT oti.sub_batch_id
    FROM public.ownership_transfer_item oti
    INNER JOIN public.ownership_transfer ot ON ot.id = oti.transfer_id
    WHERE ot.recipient_org_id = v_org_id
      AND ot.status = 'pending_link'
  )
  ORDER BY sb.id
  FOR UPDATE;

  UPDATE public.organisation
  SET accepts_transfers = false
  WHERE id = v_org_id;

  WITH cancelled AS (
    UPDATE public.ownership_transfer
    SET status = 'cancelled',
        resolved_at = now(),
        resolved_by = v_user_id
    WHERE recipient_org_id = v_org_id
      AND status = 'pending_link'
    RETURNING id
  )
  SELECT COALESCE(array_agg(c.id), '{}'::uuid[])
    INTO v_cancelled_transfers
  FROM cancelled c;

  DELETE FROM public.sub_batch_reservation r
  WHERE r.transfer_id = ANY (v_cancelled_transfers);

  WITH cancelled AS (
    UPDATE public.organisation_link_request
    SET cancelled_at = now()
    WHERE provider_org_id = v_org_id
      AND kind = 'transfer'
      AND accepted_at IS NULL
      AND declined_at IS NULL
      AND cancelled_at IS NULL
    RETURNING id
  )
  SELECT COALESCE(array_agg(c.id), '{}'::uuid[])
    INTO v_cancelled_requests
  FROM cancelled c;

  RETURN jsonb_build_object(
    'accepts_transfers', false,
    'changed', true,
    'cancelled_request_ids', to_jsonb(v_cancelled_requests),
    'cancelled_transfer_ids', to_jsonb(v_cancelled_transfers)
  );
END;
$function$
;

-- =========================================================================
-- 2.7 Read functions for the recipient
-- =========================================================================

-- Provenance of a received batch, from the data captured at completion.
-- Raises P0002 unless the caller's organisation owns p_batch_id and the
-- batch's saved transfer mapping checks out against the ledger.
-- Returns:
--   { batch_id, species_name, source_collection_code, source_ibra_code,
--     source_ibra_name, source_collection_year,
--     chain: [ { hop, sender_org_name, transferred_at } ]   -- hop 0 = sender
--                                                           -- to the caller
--     tests: [ { type, quality_test_type, statistics, result, tested_at,
--                performed_by_org_name, hop } ] }
-- tests holds one winner per (type, quality_test_type) across the valid hops,
-- ranked by tested_at DESC NULLS LAST then source test id DESC. result and
-- statistics are the projected, named-field forms.
CREATE OR REPLACE FUNCTION public.fn_received_batch_provenance(p_batch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_chain uuid[];
  v_batch public.batches;
  v_species_name text;
  v_ibra_name text;
  v_hops jsonb;
  v_tests jsonb;
BEGIN
  v_chain := public.fn_transfer_authorise_received_batch(p_batch_id);

  SELECT b.*
    INTO v_batch
  FROM public.batches b
  WHERE b.id = p_batch_id;

  SELECT s.name INTO v_species_name
  FROM public.species s
  WHERE s.id = v_batch.species_id;

  SELECT r.name
    INTO v_ibra_name
  FROM public.ibra_regions r
  WHERE r.code = v_batch.source_ibra_code
  ORDER BY r.id
  LIMIT 1;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'hop', c.ord - 1,
        'sender_org_name', o.name,
        'transferred_at', ste.effective_at
      )
      ORDER BY c.ord
    ),
    '[]'::jsonb
  )
    INTO v_hops
  FROM unnest(v_chain) WITH ORDINALITY AS c(item_id, ord)
  INNER JOIN public.ownership_transfer_item oti ON oti.id = c.item_id
  INNER JOIN public.ownership_transfer ot ON ot.id = oti.transfer_id
  INNER JOIN public.seed_transfer_event ste ON ste.id = ot.transfer_event_id
  INNER JOIN public.organisation o ON o.id = ot.sender_org_id;

  -- All captured rows for this receipt are on its own item (earlier hops were
  -- copied in at completion), limited to the hops the chain just validated.
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'type', w.type,
        'quality_test_type', w.quality_test_type,
        'statistics', w.statistics,
        'result', w.result,
        'tested_at', w.tested_at,
        'performed_by_org_name', po.name,
        'hop', w.hop
      )
      ORDER BY w.type, w.quality_test_type
    ),
    '[]'::jsonb
  )
    INTO v_tests
  FROM (
    SELECT DISTINCT ON (ts.type, ts.quality_test_type)
      ts.type,
      ts.quality_test_type,
      ts.statistics,
      ts.result,
      ts.tested_at,
      ts.performed_by_organisation_id,
      ts.hop
    FROM public.ownership_transfer_test_snapshot ts
    WHERE ts.ownership_transfer_item_id = v_chain[1]
      AND ts.hop < cardinality(v_chain)
    ORDER BY
      ts.type,
      ts.quality_test_type,
      ts.tested_at DESC NULLS LAST,
      ts.source_test_id DESC
  ) w
  LEFT JOIN public.organisation po ON po.id = w.performed_by_organisation_id;

  RETURN jsonb_build_object(
    'batch_id', v_batch.id,
    'species_name', v_species_name,
    'source_collection_code', v_batch.source_collection_code,
    'source_ibra_code', v_batch.source_ibra_code,
    'source_ibra_name', v_ibra_name,
    'source_collection_year', v_batch.source_collection_year,
    'chain', v_hops,
    'tests', v_tests
  );
END;
$function$
;

-- Captured storage periods: dates and durations only, newest hop last.
-- hop 0 is storage at the organisation that sent the batch to the caller.
-- Same authorisation as fn_received_batch_provenance.
CREATE OR REPLACE FUNCTION public.fn_received_batch_storage_history(p_batch_id uuid)
 RETURNS TABLE(hop integer, started_at timestamptz, ended_at timestamptz, duration interval)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
DECLARE
  v_chain uuid[];
BEGIN
  v_chain := public.fn_transfer_authorise_received_batch(p_batch_id);

  RETURN QUERY
  SELECT ss.hop, ss.started_at, ss.ended_at, ss.duration
  FROM public.ownership_transfer_storage_snapshot ss
  WHERE ss.ownership_transfer_item_id = v_chain[1]
    AND ss.hop < cardinality(v_chain)
  ORDER BY ss.hop, ss.started_at, ss.ended_at;
END;
$function$
;

-- =========================================================================
-- UI support (names only)
-- =========================================================================

-- Open incoming transfer requests for the caller's organisation (Admins; an
-- empty list otherwise) with the bags waiting on each, the caller's own
-- pending outgoing transfers, and the transfer links on either side.
-- Returns:
--   { incoming_requests: [ { request_id, requesting_org_name, created_at,
--                            bags: [ { transfer_id, weight_grams,
--                                      species_name, collection_code } ] } ],
--     incoming_request_count,
--     outgoing_transfers: [ { transfer_id, recipient_org_name, link_request_id,
--                             created_at, notes,
--                             items: [ { sub_batch_id, weight_grams,
--                                        species_name, collection_code } ] } ],
--     outgoing_links: [ { recipient_org_name, created_at } ],
--     incoming_links: [ { sender_org_name, created_at } ] }
CREATE OR REPLACE FUNCTION public.fn_list_transfer_link_requests()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_org_id uuid := public.fn_transfer_resolve_caller('member');
  v_is_admin boolean;
  v_incoming jsonb := '[]'::jsonb;
  v_outgoing jsonb;
  v_outgoing_links jsonb;
  v_incoming_links jsonb;
BEGIN
  v_is_admin := EXISTS (
    SELECT 1
    FROM public.org_user ou
    WHERE ou.user_id = v_user_id
      AND ou.organisation_id = v_org_id
      AND ou.is_active = true
      AND ou.role = 'Admin'
  );

  IF v_is_admin THEN
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'request_id', r.id,
          'requesting_org_name', so.name,
          'created_at', r.created_at,
          'bags', COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'transfer_id', ot.id,
                  'weight_grams', oti.weight_grams,
                  'species_name', f.species_name,
                  'collection_code', f.collection_code
                )
                ORDER BY ot.created_at, oti.sub_batch_id
              )
              FROM public.ownership_transfer ot
              INNER JOIN public.ownership_transfer_item oti ON oti.transfer_id = ot.id
              INNER JOIN public.sub_batches sb ON sb.id = oti.sub_batch_id
              CROSS JOIN LATERAL public.fn_transfer_source_facts(sb.batch_id) f
              WHERE ot.link_request_id = r.id
                AND ot.status = 'pending_link'
            ),
            '[]'::jsonb
          )
        )
        ORDER BY r.created_at, r.id
      ),
      '[]'::jsonb
    )
      INTO v_incoming
    FROM public.organisation_link_request r
    INNER JOIN public.organisation so ON so.id = r.requesting_org_id
    WHERE r.provider_org_id = v_org_id
      AND r.kind = 'transfer'
      AND r.accepted_at IS NULL
      AND r.declined_at IS NULL
      AND r.cancelled_at IS NULL;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'transfer_id', ot.id,
        'recipient_org_name', ro.name,
        'link_request_id', ot.link_request_id,
        'created_at', ot.created_at,
        'notes', ot.notes,
        'items', COALESCE(
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'sub_batch_id', oti.sub_batch_id,
                'weight_grams', oti.weight_grams,
                'species_name', f.species_name,
                'collection_code', f.collection_code
              )
              ORDER BY oti.sub_batch_id
            )
            FROM public.ownership_transfer_item oti
            INNER JOIN public.sub_batches sb ON sb.id = oti.sub_batch_id
            CROSS JOIN LATERAL public.fn_transfer_source_facts(sb.batch_id) f
            WHERE oti.transfer_id = ot.id
          ),
          '[]'::jsonb
        )
      )
      ORDER BY ot.created_at, ot.id
    ),
    '[]'::jsonb
  )
    INTO v_outgoing
  FROM public.ownership_transfer ot
  INNER JOIN public.organisation ro ON ro.id = ot.recipient_org_id
  WHERE ot.sender_org_id = v_org_id
    AND ot.status = 'pending_link';

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('recipient_org_name', o.name, 'created_at', ol.created_at)
      ORDER BY o.name, ol.id
    ),
    '[]'::jsonb
  )
    INTO v_outgoing_links
  FROM public.organisation_link ol
  INNER JOIN public.organisation o ON o.id = ol.provider_org_id
  WHERE ol.requesting_org_id = v_org_id
    AND ol.kind = 'transfer';

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('sender_org_name', o.name, 'created_at', ol.created_at)
      ORDER BY o.name, ol.id
    ),
    '[]'::jsonb
  )
    INTO v_incoming_links
  FROM public.organisation_link ol
  INNER JOIN public.organisation o ON o.id = ol.requesting_org_id
  WHERE ol.provider_org_id = v_org_id
    AND ol.kind = 'transfer';

  RETURN jsonb_build_object(
    'incoming_requests', v_incoming,
    'incoming_request_count', jsonb_array_length(v_incoming),
    'outgoing_transfers', v_outgoing,
    'outgoing_links', v_outgoing_links,
    'incoming_links', v_incoming_links
  );
END;
$function$
;

-- "Reserved for transfer to X": the caller's own bags that sit in a pending
-- transfer.
CREATE OR REPLACE FUNCTION public.fn_sub_batch_reservations()
 RETURNS TABLE(sub_batch_id uuid, transfer_id uuid, recipient_org_name text)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
DECLARE
  v_org_id uuid := public.fn_transfer_resolve_caller('member');
BEGIN
  RETURN QUERY
  SELECT r.sub_batch_id, r.transfer_id, o.name::text
  FROM public.sub_batch_reservation r
  INNER JOIN public.ownership_transfer ot ON ot.id = r.transfer_id
  INNER JOIN public.organisation o ON o.id = ot.recipient_org_id
  WHERE ot.sender_org_id = v_org_id
    AND ot.status = 'pending_link'
  ORDER BY r.sub_batch_id;
END;
$function$
;

-- "Received from X": the caller's received batches with the sending
-- organisation's name and the transfer date. Each mapping is checked against
-- the ledger, so a forged provenance pointer returns nothing.
CREATE OR REPLACE FUNCTION public.fn_received_batch_sources()
 RETURNS TABLE(batch_id uuid, sender_org_name text, received_at timestamptz)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
DECLARE
  v_org_id uuid := public.fn_transfer_resolve_caller('member');
BEGIN
  RETURN QUERY
  SELECT b.id, so.name::text, ste.effective_at
  FROM public.batches b
  INNER JOIN public.ownership_transfer_item oti
    ON oti.seed_transfer_item_id = b.received_transfer_item_id
   AND oti.received_batch_id = b.id
  INNER JOIN public.ownership_transfer ot ON ot.id = oti.transfer_id
  INNER JOIN public.seed_transfer_event ste ON ste.id = ot.transfer_event_id
  INNER JOIN public.organisation so ON so.id = ot.sender_org_id
  WHERE b.organisation_id = v_org_id
    AND b.received_transfer_item_id IS NOT NULL
    AND ot.status = 'completed'
    AND ot.recipient_org_id = b.organisation_id
    AND ste.kind = 'ownership_transfer'
  ORDER BY ste.effective_at DESC, b.id;
END;
$function$
;

-- =========================================================================
-- 1.7 Function grants
-- =========================================================================
--
-- A function starts out executable by PUBLIC, anon and authenticated
-- (20260911000005_permissions_rls_and_integrations.sql, "Function
-- privileges"), so every restriction is stated.

-- Internal steps and helpers: nobody calls these directly. They skip the
-- caller checks of the RPCs that use them.
REVOKE ALL ON FUNCTION public.fn_complete_ownership_transfer(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_close_storage_for_transfer(uuid, timestamp with time zone, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_transfer_resolve_caller(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_transfer_lock_pair(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_transfer_bag_problem(uuid, uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_transfer_source_facts(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_transfer_send_result(uuid, boolean, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_transfer_authorise_received_batch(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_transfer_numeric_or_null(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_transfer_quality_test_type(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_transfer_project_statistics(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_transfer_project_result(text, jsonb) FROM PUBLIC, anon, authenticated;

-- Public RPCs: signed-in users only.
REVOKE ALL ON FUNCTION public.fn_transfer_directory() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_send_bags_for_transfer(uuid, jsonb, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_respond_transfer_link_request(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_cancel_ownership_transfer(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_set_accepts_transfers(boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_received_batch_provenance(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_received_batch_storage_history(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_list_transfer_link_requests() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_sub_batch_reservations() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_received_batch_sources() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.fn_transfer_directory() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_send_bags_for_transfer(uuid, jsonb, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_respond_transfer_link_request(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cancel_ownership_transfer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_set_accepts_transfers(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_received_batch_provenance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_received_batch_storage_history(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_list_transfer_link_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sub_batch_reservations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_received_batch_sources() TO authenticated;
