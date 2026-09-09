-- ============================================================================
-- NUMERIC WEIGHTS: batch weights are recorded in grams to a fraction of a gram
-- ============================================================================
-- Cleaning outputs (and small seed batches generally) are weighed on scales
-- that read decimals, so INTEGER grams either forced the operator to round or
-- silently rounded for them via `(... ->> 'weight_grams')::INTEGER`.
--
-- Every weight column moves to NUMERIC together — sub-batch weights feed
-- batch_current_weight, splits/merges/tests write adjustments against them, and
-- a half-converted model would round the decimals straight back out.
--
-- Scale is deliberately unbounded: rounding is a presentation decision, made in
-- the UI, not something the storage layer should do behind the operator's back.

-- ============================================================================
-- 1. Drop the views that depend on the weight columns
-- ============================================================================
-- Order matters: active_batches reads batch_lineage and batch_current_weight.
DROP VIEW IF EXISTS active_batches;
DROP VIEW IF EXISTS active_sub_batches;
DROP VIEW IF EXISTS batch_lineage;
DROP VIEW IF EXISTS batch_current_weight;
DROP VIEW IF EXISTS sub_batch_current_weight;

-- ============================================================================
-- 2. Widen the weight columns
-- ============================================================================
ALTER TABLE batches
  ALTER COLUMN weight_grams TYPE NUMERIC;

ALTER TABLE sub_batches
  ALTER COLUMN weight_grams TYPE NUMERIC;

ALTER TABLE batch_weight_adjustments
  ALTER COLUMN weight_grams TYPE NUMERIC;

ALTER TABLE batch_cleaning_output
  ALTER COLUMN weight_grams TYPE NUMERIC;

-- ============================================================================
-- 3. Recreate the views, unchanged apart from the widened columns
-- ============================================================================
-- Displayed batch weight is custody-relative: only bags in the viewer's own
-- custody count. The same parent batch therefore reports different current
-- weights to the General organisation that owns it and to a Testing
-- organisation holding one of its bags, and that is the intent — each side is
-- told how much seed it actually has.
--
-- NULL still means "origin batch, weight not yet known", so the no-bags case is
-- tested explicitly. Without that, a batch whose every bag is held elsewhere
-- would also sum to NULL and be read as unknown-but-active rather than as zero
-- for this viewer.
CREATE VIEW batch_current_weight AS
SELECT
  b.id,
  b.weight_grams AS original_weight,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM batch_merges bm
      WHERE bm.source_batch_id = b.id
    ) THEN 0::numeric
    WHEN NOT EXISTS (
      SELECT 1 FROM sub_batches sb
      WHERE sb.batch_id = b.id
    ) THEN NULL::numeric
    ELSE COALESCE(
      (SELECT SUM(
        sb.weight_grams + COALESCE(
          (SELECT SUM(wa.weight_grams)
           FROM batch_weight_adjustments wa
           WHERE wa.sub_batch_id = sb.id),
          0
        )
      )
      FROM sub_batches sb
      WHERE sb.batch_id = b.id
        AND sb.held_by_org_id = (SELECT public.get_user_organisation_id())),
      0::numeric
    )
  END AS current_weight
FROM batches b;

ALTER VIEW batch_current_weight SET (security_invoker = true);

CREATE VIEW sub_batch_current_weight AS
SELECT
  sb.id,
  sb.weight_grams AS original_weight,
  sb.weight_grams + COALESCE(
    (SELECT SUM(wa.weight_grams)
       FROM batch_weight_adjustments wa
       WHERE wa.sub_batch_id = sb.id),
    0
  ) AS current_weight
FROM sub_batches sb;

ALTER VIEW sub_batch_current_weight SET (security_invoker = true);

-- Both weight_info helpers read the views above; re-created so they resolve
-- against the new definitions.
CREATE OR REPLACE FUNCTION batch_weight_info(batch_row batches)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'original_weight', bcw.original_weight,
    'current_weight', bcw.current_weight
  )
  FROM batch_current_weight bcw
  WHERE bcw.id = batch_row.id;
$$;

CREATE OR REPLACE FUNCTION sub_batch_weight_info(sub_batch_row sub_batches)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'original_weight', sbcw.original_weight,
    'current_weight', sbcw.current_weight
  )
  FROM sub_batch_current_weight sbcw
  WHERE sbcw.id = sub_batch_row.id;
$$;

CREATE VIEW batch_lineage AS

-- Split batches: created from a single parent
SELECT
  bs.child_batch_id AS batch_id,
  bs.parent_batch_id AS parent_batch_id,
  'split' AS creation_event,
  b.created_at AS created_at,
  jsonb_build_object(
    'batch_split_id', bs.id,
    'weight_grams', b.weight_grams
  ) AS event_details
FROM batch_splits bs
JOIN batches b ON b.id = bs.child_batch_id

UNION ALL

-- Merged/mixed batches: created from multiple sources
SELECT
  bm.merged_batch_id AS batch_id,
  NULL::UUID AS parent_batch_id,
  'merge' AS creation_event,
  b.created_at AS created_at,
  jsonb_build_object(
    'batch_merge_ids', jsonb_agg(bm.id ORDER BY bm.created_at),
    'source_batch_ids', jsonb_agg(bm.source_batch_id ORDER BY bm.created_at)
  ) AS event_details
FROM batch_merges bm
JOIN batches b ON b.id = bm.merged_batch_id
GROUP BY bm.merged_batch_id, b.created_at

UNION ALL

