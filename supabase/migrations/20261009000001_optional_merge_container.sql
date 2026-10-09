-- The destination container of a merge is optional
--
-- Splitting already lets the new bags go without a container, and
-- sub_batches.container_id is nullable, but merging insisted on one. A lab
-- with no storage containers set up of its own (it cannot use the sender's)
-- could not merge at all. A supplied container is still validated; omitting it
-- leaves the merged bag unlabelled, as a split does.

set check_function_bodies = off;

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
