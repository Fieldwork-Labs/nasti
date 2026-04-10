-- Batch weight adjustments for corrections and audit trail
-- NOTE: sub_batch_id FK constraint is added in the sub_batches_and_cleaning migration
-- once the sub_batches table exists.
SET search_path TO public;

-- TABLE: batch_weight_adjustments
CREATE TABLE batch_weight_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_batch_id UUID NOT NULL,
  weight_grams INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- INDEX: for efficient lookups by sub-batch
CREATE INDEX idx_batch_weight_adjustments_sub_batch_id ON batch_weight_adjustments(sub_batch_id);

-- RLS POLICY
ALTER TABLE batch_weight_adjustments ENABLE ROW LEVEL SECURITY;

-- NOTE: Placeholder policies. Proper policies referencing sub_batches are created
-- in the sub_batches_and_cleaning migration once that table exists.
CREATE POLICY custodian_can_view_adjustments ON batch_weight_adjustments
  FOR SELECT
  USING (created_by = auth.uid());

CREATE POLICY custodian_can_insert_adjustments ON batch_weight_adjustments
  FOR INSERT
  WITH CHECK (created_by = auth.uid());

-- VIEW: batch_current_weight (placeholder)
-- This is recreated in the sub_batches_and_cleaning migration to derive weight
-- from sub-batches. This placeholder uses batch.weight_grams directly.
CREATE VIEW batch_current_weight AS
SELECT
  b.id,
  b.weight_grams as original_weight,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM batch_merges bm
      WHERE bm.source_batch_id = b.id
    ) THEN 0
    ELSE COALESCE(b.weight_grams, 0)
  END as current_weight
FROM batches b;

-- FUNCTION: Computed field for batch weights (for PostgREST)
-- Returns weight information for a given batch as a JSON object
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