-- Treated batches: created from treating an input batch
SELECT
  bt.output_batch_id AS batch_id,
  bt.input_batch_id AS parent_batch_id,
  'treating' AS creation_event,
  b.created_at AS created_at,
  jsonb_build_object(
    'treatments_id', bt.id,
    'treat', bt.treat,
    'quality_assessment', bt.quality_assessment,
    'output_weight', b.weight_grams
  ) AS event_details
FROM treatments bt
JOIN batches b ON b.id = bt.output_batch_id

UNION ALL

-- Cleaned batches: created from cleaning an input batch
SELECT
  bco.output_batch_id AS batch_id,
  bc.input_batch_id AS parent_batch_id,
  'cleaning' AS creation_event,
  b.created_at AS created_at,
  jsonb_build_object(
    'batch_cleaning_id', bc.id,
    'cleaning_output_id', bco.id,
    'quality', bco.quality,
    'material_type', bco.material_type,
    'output_weight', bco.weight_grams
  ) AS event_details
FROM batch_cleaning bc
JOIN batch_cleaning_output bco ON bco.cleaning_id = bc.id
JOIN batches b ON b.id = bco.output_batch_id

UNION ALL

-- Initial batches: created directly from collections
SELECT
  b.id AS batch_id,
  NULL::UUID AS parent_batch_id,
  'initial' AS creation_event,
  b.created_at AS created_at,
  jsonb_build_object(
    'collection_id', b.collection_id
  ) AS event_details
FROM batches b
WHERE NOT EXISTS (SELECT 1 FROM batch_splits bs WHERE bs.child_batch_id = b.id)
AND NOT EXISTS (SELECT 1 FROM batch_merges bm WHERE bm.merged_batch_id = b.id)
AND NOT EXISTS (SELECT 1 FROM treatments bt WHERE bt.output_batch_id = b.id)
AND NOT EXISTS (SELECT 1 FROM batch_cleaning_output bco WHERE bco.output_batch_id = b.id);

ALTER VIEW batch_lineage SET (security_invoker = true);

-- Restored after the drop: the @fk comment is what lets PostgREST embed
-- batch_lineage.parent_batch_id against batches.
COMMENT ON VIEW batch_lineage IS 'Shows the lineage of each batch: how it was created and its parent batch(es). Recreated in later migration to include treating and cleaning.';
COMMENT ON COLUMN batch_lineage.parent_batch_id IS '@fk public.batches.id';

CREATE VIEW active_batches AS
WITH computed AS (
  SELECT DISTINCT
    b.*,
    bcw.original_weight,
    bcw.current_weight,
    cbs.location_id as current_location_id,
    c.species_id,
    (
      WITH RECURSIVE ancestors AS (
        SELECT batch_id, parent_batch_id, event_details, creation_event
        FROM batch_lineage WHERE batch_id = b.id
        UNION
        SELECT bl.batch_id, bl.parent_batch_id, bl.event_details, bl.creation_event
        FROM batch_lineage bl
        INNER JOIN ancestors a ON (
          bl.batch_id = a.parent_batch_id
          OR (a.creation_event = 'merge'
              AND bl.batch_id IN (
                SELECT jsonb_array_elements_text(a.event_details->'source_batch_ids')::uuid
              ))
        )
      )
      SELECT EXISTS (
        SELECT 1 FROM ancestors WHERE creation_event = 'treating'
      )
    ) AS is_treated,
    (
      EXISTS (SELECT 1 FROM batch_cleaning_output bco WHERE bco.output_batch_id = b.id)
      OR EXISTS (
        WITH RECURSIVE ancestors AS (
          SELECT batch_id, parent_batch_id, creation_event
          FROM batch_lineage WHERE batch_id = b.id
          UNION
          SELECT bl.batch_id, bl.parent_batch_id, bl.creation_event
          FROM batch_lineage bl
          INNER JOIN ancestors a ON bl.batch_id = a.parent_batch_id
        )
        SELECT 1 FROM ancestors anc
        INNER JOIN batch_cleaning bc ON bc.input_batch_id = anc.batch_id
      )
    ) AS is_cleaned,
    COALESCE(
      (SELECT t.statistics FROM tests t
       WHERE t.batch_id = b.id AND t.type = 'quality' AND t.statistics IS NOT NULL
       ORDER BY t.tested_at DESC LIMIT 1),
      (SELECT t.statistics FROM tests t
       WHERE t.batch_id = (
         SELECT parent_batch_id FROM batch_lineage
         WHERE batch_id = b.id AND creation_event = 'split'
       ) AND t.type = 'quality' AND t.statistics IS NOT NULL
       ORDER BY t.tested_at DESC LIMIT 1),
      get_merged_batch_inherited_statistics(b.id)
    ) AS latest_quality_statistics
  FROM
    batches b
    JOIN batch_current_weight bcw ON bcw.id = b.id
    LEFT JOIN collection c ON c.id = b.collection_id
    LEFT JOIN LATERAL (
      SELECT location_id
      FROM current_batch_storage
      WHERE batch_id = b.id
      ORDER BY stored_at DESC
      LIMIT 1
    ) cbs ON true
  WHERE
    bcw.current_weight > 0 OR bcw.current_weight IS NULL
)
SELECT * FROM computed
WHERE NOT EXISTS (
  SELECT 1 FROM batch_cleaning bc WHERE bc.input_batch_id = computed.id
);

ALTER VIEW active_batches SET (security_invoker = true);

