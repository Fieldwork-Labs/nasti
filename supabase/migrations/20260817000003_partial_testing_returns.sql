-- ============================================================================
-- PARTIAL TESTING RETURNS
-- ============================================================================
-- A return moves a newly derived physical bag back to the seed owner. The lab
-- source remains a separate custody fact, so returning part of it neither
-- transfers ownership nor prevents later testing or return movements.

CREATE TABLE public.batch_testing_assignment_return_item (
  assignment_id UUID NOT NULL
    REFERENCES public.batch_testing_assignment(id) ON DELETE RESTRICT,
  transfer_item_id UUID NOT NULL
    REFERENCES public.seed_transfer_item(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (assignment_id, transfer_item_id)
);

CREATE INDEX batch_testing_assignment_return_item_transfer_idx
  ON public.batch_testing_assignment_return_item (transfer_item_id);

COMMENT ON TABLE public.batch_testing_assignment_return_item IS
  'Immutable link from each returned transfer item to every testing assignment represented by its source lineage.';

CREATE TRIGGER batch_testing_assignment_return_item_append_only
BEFORE UPDATE OR DELETE
ON public.batch_testing_assignment_return_item
FOR EACH ROW
EXECUTE FUNCTION public.reject_seed_transfer_mutation();

ALTER TABLE public.batch_testing_assignment_return_item
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY batch_testing_assignment_return_item_select_participant
ON public.batch_testing_assignment_return_item
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.batch_testing_assignment assignment
    WHERE assignment.id =
      batch_testing_assignment_return_item.assignment_id
      AND public.get_user_organisation_id() IN (
        assignment.assigned_by_org_id,
        assignment.assigned_to_org_id
      )
  )
);

GRANT SELECT
  ON public.batch_testing_assignment_return_item
  TO authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.batch_testing_assignment_return_item
  FROM authenticated;

CREATE FUNCTION public.fn_return_bags_from_testing(
  p_items JSONB,
  p_work_status TEXT DEFAULT NULL,
  p_work_status_note TEXT DEFAULT NULL
)
RETURNS TABLE (
  transfer_event_id UUID,
  transfer_item_id UUID,
  source_sub_batch_id UUID,
  returned_sub_batch_id UUID,
  returned_weight_grams NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
$$;

COMMENT ON FUNCTION
  public.fn_return_bags_from_testing(JSONB, TEXT, TEXT) IS
  'Returns one or more whole or partial held bags to their seed owner in one immutable transfer, explicitly closing any still-open represented work and preserving physical lineage.';

REVOKE ALL PRIVILEGES ON FUNCTION
  public.fn_return_bags_from_testing(JSONB, TEXT, TEXT)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.fn_return_bags_from_testing(JSONB, TEXT, TEXT)
  TO authenticated;
