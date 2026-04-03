-- VIEW: active_batches (initial version)
-- NOTE: This view is dropped and recreated in the quality_test_statistics migration
-- and again in the sub_batches_and_cleaning migration with treating/cleaning support
CREATE OR REPLACE VIEW public.active_batches AS
SELECT DISTINCT
  b.*,
  bcw.original_weight,
  bcw.current_weight,
  cbs.location_id as current_location_id,
  c.species_id
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
  bcw.current_weight > 0
  OR bcw.current_weight IS NULL;