-- "Active" is inventory the viewer can act on, so it too is custody-relative: a
-- bag out at a lab is not part of the owner's working stock, and the siblings
-- it left behind are not part of the lab's.
CREATE VIEW active_sub_batches AS
SELECT
  sb.*,
  sbcw.original_weight,
  sbcw.current_weight,
  cbs.location_id AS current_location_id
FROM sub_batches sb
JOIN sub_batch_current_weight sbcw ON sbcw.id = sb.id
LEFT JOIN LATERAL (
  SELECT location_id
  FROM current_batch_storage
  WHERE sub_batch_id = sb.id
  ORDER BY stored_at DESC
  LIMIT 1
) cbs ON true
WHERE (sbcw.current_weight > 0 OR sbcw.current_weight IS NULL)
  AND sb.held_by_org_id = (SELECT public.get_user_organisation_id())
  AND NOT EXISTS (
    SELECT 1 FROM batch_merges bm WHERE bm.source_batch_id = sb.batch_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM batch_cleaning bc WHERE bc.input_sub_batch_id = sb.id
  );

ALTER VIEW active_sub_batches SET (security_invoker = true);

-- ============================================================================
-- 4. Functions: stop truncating weights to whole grams
-- ============================================================================

-- fn_clean_batch — same signature, NUMERIC output weights
CREATE OR REPLACE FUNCTION fn_clean_batch(
  p_input_batch_id UUID,
  p_material_type TEXT,
  p_material_subtype TEXT DEFAULT NULL,
  p_material_notes TEXT DEFAULT NULL,
  p_is_cleaned BOOLEAN DEFAULT false,
  p_cleaning_notes TEXT DEFAULT NULL,
  p_outputs JSONB DEFAULT '[]'::jsonb -- array of {quality, material_type, weight_grams}
) RETURNS UUID AS $$
DECLARE
  v_cleaning_id UUID;
  v_output_batch_id UUID;
  v_collection_id UUID;
  v_collection_code TEXT;
  v_organisation_id UUID;
  v_sub_batch_count INTEGER;
  v_output JSONB;
  v_quality TEXT;
  v_out_material_type TEXT;
  v_out_weight NUMERIC;
  v_increment INTEGER;
  v_batch_code TEXT;
  v_org_count INTEGER;
BEGIN
  -- Get input batch details
  SELECT b.collection_id, b.organisation_id
  INTO v_collection_id, v_organisation_id
  FROM batches b
  WHERE b.id = p_input_batch_id;

  IF v_collection_id IS NULL THEN
    RAISE EXCEPTION 'Input batch not found or has no collection';
  END IF;

  -- Validate caller is current custodian
  IF NOT is_current_custodian(auth.uid(), p_input_batch_id) THEN
    RAISE EXCEPTION 'Permission denied: not current custodian of batch';
  END IF;

  -- Validate batch has no sub-batches (must be an origin batch)
  SELECT COUNT(*) INTO v_sub_batch_count
  FROM sub_batches WHERE batch_id = p_input_batch_id;

  IF v_sub_batch_count > 0 THEN
    RAISE EXCEPTION 'Cannot clean a batch that already has sub-batches. Use fn_clean_sub_batch instead.';
  END IF;

  -- Validate outputs
  IF jsonb_array_length(p_outputs) = 0 THEN
    RAISE EXCEPTION 'At least one output is required';
  END IF;

  -- If not cleaned, only ORG output is allowed
  IF NOT p_is_cleaned THEN
    SELECT COUNT(*)
    INTO v_org_count
    FROM jsonb_array_elements(p_outputs) AS o
    WHERE o->>'quality' != 'ORG';

    IF v_org_count > 0 THEN
      RAISE EXCEPTION 'When not cleaned, only ORG quality output is allowed';
    END IF;
  END IF;

  -- Get collection code
  SELECT code INTO v_collection_code
  FROM "collection"
  WHERE id = v_collection_id;

  IF v_collection_code IS NULL THEN
    RAISE EXCEPTION 'Collection not found or has no code';
  END IF;

  -- Create cleaning record
  INSERT INTO batch_cleaning (
    input_batch_id, material_type, material_subtype,
    material_notes, is_cleaned, cleaning_notes,
    created_by, organisation_id
  ) VALUES (
    p_input_batch_id, p_material_type, p_material_subtype,
    p_material_notes, p_is_cleaned, p_cleaning_notes,
    auth.uid(), v_organisation_id
  )
  RETURNING id INTO v_cleaning_id;

  -- Create output batches
  FOR v_output IN SELECT * FROM jsonb_array_elements(p_outputs)
  LOOP
    v_quality := v_output->>'quality';
    v_out_material_type := v_output->>'material_type';
    v_out_weight := (v_output->>'weight_grams')::NUMERIC;

    -- Generate batch code: collection_code-quality-increment
    SELECT COALESCE(MAX(
      CASE
        WHEN code ~ ('^' || v_collection_code || '-' || v_quality || '-[0-9]+$')
        THEN CAST(SUBSTRING(code FROM '[0-9]+$') AS INTEGER)
        ELSE 0
      END
    ), 0) + 1
    INTO v_increment
    FROM batches
    WHERE collection_id = v_collection_id;

    v_batch_code := v_collection_code || '-' || v_quality || '-' || v_increment::text;

    -- Create output batch
    INSERT INTO batches (
      collection_id, code, weight_grams, organisation_id
    ) VALUES (
      v_collection_id, v_batch_code, v_out_weight, v_organisation_id
    )
    RETURNING id INTO v_output_batch_id;

    -- Create custody record
    INSERT INTO batch_custody (batch_id, organisation_id, notes)
    VALUES (v_output_batch_id, v_organisation_id, 'Batch created via cleaning');

    -- Create cleaning output record
    INSERT INTO batch_cleaning_output (
      cleaning_id, output_batch_id, quality, material_type, weight_grams
    ) VALUES (
      v_cleaning_id, v_output_batch_id, v_quality, v_out_material_type, v_out_weight
    );

    -- Create initial sub-batch for the output batch
    INSERT INTO sub_batches (batch_id, weight_grams, notes)
    VALUES (v_output_batch_id, v_out_weight, 'Initial sub-batch from cleaning');
  END LOOP;

  RETURN v_cleaning_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION fn_clean_batch(UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT, JSONB) TO authenticated;

