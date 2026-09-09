-- ============================================================================
-- TYPED WEIGHT ADJUSTMENTS
-- ============================================================================
-- Reasons remain human-readable audit text. Machine behavior uses a constrained
-- kind and a structured reference to the fact that caused the adjustment.

CREATE TYPE public.batch_weight_adjustment_kind AS ENUM (
  'test_consumption',
  'variance',
  'split',
  'merge',
  'cleaning',
  'correction'
);

ALTER TABLE public.batch_weight_adjustments
  ADD COLUMN kind public.batch_weight_adjustment_kind
    NOT NULL DEFAULT 'correction',
  ADD COLUMN test_id UUID
    REFERENCES public.tests(id) ON DELETE RESTRICT,
  ADD COLUMN lineage_operation_id UUID,
  ADD COLUMN transfer_item_id UUID
    REFERENCES public.seed_transfer_item(id) ON DELETE RESTRICT,
  ADD COLUMN corrects_adjustment_id UUID
    REFERENCES public.batch_weight_adjustments(id) ON DELETE RESTRICT,
  ADD CONSTRAINT batch_weight_adjustment_reference_shape CHECK (
    (
      kind = 'test_consumption'
      AND test_id IS NOT NULL
      AND lineage_operation_id IS NULL
      AND transfer_item_id IS NULL
      AND corrects_adjustment_id IS NULL
    )
    OR (
      kind IN ('split', 'merge', 'cleaning')
      AND test_id IS NULL
      AND lineage_operation_id IS NOT NULL
      AND transfer_item_id IS NULL
      AND corrects_adjustment_id IS NULL
    )
    OR (
      kind = 'variance'
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
  ),
  ADD CONSTRAINT batch_weight_adjustment_not_self_correcting CHECK (
    id IS DISTINCT FROM corrects_adjustment_id
  );

CREATE INDEX idx_batch_weight_adjustments_test
  ON public.batch_weight_adjustments (test_id)
  WHERE test_id IS NOT NULL;

CREATE INDEX idx_batch_weight_adjustments_lineage_operation
  ON public.batch_weight_adjustments (lineage_operation_id)
  WHERE lineage_operation_id IS NOT NULL;

CREATE INDEX idx_batch_weight_adjustments_transfer_item
  ON public.batch_weight_adjustments (transfer_item_id)
  WHERE transfer_item_id IS NOT NULL;

CREATE INDEX idx_batch_weight_adjustments_corrects
  ON public.batch_weight_adjustments (corrects_adjustment_id)
  WHERE corrects_adjustment_id IS NOT NULL;

COMMENT ON COLUMN public.batch_weight_adjustments.kind IS
  'Machine-readable reason for the weight change; never infer this from reason text.';

COMMENT ON COLUMN public.batch_weight_adjustments.lineage_operation_id IS
  'The split, merge, or cleaning operation_id recorded by sub_batch_lineage.';

-- --------------------------------------------------------------------------
-- Split classification. The underlying function writes exactly one source
-- deduction; this public wrapper owns both its lineage operation and type.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_split_sub_batch(
  p_sub_batch_id UUID,
  p_outputs JSONB
) RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_derived_ids UUID[];
  v_operation_id UUID := gen_random_uuid();
  v_prior_adjustment_ids UUID[];
  v_classified_count INTEGER;
BEGIN
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
$$;

-- --------------------------------------------------------------------------
-- Merge classification. The lineage-aware implementation is retained under
-- an internal name; the wrapper classifies each source deduction.
-- --------------------------------------------------------------------------
ALTER FUNCTION public.fn_merge_sub_batches(UUID[], UUID, UUID, TEXT)
  RENAME TO fn_merge_sub_batches_without_adjustment_classification;

REVOKE ALL ON FUNCTION
  public.fn_merge_sub_batches_without_adjustment_classification(
    UUID[], UUID, UUID, TEXT
  ) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.fn_merge_sub_batches(
  p_sub_batch_ids UUID[],
  p_container_id UUID,
  p_location_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.fn_merge_sub_batches(
  UUID[], UUID, UUID, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_merge_sub_batches(
  UUID[], UUID, UUID, TEXT
) TO authenticated;

-- --------------------------------------------------------------------------
-- Cleaning classification: source consumption and aggregate-to-physical
-- bagging both reference batch_cleaning.id.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_clean_sub_batch(
  p_sub_batch_id UUID,
  p_duration INTERVAL DEFAULT NULL,
  p_material_type TEXT DEFAULT NULL,
  p_material_subtype TEXT DEFAULT NULL,
  p_material_notes TEXT DEFAULT NULL,
  p_is_cleaned BOOLEAN DEFAULT false,
  p_cleaning_notes TEXT DEFAULT NULL,
  p_worker_ids UUID[] DEFAULT '{}'::UUID[],
  p_outputs JSONB DEFAULT '[]'::JSONB
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cleaning_id UUID;
  v_prior_adjustment_ids UUID[];
  v_classified_count INTEGER;
BEGIN
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
$$;

ALTER FUNCTION public.fn_bag_and_store_cleaning_outputs(UUID, JSONB)
  RENAME TO fn_bag_cleaning_outputs_unclassified;

REVOKE ALL ON FUNCTION
  public.fn_bag_cleaning_outputs_unclassified(
    UUID, JSONB
  ) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.fn_bag_and_store_cleaning_outputs(
  p_cleaning_id UUID,
  p_bags JSONB
) RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_created_ids UUID[];
  v_initial_bag_ids UUID[];
  v_prior_adjustment_ids UUID[];
  v_classified_count INTEGER;
BEGIN
  SELECT COALESCE(array_agg(bag.id), '{}'::UUID[])
  INTO v_initial_bag_ids
  FROM public.batch_cleaning_output output
  INNER JOIN public.sub_batches bag ON bag.batch_id = output.output_batch_id
  WHERE output.cleaning_id = p_cleaning_id;

  SELECT COALESCE(array_agg(adjustment.id), '{}'::UUID[])
  INTO v_prior_adjustment_ids
  FROM public.batch_weight_adjustments adjustment
  WHERE adjustment.sub_batch_id = ANY (v_initial_bag_ids);

  v_created_ids :=
    public.fn_bag_cleaning_outputs_unclassified(
      p_cleaning_id,
      p_bags
    );

  UPDATE public.batch_weight_adjustments adjustment
  SET
    kind = 'cleaning',
    lineage_operation_id = p_cleaning_id
  WHERE adjustment.sub_batch_id = ANY (v_initial_bag_ids)
    AND adjustment.id <> ALL (v_prior_adjustment_ids);

  GET DIAGNOSTICS v_classified_count = ROW_COUNT;
  IF v_classified_count != cardinality(v_initial_bag_ids) THEN
    RAISE EXCEPTION 'Bagging must replace each aggregate with one adjustment';
  END IF;

  RETURN v_created_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_bag_and_store_cleaning_outputs(
  UUID, JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_bag_and_store_cleaning_outputs(
  UUID, JSONB
) TO authenticated;

-- --------------------------------------------------------------------------
-- Test consumption classification. Zero-weight tests create no adjustment;
-- positive consumption references the test returned by the underlying RPC.
-- --------------------------------------------------------------------------
ALTER FUNCTION public.fn_create_quality_test(UUID, UUID, JSONB, UUID)
  RENAME TO fn_create_quality_test_without_adjustment_classification;

REVOKE ALL ON FUNCTION
  public.fn_create_quality_test_without_adjustment_classification(
    UUID, UUID, JSONB, UUID
  ) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.fn_create_quality_test(
  p_batch_id UUID,
  p_sub_batch_id UUID,
  p_result JSONB,
  p_performed_by_organisation_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.fn_create_quality_test(
  UUID, UUID, JSONB, UUID
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_create_quality_test(
  UUID, UUID, JSONB, UUID
) TO authenticated;
