-- Update RLS policies to allow testing organisations to view assigned batches

-- Drop existing SELECT policy on batches
DROP POLICY IF EXISTS "batch_select_policy" ON "public"."batches";

-- Create new SELECT policy that allows:
-- 1. Organisation members to see their own batches
-- 2. Testing organisations to see batches assigned to them
CREATE POLICY "batch_select_policy" ON "public"."batches"
  FOR SELECT
  USING (
    -- User's organisation owns the batch (via current custody)
    EXISTS (
      SELECT 1
      FROM public.current_batch_custody cbc
      INNER JOIN public.org_user ou ON ou.organisation_id = cbc.organisation_id
      WHERE cbc.batch_id = batches.id
        AND ou.user_id = auth.uid()
    )
    OR
    -- User's organisation has an active testing assignment for the batch
    EXISTS (
      SELECT 1
      FROM public.batch_testing_assignment bta
      INNER JOIN public.org_user ou ON ou.organisation_id = bta.assigned_to_org_id
      WHERE bta.batch_id = batches.id
        AND bta.returned_at IS NULL
        AND ou.user_id = auth.uid()
    )
  );

-- Note: active_batches is a view and will automatically inherit the RLS policy
-- from the batches table above. Views don't have their own RLS policies.

-- Also update collection access for testing orgs to see collection details
-- of batches they're testing
DROP POLICY IF EXISTS "collection_select_policy" ON "public"."collection";

CREATE POLICY "collection_select_policy" ON "public"."collection"
  FOR SELECT
  USING (
    -- User's organisation owns the collection
    EXISTS (
      SELECT 1
      FROM public.org_user ou
      WHERE ou.organisation_id = collection.organisation_id
        AND ou.user_id = auth.uid()
    )
    OR
    -- User's organisation has an active testing assignment for a batch in this collection
    EXISTS (
      SELECT 1
      FROM public.batch_testing_assignment bta
      INNER JOIN public.batches b ON b.id = bta.batch_id
      INNER JOIN public.org_user ou ON ou.organisation_id = bta.assigned_to_org_id
      WHERE b.collection_id = collection.id
        AND bta.returned_at IS NULL
        AND ou.user_id = auth.uid()
    )
  );