-- fn_clean_sub_batch — same signature, NUMERIC weights throughout
CREATE OR REPLACE FUNCTION fn_clean_sub_batch(
  p_sub_batch_id UUID,
  p_material_type TEXT,
  p_material_subtype TEXT DEFAULT NULL,
  p_material_notes TEXT DEFAULT NULL,
  p_is_cleaned BOOLEAN DEFAULT false,
  p_cleaning_notes TEXT DEFAULT NULL,
  p_outputs JSONB DEFAULT '[]'::jsonb -- array of {quality, material_type, weight_grams}
) RETURNS UUID AS $$
DECLARE
  v_cleaning_id UUID;
  v_output_batch_id UUID;
  v_batch_id UUID;
  v_collection_id UUID;
  v_collection_code TEXT;
  v_organisation_id UUID;
  v_sub_batch_weight NUMERIC;
  v_effective_weight NUMERIC;
  v_output JSONB;
  v_quality TEXT;
  v_out_material_type TEXT;
  v_out_weight NUMERIC;
  v_increment INTEGER;
  v_batch_code TEXT;
  v_org_count INTEGER;
BEGIN
  -- Get sub-batch and parent batch details
  SELECT sb.batch_id, sb.weight_grams, b.collection_id, b.organisation_id
  INTO v_batch_id, v_sub_batch_weight, v_collection_id, v_organisation_id
  FROM sub_batches sb
  JOIN batches b ON b.id = sb.batch_id
  WHERE sb.id = p_sub_batch_id;

  IF v_batch_id IS NULL THEN
    RAISE EXCEPTION 'Sub-batch not found';
  END IF;

  -- Cleaning consumes the bag entirely, so the gate is bag custody, not batch
  -- ownership: the owner of the parent batch has no business cleaning a bag
  -- that is currently in someone else's hands.
  IF NOT is_current_bag_custodian(auth.uid(), p_sub_batch_id) THEN
    RAISE EXCEPTION 'Permission denied: not the current holder of this bag';
  END IF;

  -- Reject rather than resolve. An open assignment is a physical fact about
  -- seed a Testing organisation is holding; consuming the bag would leave that
  -- assignment pointing at material that no longer exists. The software must
  -- not close it unilaterally, and must not move it to a successor bag.
  IF EXISTS (
    SELECT 1
    FROM batch_testing_assignment bta
    WHERE bta.sub_batch_id = p_sub_batch_id
      AND bta.closed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot clean a bag with an active testing assignment';
  END IF;

  -- Calculate effective weight of sub-batch
  v_effective_weight := v_sub_batch_weight + COALESCE(
    (SELECT SUM(wa.weight_grams) FROM batch_weight_adjustments wa WHERE wa.sub_batch_id = p_sub_batch_id),
    0
  );

  IF v_effective_weight <= 0 THEN
    RAISE EXCEPTION 'Sub-batch has no weight remaining';
  END IF;

  -- Validate outputs
  IF jsonb_array_length(p_outputs) = 0 THEN
    RAISE EXCEPTION 'At least one output is required';
  END IF;

  -- If not cleaned, only ORG output is allowed
  IF NOT p_is_cleaned THEN
    SELECT COUNT(*)
    INTO v_org_count
    FROM jsonb_array_elements(p_outputs) AS o
    WHERE o->>'quality' != 'ORG';

    IF v_org_count > 0 THEN
      RAISE EXCEPTION 'When not cleaned, only ORG quality output is allowed';
    END IF;
  END IF;

  IF v_collection_id IS NULL THEN
    RAISE EXCEPTION 'Parent batch has no collection';
  END IF;

  -- Get collection code
  SELECT code INTO v_collection_code
  FROM "collection"
  WHERE id = v_collection_id;

  IF v_collection_code IS NULL THEN
    RAISE EXCEPTION 'Collection not found or has no code';
  END IF;

  -- Create cleaning record (linked to both batch and sub-batch)
  INSERT INTO batch_cleaning (
    input_batch_id, input_sub_batch_id, material_type, material_subtype,
    material_notes, is_cleaned, cleaning_notes,
    created_by, organisation_id
  ) VALUES (
    v_batch_id, p_sub_batch_id, p_material_type, p_material_subtype,
    p_material_notes, p_is_cleaned, p_cleaning_notes,
    auth.uid(), v_organisation_id
  )
  RETURNING id INTO v_cleaning_id;

  -- Create output batches (promoted to batch level)
  FOR v_output IN SELECT * FROM jsonb_array_elements(p_outputs)
  LOOP
    v_quality := v_output->>'quality';
    v_out_material_type := v_output->>'material_type';
    v_out_weight := (v_output->>'weight_grams')::NUMERIC;

    -- Generate batch code: collection_code-quality-increment
    SELECT COALESCE(MAX(
      CASE
        WHEN code ~ ('^' || v_collection_code || '-' || v_quality || '-[0-9]+$')
        THEN CAST(SUBSTRING(code FROM '[0-9]+$') AS INTEGER)
        ELSE 0
      END
    ), 0) + 1
    INTO v_increment
    FROM batches
    WHERE collection_id = v_collection_id;

    v_batch_code := v_collection_code || '-' || v_quality || '-' || v_increment::text;

    -- Create output batch
    INSERT INTO batches (
      collection_id, code, weight_grams, organisation_id
    ) VALUES (
      v_collection_id, v_batch_code, v_out_weight, v_organisation_id
    )
    RETURNING id INTO v_output_batch_id;

    -- Create custody record
    INSERT INTO batch_custody (batch_id, organisation_id, notes)
    VALUES (v_output_batch_id, v_organisation_id, 'Batch created via sub-batch cleaning');

    -- Create cleaning output record
    INSERT INTO batch_cleaning_output (
      cleaning_id, output_batch_id, quality, material_type, weight_grams
    ) VALUES (
      v_cleaning_id, v_output_batch_id, v_quality, v_out_material_type, v_out_weight
    );

    -- Create initial sub-batch for the output batch
    INSERT INTO sub_batches (batch_id, weight_grams, notes)
    VALUES (v_output_batch_id, v_out_weight, 'Initial sub-batch from cleaning');
  END LOOP;

  -- Consume the input sub-batch via weight adjustment
  INSERT INTO batch_weight_adjustments (
    sub_batch_id, weight_grams, reason, created_by
  ) VALUES (
    p_sub_batch_id,
    -v_effective_weight,
    'Sub-batch cleaned. Fully consumed.',
    auth.uid()
  );

  RETURN v_cleaning_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION fn_clean_sub_batch(UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT, JSONB) TO authenticated;

-- fn_create_quality_test — consumed weight no longer has to be rounded up to
-- the next whole gram before it can be recorded as an adjustment
CREATE OR REPLACE FUNCTION fn_create_quality_test(
  p_batch_id UUID,
  p_sub_batch_id UUID,
  p_result JSONB,
  p_performed_by_organisation_id UUID
) RETURNS UUID AS $$
DECLARE
  v_test_id UUID;
  v_total_weight NUMERIC := 0;
  v_repeat JSONB;
  v_sub_batch_batch_id UUID;
  v_user_organisation_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT organisation_id INTO v_user_organisation_id
  FROM org_user
  WHERE user_id = auth.uid()
    AND is_active = true;

  IF v_user_organisation_id IS NULL THEN
    RAISE EXCEPTION 'Active organisation membership required';
  END IF;

  IF p_performed_by_organisation_id IS DISTINCT FROM v_user_organisation_id THEN
    RAISE EXCEPTION 'Test organisation does not match authenticated user';
  END IF;

  -- Validate sub-batch belongs to the batch
  SELECT batch_id INTO v_sub_batch_batch_id
  FROM sub_batches WHERE id = p_sub_batch_id;

  IF v_sub_batch_batch_id IS NULL THEN
    RAISE EXCEPTION 'Sub-batch not found';
  END IF;

  IF v_sub_batch_batch_id != p_batch_id THEN
    RAISE EXCEPTION 'Sub-batch does not belong to the specified batch';
  END IF;

  IF NOT (
    is_current_custodian(auth.uid(), p_batch_id)
    OR EXISTS (
      SELECT 1
      FROM batch_testing_assignment bta
      WHERE bta.batch_id = p_batch_id
        AND bta.assigned_to_org_id = v_user_organisation_id
        AND bta.closed_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'Not authorised to test this batch';
  END IF;

  -- Calculate total weight consumed from repeats
  FOR v_repeat IN SELECT * FROM jsonb_array_elements(p_result->'repeats')
  LOOP
    v_total_weight := v_total_weight + COALESCE((v_repeat->>'weight_grams')::NUMERIC, 0);
  END LOOP;

  -- Insert the quality test
  INSERT INTO tests (
    batch_id, sub_batch_id, type, result,
    tested_at, tested_by,
    performed_by_organisation_id
  ) VALUES (
    p_batch_id, p_sub_batch_id, 'quality', p_result,
    now(), auth.uid(),
    p_performed_by_organisation_id
  )
  RETURNING id INTO v_test_id;

  -- Create weight adjustment for seeds consumed in testing
  IF v_total_weight > 0 THEN
    INSERT INTO batch_weight_adjustments (
      sub_batch_id, weight_grams, reason, created_by
    ) VALUES (
      p_sub_batch_id,
      -v_total_weight,
      'Seeds consumed in quality test (test_id: ' || v_test_id || ')',
      auth.uid()
    );
  END IF;

  RETURN v_test_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION fn_create_quality_test(UUID, UUID, JSONB, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_create_quality_test(UUID, UUID, JSONB, UUID) TO authenticated;

-- fn_mix_batches — summed source weights are NUMERIC
CREATE OR REPLACE FUNCTION fn_mix_batches(
  p_source_batch_ids UUID[],
  p_notes TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_org UUID;
  v_new_id UUID;
  v_total_weight NUMERIC;
  v_species_count INTEGER;
  v_ibra_count INTEGER;
  v_species_id UUID;
  v_oldest_date TIMESTAMPTZ;
  v_all_active BOOLEAN;
BEGIN
  IF array_length(p_source_batch_ids, 1) IS NULL OR array_length(p_source_batch_ids, 1) < 2 THEN
    RAISE EXCEPTION 'Provide at least two source batches to mix';
  END IF;

  -- All sources must share the same current custodian
  v_org := assert_same_custodian(p_source_batch_ids);
  IF NOT is_org_member(auth.uid(), v_org) THEN
    RAISE EXCEPTION 'Permission denied: not a member of the custodian organisation';
  END IF;

  -- Mixing zeroes every source batch, so it has to answer for every bag in
  -- them. Reject rather than resolve: a bag held by another organisation is
  -- physically elsewhere, and an open assignment is a commitment about seed in
  -- someone else's hands. Neither may be consumed here, and an assignment must
  -- never be auto-closed or moved to the mixed batch.
  IF EXISTS (
    SELECT 1
    FROM sub_batches sb
    WHERE sb.batch_id = ANY (p_source_batch_ids)
      AND sb.held_by_org_id IS DISTINCT FROM v_org
  ) THEN
    RAISE EXCEPTION 'Cannot mix a batch whose bags are held by another organisation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM batch_testing_assignment bta
    JOIN sub_batches sb ON sb.id = bta.sub_batch_id
    WHERE sb.batch_id = ANY (p_source_batch_ids)
      AND bta.closed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot mix a batch with an active testing assignment';
  END IF;

  -- Validate all batches have the same species
  SELECT COUNT(DISTINCT c.species_id)
  INTO v_species_count
  FROM batches b
  JOIN collection c ON c.id = b.collection_id
  WHERE b.id = ANY (p_source_batch_ids);

  IF v_species_count != 1 THEN
    RAISE EXCEPTION 'All batches must be of the same species to mix';
  END IF;

  -- Get the species_id for code generation
  SELECT DISTINCT c.species_id
  INTO v_species_id
  FROM batches b
  JOIN collection c ON c.id = b.collection_id
  WHERE b.id = ANY (p_source_batch_ids);

  -- Validate all batches are from the same IBRA region
  SELECT COUNT(DISTINCT get_ibra_code_from_location(c.location))
  INTO v_ibra_count
  FROM batches b
  JOIN collection c ON c.id = b.collection_id
  WHERE b.id = ANY (p_source_batch_ids);

  IF v_ibra_count != 1 THEN
    RAISE EXCEPTION 'All batches must be from the same IBRA region to mix';
  END IF;

  -- Validate all source batches are active and get their current weights
  SELECT
    SUM(bcw.current_weight),
    bool_and(bcw.current_weight > 0)
  INTO v_total_weight, v_all_active
  FROM batches b
  JOIN batch_current_weight bcw ON bcw.id = b.id
  WHERE b.id = ANY (p_source_batch_ids);

  IF NOT v_all_active THEN
    RAISE EXCEPTION 'All source batches must be active (current weight > 0)';
  END IF;

  -- Get the oldest collection date
  SELECT MIN(c.created_at)
  INTO v_oldest_date
  FROM batches b
  JOIN collection c ON c.id = b.collection_id
  WHERE b.id = ANY (p_source_batch_ids);

  -- Create new mixed batch (collection_id is NULL since it's a mix of multiple collections)
  INSERT INTO batches (
    id, collection_id, organisation_id, weight_grams, notes, created_at
  ) VALUES (
    gen_random_uuid(), NULL, v_org, v_total_weight, p_notes, v_oldest_date
  )
  RETURNING id INTO v_new_id;

  INSERT INTO batch_custody (batch_id, organisation_id, notes)
  VALUES (v_new_id, v_org, 'Custody on mix');

  -- Record mix sources using batch_merges table
  INSERT INTO batch_merges (merged_batch_id, source_batch_id)
  SELECT v_new_id, unnest(p_source_batch_ids);

  -- Create initial sub-batch for the mixed batch
  INSERT INTO sub_batches (batch_id, weight_grams, notes)
  VALUES (v_new_id, v_total_weight, 'Initial sub-batch from mix');

  RETURN v_new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION fn_mix_batches(UUID[], TEXT) TO authenticated;

-- fn_split_sub_batch — split weights are NUMERIC
CREATE OR REPLACE FUNCTION fn_split_sub_batch(
  p_sub_batch_id UUID,
  p_outputs JSONB -- array of { weight_grams: numeric, notes?: text }
) RETURNS UUID[] AS $$
DECLARE
  v_batch_id UUID;
  v_current_weight NUMERIC;
  v_total_split_weight NUMERIC;
  v_output JSONB;
  v_out_weight NUMERIC;
  v_out_notes TEXT;
  v_new_id UUID;
  v_new_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  -- Get sub-batch details, including current (adjusted) weight
  SELECT sb.batch_id, sbcw.current_weight
  INTO v_batch_id, v_current_weight
  FROM sub_batches sb
  JOIN sub_batch_current_weight sbcw ON sbcw.id = sb.id
  WHERE sb.id = p_sub_batch_id;

  IF v_batch_id IS NULL THEN
    RAISE EXCEPTION 'Sub-batch not found';
  END IF;

  -- Validate caller is current custodian
  IF NOT is_current_custodian(auth.uid(), v_batch_id) THEN
    RAISE EXCEPTION 'Permission denied: not current custodian of batch';
  END IF;

  IF p_outputs IS NULL OR jsonb_array_length(p_outputs) = 0 THEN
    RAISE EXCEPTION 'At least one output is required';
  END IF;

  -- Validate each output and sum total
  SELECT COALESCE(SUM((o->>'weight_grams')::NUMERIC), 0)
  INTO v_total_split_weight
  FROM jsonb_array_elements(p_outputs) AS o;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_outputs) AS o
    WHERE (o->>'weight_grams')::NUMERIC IS NULL
       OR (o->>'weight_grams')::NUMERIC <= 0
  ) THEN
    RAISE EXCEPTION 'Each output weight must be greater than 0';
  END IF;

  IF v_total_split_weight >= v_current_weight THEN
    RAISE EXCEPTION 'Total split weight (% g) must be less than current weight (% g)',
      v_total_split_weight, v_current_weight;
  END IF;

  -- Record the split as a negative adjustment on the source so adjustment
  -- history is preserved and current_weight stays consistent.
  INSERT INTO batch_weight_adjustments (
    sub_batch_id, weight_grams, reason, created_by
  ) VALUES (
    p_sub_batch_id, -v_total_split_weight,
    'Split into ' || jsonb_array_length(p_outputs) || ' new sub-batch(es)',
    auth.uid()
  );

  -- Create each new sub-batch
  FOR v_output IN SELECT * FROM jsonb_array_elements(p_outputs)
  LOOP
    v_out_weight := (v_output->>'weight_grams')::NUMERIC;
    v_out_notes := v_output->>'notes';

    INSERT INTO sub_batches (batch_id, weight_grams, notes)
    VALUES (v_batch_id, v_out_weight, v_out_notes)
    RETURNING id INTO v_new_id;

    v_new_ids := array_append(v_new_ids, v_new_id);
  END LOOP;

  RETURN v_new_ids;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION fn_split_sub_batch(UUID, JSONB) TO authenticated;

-- fn_merge_sub_batches — merged sibling weight is no longer truncated
CREATE OR REPLACE FUNCTION fn_merge_sub_batches(
  p_sub_batch_ids UUID[],
  p_notes TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_batch_id UUID;
  v_batch_count INTEGER;
  v_others_weight NUMERIC;
  v_target_sub_batch_id UUID;
BEGIN
  IF array_length(p_sub_batch_ids, 1) IS NULL OR array_length(p_sub_batch_ids, 1) < 2 THEN
    RAISE EXCEPTION 'Provide at least two sub-batches to merge';
  END IF;

  -- Verify all sub-batches belong to the same batch
  SELECT COUNT(DISTINCT batch_id)
  INTO v_batch_count
  FROM sub_batches
  WHERE id = ANY (p_sub_batch_ids);

  IF v_batch_count != 1 THEN
    RAISE EXCEPTION 'All sub-batches must belong to the same batch';
  END IF;

  -- Get the batch_id
  SELECT DISTINCT batch_id
  INTO v_batch_id
  FROM sub_batches
  WHERE id = ANY (p_sub_batch_ids);

  -- Validate caller is current custodian
  IF NOT is_current_custodian(auth.uid(), v_batch_id) THEN
    RAISE EXCEPTION 'Permission denied: not current custodian of batch';
  END IF;

  -- Use first sub-batch as the target (keep it, delete the rest)
  v_target_sub_batch_id := p_sub_batch_ids[1];

  -- Sum current (adjusted) weight of the non-target sub-batches.
  -- We pull these into the target via a positive adjustment, leaving the
  -- target's weight_grams and existing adjustments intact.
  SELECT COALESCE(SUM(sbcw.current_weight), 0)
  INTO v_others_weight
  FROM sub_batch_current_weight sbcw
  WHERE sbcw.id = ANY (p_sub_batch_ids)
    AND sbcw.id != v_target_sub_batch_id;

  IF v_others_weight > 0 THEN
    INSERT INTO batch_weight_adjustments (
      sub_batch_id, weight_grams, reason, created_by
    ) VALUES (
      v_target_sub_batch_id,
      v_others_weight,
      'Merged in sibling sub-batches',
      auth.uid()
    );
  END IF;

  IF p_notes IS NOT NULL THEN
    UPDATE sub_batches
    SET notes = p_notes
    WHERE id = v_target_sub_batch_id;
  END IF;

  -- Delete the other sub-batches (cascades their adjustments)
  DELETE FROM sub_batches
  WHERE id = ANY (p_sub_batch_ids)
    AND id != v_target_sub_batch_id;

  RETURN v_target_sub_batch_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION fn_merge_sub_batches(UUID[], TEXT) TO authenticated;

-- fn_merge_batches — summed source weights are NUMERIC
CREATE OR REPLACE FUNCTION fn_merge_batches(
  p_source_batch_ids uuid[],
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_collection uuid;
  v_batch_code text;
  v_new_id uuid;
  v_same bool;
  v_total_weight numeric;
BEGIN
  IF array_length(p_source_batch_ids, 1) IS NULL OR array_length(p_source_batch_ids, 1) < 2 THEN
    RAISE EXCEPTION 'Provide at least two source batches to merge';
  END IF;

  -- All sources must share the same current custodian
  v_org := assert_same_custodian(p_source_batch_ids);
  IF NOT is_org_member(auth.uid(), v_org) THEN
    RAISE EXCEPTION 'Permission denied: not a member of the custodian organisation';
  END IF;

  -- A whole-batch merge zeroes every source batch, so it has to answer for
  -- every bag in them. Reject rather than resolve: a bag held by another
  -- organisation is physically elsewhere, and an open assignment is a
  -- commitment about seed in someone else's hands. Neither may be consumed
  -- here, and an assignment must never be auto-closed or moved to the merged
  -- batch — if a future workflow needs that, it must do it in this same
  -- transaction and never leave an assignment pointing at deleted material.
  IF EXISTS (
    SELECT 1
    FROM sub_batches sb
    WHERE sb.batch_id = ANY (p_source_batch_ids)
      AND sb.held_by_org_id IS DISTINCT FROM v_org
  ) THEN
    RAISE EXCEPTION 'Cannot merge a batch whose bags are held by another organisation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM batch_testing_assignment bta
    JOIN sub_batches sb ON sb.id = bta.sub_batch_id
    WHERE sb.batch_id = ANY (p_source_batch_ids)
      AND bta.closed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot merge a batch with an active testing assignment';
  END IF;

  -- Validate that all batches share the same collection_id
  SELECT COUNT(DISTINCT collection_id) = 1
  INTO v_same
  FROM batches
  WHERE id = ANY (p_source_batch_ids);

  IF NOT v_same THEN
    RAISE EXCEPTION 'All batches must be derived from the same collection';
  END IF;

  -- Validate that all batches have the same code
  SELECT COUNT(DISTINCT code) = 1
  INTO v_same
  FROM batches
  WHERE id = ANY (p_source_batch_ids);

  IF NOT v_same THEN
    RAISE EXCEPTION 'All batches must have the same code to be merged';
  END IF;

  -- Get collection_id and code for the new batch
  SELECT DISTINCT collection_id, code
  INTO v_collection, v_batch_code
  FROM batches
  WHERE id = ANY (p_source_batch_ids);

  -- Validate all source batches are active and get their current weights
  SELECT
      SUM(bcw.current_weight),
      bool_and(bcw.current_weight > 0)
  INTO
      v_total_weight,
      v_same
  FROM batches b
  JOIN batch_current_weight bcw ON bcw.id = b.id
  WHERE b.id = ANY (p_source_batch_ids);

  IF NOT v_same THEN
    RAISE EXCEPTION 'All source batches must be active (current weight > 0)';
  END IF;

  INSERT INTO batches (
    id,
    collection_id,
    code,
    organisation_id,
    weight_grams,
    notes
  )
  VALUES (
    gen_random_uuid(),
    v_collection,
    v_batch_code,  -- Use shared code from source batches
    v_org,
    v_total_weight,
    p_notes
  )
  RETURNING id INTO v_new_id;

  INSERT INTO batch_custody (batch_id, organisation_id, notes)
  VALUES (v_new_id, v_org, 'Custody on merge');

  INSERT INTO batch_merges (merged_batch_id, source_batch_id)
  SELECT v_new_id, unnest(p_source_batch_ids);

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_merge_batches(uuid[], text) TO authenticated;

-- ============================================================================
-- 5. Functions whose signatures carry a weight — dropped and recreated so the
--    integer overloads don't linger and make the RPC call ambiguous
-- ============================================================================

DROP FUNCTION IF EXISTS fn_split_batch(uuid, integer, text);

CREATE FUNCTION fn_split_batch(
  p_parent_batch_id uuid,
  p_weight_grams numeric DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_collection uuid;
  v_parent_code text;
  v_child_id uuid;
  v_parent_current_weight numeric;
  v_child_weight numeric;
BEGIN
  -- Caller must be current custodian of the parent
  v_org := current_custodian_org_id(p_parent_batch_id);
  IF v_org IS NULL OR NOT is_org_member(auth.uid(), v_org) THEN
    RAISE EXCEPTION 'Permission denied: not current custodian of parent batch';
  END IF;

  -- Get parent batch properties for inheritance
  SELECT
    b.collection_id,
    b.code,
    bcw.current_weight
  INTO
    v_collection,
    v_parent_code,
    v_parent_current_weight
  FROM batches b
  JOIN batch_current_weight bcw ON bcw.id = b.id
  WHERE b.id = p_parent_batch_id;

  IF v_collection IS NULL THEN
    RAISE EXCEPTION 'Parent batch not found';
  END IF;

  -- Validate parent batch is active
  IF v_parent_current_weight IS NULL OR v_parent_current_weight <= 0 THEN
    RAISE EXCEPTION 'Parent batch is not active or has no weight remaining';
  END IF;

  -- Determine child weight (provided or default to half of current weight).
  -- The old GREATEST(1, ...) floor existed because integer division truncated
  -- a 1 g parent to 0; numeric halves exactly, so the floor would now round a
  -- legitimate sub-gram split up to a whole gram.
  v_child_weight := COALESCE(p_weight_grams, v_parent_current_weight / 2);

  -- Validate child weight doesn't exceed parent's current weight
  IF v_child_weight > v_parent_current_weight THEN
    RAISE EXCEPTION 'Child weight (% g) exceeds parent current weight (% g)',
      v_child_weight, v_parent_current_weight;
  END IF;

  -- Validate child weight is positive
  IF v_child_weight <= 0 THEN
    RAISE EXCEPTION 'Child batch weight must be greater than 0';
  END IF;

  -- Use provided values or inherit from parent
  INSERT INTO batches (
    id,
    collection_id,
    code,
    organisation_id,
    weight_grams,
    notes
  )
  VALUES (
    gen_random_uuid(),
    v_collection,
    v_parent_code,  -- Child inherits exact parent code
    v_org,
    v_child_weight,
    p_notes
  )
  RETURNING id INTO v_child_id;

  INSERT INTO batch_splits (parent_batch_id, child_batch_id)
  VALUES (p_parent_batch_id, v_child_id);

  INSERT INTO batch_custody (batch_id, organisation_id, notes)
  VALUES (v_child_id, v_org, 'Custody inherited on split');

  RETURN v_child_id;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_split_batch(uuid, numeric, text) TO authenticated;
