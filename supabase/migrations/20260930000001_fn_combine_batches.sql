-- Combine batches
--
-- Pools unprocessed batches — collections nobody has cleaned yet — into one new
-- unprocessed batch that is then cleaned as a single lot. This is a different
-- operation from fn_mix_batches, which works on batches that already carry
-- weight, and from fn_merge_batches, which joins batches of one collection.
--
-- The combined batch has no weight and no bags: both arrive with cleaning,
-- exactly as for an origin batch. The sources are consumed through
-- batch_merges, the same way merged and mixed sources are.
--
-- Only seed that can be shown to belong together is combined: every source must
-- be the same species and come from the same IBRA region.

CREATE OR REPLACE FUNCTION public.fn_combine_batches(p_source_batch_ids uuid[], p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_source_count integer;
  v_org uuid;
  v_species_count integer;
  v_species_unknown boolean;
  v_ibra_count integer;
  v_ibra_unknown boolean;
  v_oldest_collected_at timestamptz;
  v_code text;
  v_new_id uuid;
BEGIN
  v_source_count := COALESCE(array_length(p_source_batch_ids, 1), 0);

  IF v_source_count < 2 THEN
    RAISE EXCEPTION 'Provide at least two source batches to combine';
  END IF;

  -- count(DISTINCT) skips NULLs, so this also rejects a NULL id
  IF (SELECT count(DISTINCT s.id) FROM unnest(p_source_batch_ids) AS s(id)) <> v_source_count THEN
    RAISE EXCEPTION 'Each source batch can only be combined once';
  END IF;

  -- Authorise before looking at anything else, so a caller learns nothing about
  -- batches that are not theirs. This also rejects ids that are not batches.
  IF EXISTS (
    SELECT 1
    FROM unnest(p_source_batch_ids) AS s(id)
    WHERE NOT public.is_current_custodian(auth.uid(), s.id)
  ) THEN
    RAISE EXCEPTION 'Permission denied: not a member of the organisation that holds every source batch';
  END IF;

  v_org := assert_same_custodian(p_source_batch_ids);

  -- Two people combining the same batch at once must not both succeed: each
  -- would consume it into a different new batch.
  PERFORM 1
  FROM batches b
  WHERE b.id = ANY (p_source_batch_ids)
  ORDER BY b.id
  FOR UPDATE;

  -- Unprocessed: still the batch a collection created, with no weight, no bags
  -- and no cleaning recorded against it.
  IF EXISTS (
    SELECT 1
    FROM batches b
    WHERE b.id = ANY (p_source_batch_ids)
      AND (
        b.collection_id IS NULL
        OR b.weight_grams IS NOT NULL
        OR EXISTS (SELECT 1 FROM sub_batches sb WHERE sb.batch_id = b.id)
        OR EXISTS (SELECT 1 FROM batch_cleaning bc WHERE bc.input_batch_id = b.id)
      )
  ) THEN
    RAISE EXCEPTION 'Only batches that have not been cleaned can be combined';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM batch_merges bm
    WHERE bm.source_batch_id = ANY (p_source_batch_ids)
  ) THEN
    RAISE EXCEPTION 'A source batch has already been combined or merged into another batch';
  END IF;

  -- Species and IBRA region must be identical. A missing species, or a region
  -- the location does not resolve to, cannot be shown to match anything, so it
  -- blocks the combine rather than counting as one more value.
  WITH source AS (
    SELECT
      c.species_id,
      c.created_at,
      public.get_ibra_code_from_location(c.location) AS ibra_code
    FROM batches b
    JOIN collection c ON c.id = b.collection_id
    WHERE b.id = ANY (p_source_batch_ids)
  )
  SELECT
    count(DISTINCT species_id),
    bool_or(species_id IS NULL),
    count(DISTINCT ibra_code),
    bool_or(ibra_code = 'UNK'),
    min(created_at)
  INTO
    v_species_count,
    v_species_unknown,
    v_ibra_count,
    v_ibra_unknown,
    v_oldest_collected_at
  FROM source;

  IF v_species_unknown OR v_species_count <> 1 THEN
    RAISE EXCEPTION 'All batches must be of the same species to combine';
  END IF;

  IF v_ibra_unknown THEN
    RAISE EXCEPTION 'Cannot combine a batch whose IBRA region is unknown';
  END IF;

  IF v_ibra_count <> 1 THEN
    RAISE EXCEPTION 'All batches must be from the same IBRA region to combine';
  END IF;

  -- Codes read SPECIES-ORG.IBRA.YY-N, and species, org and IBRA are the same
  -- across the sources. The combined batch takes the earliest year and, within
  -- it, the first number — which is simply the code of the source that sorts
  -- first. Borrowing a real code rather than assembling one means it can never
  -- match a live batch: that source is consumed here and can no longer be
  -- cleaned, so no outputs will ever be numbered from it again.
  SELECT b.code
  INTO v_code
  FROM batches b
  WHERE b.id = ANY (p_source_batch_ids)
  ORDER BY
    substring(b.code FROM '\.(\d{2})(?:-\d+)?$')::integer NULLS LAST,
    substring(b.code FROM '-(\d+)$')::integer NULLS LAST,
    b.created_at,
    b.id
  LIMIT 1;

  IF v_code IS NULL THEN
    RAISE EXCEPTION 'Cannot combine batches that have no code';
  END IF;

  -- Dated from the oldest collection, as fn_mix_batches does: seed age counts
  -- from when it was collected, not from when it was pooled.
  INSERT INTO batches (
    id, collection_id, organisation_id, code, weight_grams, notes, created_at
  ) VALUES (
    gen_random_uuid(), NULL, v_org, v_code, NULL, p_notes, COALESCE(v_oldest_collected_at, now())
  )
  RETURNING id INTO v_new_id;

  INSERT INTO batch_custody (batch_id, organisation_id, notes)
  VALUES (v_new_id, v_org, 'Custody on combine');

  INSERT INTO batch_merges (merged_batch_id, source_batch_id)
  SELECT v_new_id, s.id
  FROM unnest(p_source_batch_ids) AS s(id);

  RETURN v_new_id;
END;
$function$
;

REVOKE EXECUTE ON FUNCTION public.fn_combine_batches(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_combine_batches(uuid[], text) TO authenticated;
