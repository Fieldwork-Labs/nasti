-- VIEW: active_batches
-- Shows only batches with current weight > 0 (not fully consumed) OR with NULL weight
CREATE OR REPLACE VIEW public.active_batches AS
SELECT DISTINCT
  b.*,
  bcw.original_weight,
  bcw.current_weight,
  cbs.location_id as current_location_id,
  (
    -- Check if this batch or any of its ancestors were involved in processing
    WITH RECURSIVE ancestors AS (
      -- Base case: the batch itself
      SELECT
        batch_id,
        parent_batch_id,
        event_details,
        creation_event
      FROM batch_lineage
      WHERE batch_id = b.id

      UNION

      -- Recursive case: follow parent relationships
      SELECT
        bl.batch_id,
        bl.parent_batch_id,
        bl.event_details,
        bl.creation_event
      FROM batch_lineage bl
      INNER JOIN ancestors a ON (
        -- Normal single parent (split, processing)
        bl.batch_id = a.parent_batch_id
        OR
        -- Multiple parents from merge - extract from JSON array
        (
          a.creation_event = 'merge'
          AND bl.batch_id IN (
            SELECT jsonb_array_elements_text(a.event_details->'source_batch_ids')::uuid
          )
        )
      )
    )
    SELECT EXISTS (
      SELECT 1
      FROM ancestors anc
      INNER JOIN batch_processing bp ON (
        bp.input_batch_id = anc.batch_id
        OR bp.output_batch_id = anc.batch_id
      )
    )
  ) AS is_processed
FROM
  batches b
  JOIN batch_current_weight bcw ON bcw.id = b.id
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