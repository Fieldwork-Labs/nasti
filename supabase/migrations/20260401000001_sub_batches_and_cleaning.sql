-- ============================================================================
-- SUB-BATCHES: Storage-level portions within a batch
-- ============================================================================

CREATE TABLE sub_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  weight_grams INTEGER NOT NULL CHECK (weight_grams > 0),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sub_batches_batch_id ON sub_batches(batch_id);

ALTER TABLE sub_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY sub_batches_select_policy ON sub_batches
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM current_batch_custody cbc
      WHERE cbc.batch_id = sub_batches.batch_id
        AND is_org_member(auth.uid(), cbc.organisation_id)
    )
  );

CREATE POLICY sub_batches_insert_policy ON sub_batches
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM current_batch_custody cbc
      WHERE cbc.batch_id = sub_batches.batch_id
        AND is_org_member(auth.uid(), cbc.organisation_id)
    )
  );

CREATE POLICY sub_batches_update_policy ON sub_batches
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM current_batch_custody cbc
      WHERE cbc.batch_id = sub_batches.batch_id
        AND is_org_member(auth.uid(), cbc.organisation_id)
    )
  );

CREATE POLICY sub_batches_delete_policy ON sub_batches
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM current_batch_custody cbc
      WHERE cbc.batch_id = sub_batches.batch_id
        AND is_org_member(auth.uid(), cbc.organisation_id)
    )
  );

-- Update batch_storage to reference sub-batches
ALTER TABLE batch_storage ADD COLUMN sub_batch_id UUID REFERENCES sub_batches(id) ON DELETE SET NULL;
CREATE INDEX idx_batch_storage_sub_batch_id ON batch_storage(sub_batch_id);

-- Recreate current_batch_storage view to track per sub-batch
-- Must DROP first since column list is changing
DROP VIEW IF EXISTS current_batch_storage CASCADE;
CREATE VIEW current_batch_storage AS
-- Sub-batch level storage (new system)
SELECT * FROM (
  SELECT DISTINCT ON (sub_batch_id)
    id,
    batch_id,
    sub_batch_id,
    location_id,
    stored_at,
    notes
  FROM batch_storage
  WHERE moved_out_at IS NULL
    AND sub_batch_id IS NOT NULL
  ORDER BY sub_batch_id, stored_at DESC
) sub_batch_storage

UNION ALL

-- Batch-level storage (legacy batches without sub-batches)
SELECT * FROM (
  SELECT DISTINCT ON (batch_id)
    id,
    batch_id,
    sub_batch_id,
    location_id,
    stored_at,
    notes
  FROM batch_storage
  WHERE moved_out_at IS NULL
    AND sub_batch_id IS NULL
  ORDER BY batch_id, stored_at DESC
) batch_level_storage;

-- ============================================================================
-- BATCH CLEANING
-- ============================================================================

CREATE TABLE batch_cleaning (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  input_batch_id UUID REFERENCES batches(id) ON DELETE RESTRICT,
  material_type TEXT NOT NULL CHECK (material_type IN ('seed', 'covering_structure')),
  material_subtype TEXT, -- pod, floret, capsule, etc.
  material_notes TEXT,
  is_cleaned BOOLEAN NOT NULL DEFAULT false,
  cleaning_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  organisation_id UUID NOT NULL REFERENCES organisation(id)
);

CREATE INDEX idx_batch_cleaning_input_batch ON batch_cleaning(input_batch_id);

CREATE TABLE batch_cleaning_output (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cleaning_id UUID NOT NULL REFERENCES batch_cleaning(id) ON DELETE CASCADE,
  output_batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE RESTRICT,
  quality TEXT NOT NULL CHECK (quality IN ('ORG', 'HQ', 'LQ')),
  material_type TEXT NOT NULL CHECK (material_type IN ('seed', 'covering_structure')),
  weight_grams INTEGER NOT NULL CHECK (weight_grams > 0)
);

CREATE INDEX idx_batch_cleaning_output_cleaning ON batch_cleaning_output(cleaning_id);
CREATE INDEX idx_batch_cleaning_output_batch ON batch_cleaning_output(output_batch_id);

-- RLS for batch_cleaning
ALTER TABLE batch_cleaning ENABLE ROW LEVEL SECURITY;

CREATE POLICY batch_cleaning_select_policy ON batch_cleaning
  FOR SELECT USING (organisation_id IN (
    SELECT organisation_id FROM org_user WHERE user_id = auth.uid()
  ));

