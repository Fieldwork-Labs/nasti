-- Simplified batch lineage view
-- Shows how each batch was created and its parent batch(es)

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

-- Merged batches: created from multiple sources
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

-- Processed batches: created from processing an input batch
SELECT
  bp.output_batch_id AS batch_id,
  bp.input_batch_id AS parent_batch_id,
  'processing' AS creation_event,
  b.created_at AS created_at,
  jsonb_build_object(
    'batch_processing_id', bp.id,
    'process', bp.process,
    'quality_assessment', bp.quality_assessment,
    'output_weight', b.weight_grams
  ) AS event_details
FROM batch_processing bp
JOIN batches b ON b.id = bp.output_batch_id

UNION ALL

-- Initial batches: created directly from collections (not from other batches)
SELECT
  b.id AS batch_id,
  NULL::UUID AS parent_batch_id,
  'initial' AS creation_event,
  b.created_at AS created_at,
  jsonb_build_object(
    'collection_id', b.collection_id
  ) AS event_details
FROM batches b
WHERE NOT EXISTS (
  -- Not a split child
  SELECT 1 FROM batch_splits bs WHERE bs.child_batch_id = b.id
)
AND NOT EXISTS (
  -- Not a merge result
  SELECT 1 FROM batch_merges bm WHERE bm.merged_batch_id = b.id
)
AND NOT EXISTS (
  -- Not a processing output
  SELECT 1 FROM batch_processing bp WHERE bp.output_batch_id = b.id
);

-- Add security invoker to respect RLS policies of underlying tables
ALTER VIEW batch_lineage SET (security_invoker = true);

COMMENT ON VIEW batch_lineage IS 'Shows the lineage of each batch: how it was created and its parent batch(es). Use WHERE batch_id = $1 to get the creation event for a specific batch.';
COMMENT ON COLUMN batch_lineage.parent_batch_id IS '@fk public.batches.id';
