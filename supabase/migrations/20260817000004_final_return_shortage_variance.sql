-- ============================================================================
-- FINAL RETURN SHORTAGE VARIANCE
-- ============================================================================
-- Ordinary and repeated movements stay on the established return boundary.
-- A declared final return additionally reconciles any positive database
-- remainder as an acknowledged shortage, linked to the immutable return item.

ALTER FUNCTION public.fn_return_bags_from_testing(JSONB, TEXT, TEXT)
  RENAME TO fn_return_bags_from_testing_without_final_variance;

REVOKE ALL PRIVILEGES ON FUNCTION
  public.fn_return_bags_from_testing_without_final_variance(JSONB, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.fn_return_bags_from_testing(
  p_items JSONB,
  p_work_status TEXT DEFAULT NULL,
  p_work_status_note TEXT DEFAULT NULL,
  p_is_final BOOLEAN DEFAULT false,
  p_variance_reason TEXT DEFAULT NULL
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
$$;

COMMENT ON FUNCTION
  public.fn_return_bags_from_testing(JSONB, TEXT, TEXT, BOOLEAN, TEXT) IS
  'Returns held testing portions through immutable transfer events; a declared final shortage requires a reason and appends a typed variance adjustment that ends positive source custody without rewriting earlier facts.';

REVOKE ALL PRIVILEGES ON FUNCTION
  public.fn_return_bags_from_testing(JSONB, TEXT, TEXT, BOOLEAN, TEXT)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.fn_return_bags_from_testing(JSONB, TEXT, TEXT, BOOLEAN, TEXT)
  TO authenticated;