CREATE POLICY batch_cleaning_insert_policy ON batch_cleaning
  FOR INSERT WITH CHECK (organisation_id IN (
    SELECT organisation_id FROM org_user WHERE user_id = auth.uid()
  ));

-- RLS for batch_cleaning_output
ALTER TABLE batch_cleaning_output ENABLE ROW LEVEL SECURITY;

CREATE POLICY batch_cleaning_output_select_policy ON batch_cleaning_output
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM batch_cleaning bc
      WHERE bc.id = batch_cleaning_output.cleaning_id
        AND bc.organisation_id IN (
          SELECT organisation_id FROM org_user WHERE user_id = auth.uid()
        )
    )
  );

CREATE POLICY batch_cleaning_output_insert_policy ON batch_cleaning_output
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM batch_cleaning bc
      WHERE bc.id = batch_cleaning_output.cleaning_id
        AND bc.organisation_id IN (
          SELECT organisation_id FROM org_user WHERE user_id = auth.uid()
        )
    )
  );

-- ============================================================================
-- FUNCTION: fn_clean_batch
-- Cleaning produces up to 3 outputs (ORG, HQ, LQ), consumes the input batch.
-- Testing results are NOT inherited by output batches.
-- ============================================================================

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
  v_input_weight INTEGER;
  v_output JSONB;
  v_quality TEXT;
  v_out_material_type TEXT;
  v_out_weight INTEGER;
  v_increment INTEGER;
  v_batch_code TEXT;
  v_org_count INTEGER;
BEGIN
  -- Get input batch details
  SELECT b.collection_id, b.organisation_id, bcw.current_weight
  INTO v_collection_id, v_organisation_id, v_input_weight
  FROM batches b
  LEFT JOIN batch_current_weight bcw ON bcw.id = b.id
  WHERE b.id = p_input_batch_id;

  IF v_collection_id IS NULL THEN
    RAISE EXCEPTION 'Input batch not found or has no collection';
  END IF;

  -- Validate caller is current custodian
  IF NOT is_current_custodian(auth.uid(), p_input_batch_id) THEN
    RAISE EXCEPTION 'Permission denied: not current custodian of batch';
  END IF;

  -- Validate input batch is active (skip for new batches with no weight yet)
  IF v_input_weight IS NOT NULL AND v_input_weight <= 0 THEN
    RAISE EXCEPTION 'Input batch is not active or has no weight remaining';
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
    v_out_weight := (v_output->>'weight_grams')::INTEGER;

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

  -- Consume input batch (weight adjustment to zero), only if it has weight
  IF v_input_weight IS NOT NULL AND v_input_weight > 0 THEN
    INSERT INTO batch_weight_adjustments (
      batch_id, weight_grams, reason, created_by
    ) VALUES (
      p_input_batch_id,
      -v_input_weight,
      'Batch cleaned. Input fully consumed.',
      auth.uid()
    );
  END IF;

  RETURN v_cleaning_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION fn_clean_batch(UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT, JSONB) TO authenticated;

