-- ============================================================================
-- ATOMIC SUB-BATCH STORAGE TRANSITIONS
-- ============================================================================
-- Existing storage moves close one row and create another in separate client
-- requests. Consolidate that transition under one lock and one transaction.

-- This workflow has not been deployed yet, so discard accidental duplicate
-- open rows and retain only the most recently stored row for each sub-batch.
WITH ranked_open_storage AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY sub_batch_id
      ORDER BY stored_at DESC NULLS LAST, created_at DESC, id DESC
    ) AS open_rank
  FROM public.batch_storage
  WHERE moved_out_at IS NULL
)
DELETE FROM public.batch_storage storage
USING ranked_open_storage ranked
WHERE storage.id = ranked.id
  AND ranked.open_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS batch_storage_one_open_row_per_sub_batch_idx
  ON public.batch_storage (sub_batch_id)
  WHERE moved_out_at IS NULL;

COMMENT ON INDEX public.batch_storage_one_open_row_per_sub_batch_idx IS
  'Enforces at most one current storage location for each sub-batch.';

CREATE OR REPLACE FUNCTION public.fn_set_sub_batch_storage(
  p_sub_batch_id UUID,
  p_location_id UUID DEFAULT NULL,
  p_effective_at TIMESTAMPTZ DEFAULT now(),
  p_notes TEXT DEFAULT NULL
) RETURNS public.batch_storage AS $$
DECLARE
  v_batch_id UUID;
  v_organisation_id UUID;
  v_current_weight NUMERIC;
  v_current_storage public.batch_storage%ROWTYPE;
  v_result public.batch_storage%ROWTYPE;
BEGIN
  IF p_sub_batch_id IS NULL THEN
    RAISE EXCEPTION 'A sub-batch is required';
  END IF;

  IF p_effective_at IS NULL THEN
    RAISE EXCEPTION 'An effective storage time is required';
  END IF;

  -- Serialize every transition for the sub-batch. The open-row unique index is
  -- a final invariant guard for direct or concurrent writes.
  SELECT sb.batch_id
  INTO v_batch_id
  FROM public.sub_batches sb
  WHERE sb.id = p_sub_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sub-batch not found';
  END IF;

  IF NOT public.is_current_custodian(auth.uid(), v_batch_id) THEN
    RAISE EXCEPTION 'Permission denied: not current custodian of batch';
  END IF;

  SELECT sbcw.current_weight
  INTO v_current_weight
  FROM public.sub_batch_current_weight sbcw
  WHERE sbcw.id = p_sub_batch_id;

  IF v_current_weight IS NULL OR v_current_weight <= 0 THEN
    RAISE EXCEPTION 'Only a positive-weight sub-batch can be stored';
  END IF;

  v_organisation_id := public.get_user_organisation_id();

  IF p_location_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.storage_locations location
    WHERE location.id = p_location_id
      AND location.organisation_id = v_organisation_id
  ) THEN
    RAISE EXCEPTION 'Invalid storage location %', p_location_id;
  END IF;

  SELECT storage.*
  INTO v_current_storage
  FROM public.batch_storage storage
  WHERE storage.sub_batch_id = p_sub_batch_id
    AND storage.moved_out_at IS NULL
  FOR UPDATE;

  IF NOT FOUND AND p_location_id IS NULL THEN
    RAISE EXCEPTION 'Sub-batch is not currently stored';
  END IF;

  IF v_current_storage.id IS NOT NULL
    AND p_location_id = v_current_storage.location_id THEN
    RAISE EXCEPTION 'Sub-batch is already stored at this location';
  END IF;

  IF v_current_storage.id IS NOT NULL
    AND v_current_storage.stored_at IS NOT NULL
    AND p_effective_at < v_current_storage.stored_at THEN
    RAISE EXCEPTION
      'Effective storage time cannot be before the current storage start';
  END IF;

  IF v_current_storage.id IS NOT NULL THEN
    UPDATE public.batch_storage
    SET
      moved_out_at = p_effective_at,
      notes = CASE
        WHEN p_location_id IS NULL THEN p_notes
        ELSE notes
      END
    WHERE id = v_current_storage.id
    RETURNING * INTO v_result;
  END IF;

  IF p_location_id IS NOT NULL THEN
    INSERT INTO public.batch_storage (
      batch_id,
      sub_batch_id,
      location_id,
      stored_at,
      notes
    ) VALUES (
      v_batch_id,
      p_sub_batch_id,
      p_location_id,
      p_effective_at,
      p_notes
    )
    RETURNING * INTO v_result;
  END IF;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.fn_set_sub_batch_storage(
  UUID,
  UUID,
  TIMESTAMPTZ,
  TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_set_sub_batch_storage(
  UUID,
  UUID,
  TIMESTAMPTZ,
  TEXT
) TO authenticated;

COMMENT ON FUNCTION public.fn_set_sub_batch_storage(
  UUID,
  UUID,
  TIMESTAMPTZ,
  TEXT
) IS
  'Atomically stores, moves, or removes a positive-weight sub-batch using one effective timestamp.';
