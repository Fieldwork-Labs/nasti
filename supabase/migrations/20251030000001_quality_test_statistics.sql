-- Add statistics column to tests table
ALTER TABLE tests ADD COLUMN statistics JSONB;

-- Create index on statistics column for performance
CREATE INDEX idx_tests_statistics ON tests USING gin(statistics);

-- ============================================================================
-- UTILITY FUNCTIONS FOR QUALITY TEST STATISTICS
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_standard_deviation(input_values NUMERIC[])
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  n INTEGER;
  mean_val NUMERIC;
  sum_val NUMERIC;
  sum_squares NUMERIC;
  variance NUMERIC;
BEGIN
  n := array_length(input_values, 1);
  IF n IS NULL OR n < 2 THEN
    RETURN NULL;
  END IF;

  SELECT SUM(val), SUM(val * val)
  INTO sum_val, sum_squares
  FROM unnest(input_values) AS val;

  mean_val := sum_val / n;
  variance := (sum_squares - n * mean_val * mean_val) / (n - 1);
  RETURN SQRT(variance);
END;
$$;

CREATE OR REPLACE FUNCTION calculate_quality_test_statistics(p_test_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  test_result JSONB;
  batch_id UUID;
  batch_weight NUMERIC;
  repeats JSONB;
  repeat_count INTEGER;
  viability_values NUMERIC[] := ARRAY[]::NUMERIC[];
  per_seed_weights NUMERIC[] := ARRAY[]::NUMERIC[];
  repeat_item JSONB;
  viable_count NUMERIC;
  dead_count NUMERIC;
  total_count NUMERIC;
  weight_grams NUMERIC;
  psu_grams NUMERIC;
  inert_weight NUMERIC;
  other_species_weight NUMERIC;
  total_sample_weight NUMERIC;
  mean_viability NUMERIC;
  mean_seed_weight NUMERIC;
  pure_seed_fraction NUMERIC;
  pure_live_seed_fraction NUMERIC;
  batch_seed_count NUMERIC;
  batch_pure_seed_count INTEGER;
  batch_pure_live_seed_count INTEGER;
  std_dev NUMERIC;
  standard_error NUMERIC;
  result JSONB;
BEGIN
  SELECT t.result, t.batch_id INTO test_result, batch_id
  FROM tests t WHERE t.id = p_test_id;

  IF test_result IS NULL THEN RETURN NULL; END IF;

  SELECT bcw.current_weight INTO batch_weight
  FROM batch_current_weight bcw WHERE bcw.id = batch_id;

  repeats := test_result->'repeats';
  repeat_count := jsonb_array_length(repeats);

  IF repeat_count IS NULL OR repeat_count = 0 THEN RETURN NULL; END IF;

  FOR i IN 0..(repeat_count - 1) LOOP
    repeat_item := repeats->i;
    viable_count := (repeat_item->>'viable_seed_count')::NUMERIC;
    dead_count := (repeat_item->>'dead_seed_count')::NUMERIC;
    weight_grams := (repeat_item->>'weight_grams')::NUMERIC;
    total_count := viable_count + dead_count;

    IF total_count = 0 THEN
      viability_values := array_append(viability_values, 0);
      per_seed_weights := array_append(per_seed_weights, 0);
    ELSE
      viability_values := array_append(viability_values, viable_count / total_count);
      per_seed_weights := array_append(per_seed_weights, weight_grams / total_count);
    END IF;
  END LOOP;

  SELECT AVG(val) INTO mean_viability FROM unnest(viability_values) AS val;
  SELECT AVG(val) INTO mean_seed_weight FROM unnest(per_seed_weights) AS val;

  psu_grams := (test_result->>'psu_grams')::NUMERIC;
  inert_weight := COALESCE((test_result->>'inert_seed_weight_grams')::NUMERIC, 0);
  other_species_weight := COALESCE((test_result->>'other_species_seeds_grams')::NUMERIC, 0);
  total_sample_weight := psu_grams + inert_weight + other_species_weight;

  IF total_sample_weight = 0 THEN
    pure_seed_fraction := 0;
  ELSE
    pure_seed_fraction := psu_grams / total_sample_weight;
  END IF;

  pure_live_seed_fraction := pure_seed_fraction * mean_viability;

  IF batch_weight IS NOT NULL AND batch_weight > 0 AND mean_seed_weight > 0 THEN
    batch_seed_count := batch_weight / mean_seed_weight;
    batch_pure_seed_count := ROUND(batch_seed_count * pure_seed_fraction)::INTEGER;
    batch_pure_live_seed_count := ROUND(batch_seed_count * pure_live_seed_fraction)::INTEGER;
  ELSE
    batch_seed_count := NULL;
    batch_pure_seed_count := NULL;
    batch_pure_live_seed_count := NULL;
  END IF;

  std_dev := calculate_standard_deviation(viability_values);
  IF std_dev IS NOT NULL THEN
    standard_error := std_dev / SQRT(repeat_count);
  ELSE
    standard_error := NULL;
  END IF;

  result := jsonb_build_object(
    'tpsu', ROUND(mean_seed_weight::NUMERIC, 6),
    'psu', ROUND(pure_seed_fraction::NUMERIC, 6),
    'vsu', ROUND(mean_viability::NUMERIC, 6),
    'pls', ROUND(pure_live_seed_fraction::NUMERIC, 6),
    'plsCount', batch_pure_live_seed_count,
    'psuCount', batch_pure_seed_count,
    'standardError', CASE WHEN standard_error IS NOT NULL
                     THEN ROUND(standard_error::NUMERIC, 6) ELSE NULL END
  );

  RETURN result;
END;
$$;

-- ============================================================================
-- TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_quality_test_statistics()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.type = 'quality' AND NEW.result IS NOT NULL THEN
    UPDATE tests
    SET statistics = calculate_quality_test_statistics(NEW.id)
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_quality_test_statistics
  AFTER INSERT OR UPDATE OF result ON tests
  FOR EACH ROW
  EXECUTE FUNCTION update_quality_test_statistics();

-- ============================================================================
-- HELPER FOR MERGED BATCH STATISTICS INHERITANCE
-- ============================================================================

CREATE OR REPLACE FUNCTION get_merged_batch_inherited_statistics(p_merged_batch_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  source_batch_ids UUID[];
  source_count INTEGER;
  stats_count INTEGER;
  distinct_stats_count INTEGER;
  shared_statistics JSONB;
BEGIN
  SELECT ARRAY(
    SELECT jsonb_array_elements_text(event_details->'source_batch_ids')::UUID
  )
  INTO source_batch_ids
  FROM batch_lineage
  WHERE batch_id = p_merged_batch_id AND creation_event = 'merge';

  IF source_batch_ids IS NULL OR array_length(source_batch_ids, 1) IS NULL THEN
    RETURN NULL;
  END IF;

  source_count := array_length(source_batch_ids, 1);

  WITH source_stats AS (
    SELECT DISTINCT ON (source_id) t.statistics
    FROM unnest(source_batch_ids) AS source_id
    LEFT JOIN tests t ON t.batch_id = source_id AND t.type = 'quality'
    WHERE t.statistics IS NOT NULL
    ORDER BY source_id, t.tested_at DESC
  )
  SELECT COUNT(*), COUNT(DISTINCT statistics), (ARRAY_AGG(statistics))[1]
  INTO stats_count, distinct_stats_count, shared_statistics
  FROM source_stats;

  IF stats_count = source_count AND distinct_stats_count = 1 THEN
    RETURN shared_statistics;
  ELSE
    RETURN NULL;
  END IF;
END;
$$;

-- ============================================================================
-- UPDATE ACTIVE_BATCHES VIEW (intermediate version, no cleaning yet)
-- NOTE: This is recreated again in 20260401 migration with cleaning support
-- ============================================================================

DROP VIEW IF EXISTS active_batches;

CREATE VIEW active_batches AS
SELECT DISTINCT
  b.*,
  bcw.original_weight,
  bcw.current_weight,
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
  false AS is_cleaned,
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
WHERE
  bcw.current_weight > 0 OR bcw.current_weight IS NULL;