-- ============================================================================
-- FUNCTION: fn_mix_batches
-- Mix batches from different collections (species + IBRA must match).
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_mix_batches(
  p_source_batch_ids UUID[],
  p_notes TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_org UUID;
  v_new_id UUID;
  v_total_weight INTEGER;
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

-- ============================================================================
-- FUNCTION: fn_split_sub_batch
-- Split a sub-batch into two sub-batches within the same parent batch.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_split_sub_batch(
  p_sub_batch_id UUID,
  p_new_weight INTEGER,
  p_notes TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_batch_id UUID;
  v_current_weight INTEGER;
  v_remaining_weight INTEGER;
  v_new_sub_batch_id UUID;
BEGIN
  -- Get sub-batch details
  SELECT batch_id, weight_grams
  INTO v_batch_id, v_current_weight
  FROM sub_batches
  WHERE id = p_sub_batch_id;

  IF v_batch_id IS NULL THEN
    RAISE EXCEPTION 'Sub-batch not found';
  END IF;

  -- Validate caller is current custodian
  IF NOT is_current_custodian(auth.uid(), v_batch_id) THEN
    RAISE EXCEPTION 'Permission denied: not current custodian of batch';
  END IF;

  -- Validate weight
  IF p_new_weight <= 0 THEN
    RAISE EXCEPTION 'New sub-batch weight must be greater than 0';
  END IF;

  v_remaining_weight := v_current_weight - p_new_weight;

  IF v_remaining_weight <= 0 THEN
    RAISE EXCEPTION 'Split weight (% g) must be less than current weight (% g)',
      p_new_weight, v_current_weight;
  END IF;

  -- Update original sub-batch weight
  UPDATE sub_batches
  SET weight_grams = v_remaining_weight
  WHERE id = p_sub_batch_id;

  -- Create new sub-batch
  INSERT INTO sub_batches (batch_id, weight_grams, notes)
  VALUES (v_batch_id, p_new_weight, p_notes)
  RETURNING id INTO v_new_sub_batch_id;

  RETURN v_new_sub_batch_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION fn_split_sub_batch(UUID, INTEGER, TEXT) TO authenticated;

-- ============================================================================
-- FUNCTION: fn_merge_sub_batches
-- Merge multiple sub-batches within the same batch into one.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_merge_sub_batches(
  p_sub_batch_ids UUID[],
  p_notes TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_batch_id UUID;
  v_batch_count INTEGER;
  v_total_weight INTEGER;
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

  -- Get total weight
  SELECT SUM(weight_grams)
  INTO v_total_weight
  FROM sub_batches
  WHERE id = ANY (p_sub_batch_ids);

  -- Use first sub-batch as the target (keep it, delete the rest)
  v_target_sub_batch_id := p_sub_batch_ids[1];

  -- Update target sub-batch with combined weight
  UPDATE sub_batches
  SET weight_grams = v_total_weight,
      notes = COALESCE(p_notes, notes)
  WHERE id = v_target_sub_batch_id;

  -- Delete the other sub-batches
  DELETE FROM sub_batches
  WHERE id = ANY (p_sub_batch_ids)
    AND id != v_target_sub_batch_id;

  RETURN v_target_sub_batch_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION fn_merge_sub_batches(UUID[], TEXT) TO authenticated;

-- ============================================================================
-- RECREATE batch_lineage view to include treating and cleaning
-- ============================================================================

CREATE OR REPLACE VIEW batch_lineage AS

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

-- ============================================================================
-- RECREATE active_batches view with cleaning support
-- ============================================================================

DROP VIEW IF EXISTS active_batches;

CREATE VIEW active_batches AS
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
      SELECT 1 FROM ancestors anc
      INNER JOIN treatments bt ON (
        bt.input_batch_id = anc.batch_id OR bt.output_batch_id = anc.batch_id
      )
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
  bcw.current_weight > 0 OR bcw.current_weight IS NULL;

-- ============================================================================
-- UPDATE batch_lineage_to_collections to include treating and cleaning
-- ============================================================================

CREATE OR REPLACE VIEW batch_lineage_to_collections AS
WITH RECURSIVE lineage (batch_id, collection_id) AS (
  -- base case: direct batches with their own collection_id
  SELECT id AS batch_id, collection_id
  FROM batches
  WHERE collection_id IS NOT NULL

  UNION ALL

  -- recursive case: follow splits, merges, treating, and cleaning
  SELECT next_batch.batch_id, l.collection_id
  FROM lineage l
  JOIN (
    -- splits
    SELECT parent_batch_id AS source_id, child_batch_id AS batch_id
    FROM batch_splits

    UNION ALL

    -- merges (also used for mixes)
    SELECT source_batch_id AS source_id, merged_batch_id AS batch_id
    FROM batch_merges

    UNION ALL

    -- treating
    SELECT input_batch_id AS source_id, output_batch_id AS batch_id
    FROM treatments
    WHERE input_batch_id IS NOT NULL

    UNION ALL

    -- cleaning
    SELECT bc.input_batch_id AS source_id, bco.output_batch_id AS batch_id
    FROM batch_cleaning bc
    JOIN batch_cleaning_output bco ON bco.cleaning_id = bc.id
    WHERE bc.input_batch_id IS NOT NULL
  ) next_batch ON next_batch.source_id = l.batch_id
)
SELECT DISTINCT batch_id, collection_id
FROM lineage;

-- ============================================================================
-- BACKFILL: Link existing batch_storage records to their sub-batches
-- For each batch_storage record without a sub_batch_id, find the single
-- sub-batch for that batch (created by the trigger above) and link it.
-- ============================================================================
UPDATE batch_storage bs
SET sub_batch_id = sb.id
FROM sub_batches sb
WHERE bs.batch_id = sb.batch_id
  AND bs.sub_batch_id IS NULL;
