-- Batch weight adjustments for corrections and audit trail
SET search_path TO public;

-- TABLE: batch_weight_adjustments
CREATE TABLE batch_weight_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  weight_grams INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- INDEX: for efficient lookups by batch
CREATE INDEX idx_batch_weight_adjustments_batch_id ON batch_weight_adjustments(batch_id);

-- RLS POLICY
ALTER TABLE batch_weight_adjustments ENABLE ROW LEVEL SECURITY;

-- Policy: current custodian organisation members can view adjustments
CREATE POLICY custodian_can_view_adjustments ON batch_weight_adjustments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM current_batch_custody cbc
      WHERE cbc.batch_id = batch_weight_adjustments.batch_id
        AND is_org_member(auth.uid(), cbc.organisation_id)
    )
  );

-- Policy: current custodian organisation members can insert adjustments
CREATE POLICY custodian_can_insert_adjustments ON batch_weight_adjustments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM current_batch_custody cbc
      WHERE cbc.batch_id = batch_weight_adjustments.batch_id
        AND is_org_member(auth.uid(), cbc.organisation_id)
    )
  );

-- VIEW: batch_current_weight
-- Calculates the current weight of each batch from immutable events
CREATE VIEW batch_current_weight AS
SELECT
  b.id,
  b.weight_grams as original_weight,
  CASE
    -- If batch was merged into another, it's fully consumed
    WHEN EXISTS (
      SELECT 1 FROM batch_merges bm
      WHERE bm.source_batch_id = b.id
    ) THEN 0
    -- Otherwise: original weight - splits + adjustments
    ELSE b.weight_grams
      - COALESCE(
          (SELECT SUM(child.weight_grams)
           FROM batch_splits bs
           JOIN batches child ON child.id = bs.child_batch_id
           WHERE bs.parent_batch_id = b.id),
          0)
      + COALESCE(
          (SELECT SUM(wa.weight_grams)
           FROM batch_weight_adjustments wa
           WHERE wa.batch_id = b.id),
          0)
  END as current_weight
FROM batches b;

-- VIEW: active_batches
-- Shows only batches with current weight > 0 (not fully consumed)
CREATE VIEW active_batches AS
SELECT
  b.*,
  bcw.original_weight,
  bcw.current_weight
FROM batches b
JOIN batch_current_weight bcw ON bcw.id = b.id
WHERE bcw.current_weight > 0;

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
