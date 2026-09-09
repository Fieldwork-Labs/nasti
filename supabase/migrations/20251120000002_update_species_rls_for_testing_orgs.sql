-- Update RLS policy on species to allow testing organisations to view species
-- of batches they're testing

DROP POLICY IF EXISTS "species_select_policy" ON "public"."species";

CREATE POLICY "species_select_policy" ON "public"."species"
  FOR SELECT
  USING (
    -- User's organisation has collections with this species
    EXISTS (
      SELECT 1
      FROM public.collection c
      INNER JOIN public.org_user ou ON ou.organisation_id = c.organisation_id
      WHERE c.species_id = species.id
        AND ou.user_id = auth.uid()
    )
    OR
    -- User's organisation has an active testing assignment for a batch with this species
    EXISTS (
      SELECT 1
      FROM public.batch_testing_assignment bta
      INNER JOIN public.batches b ON b.id = bta.batch_id
      INNER JOIN public.collection c ON c.id = b.collection_id
      INNER JOIN public.org_user ou ON ou.organisation_id = bta.assigned_to_org_id
      WHERE c.species_id = species.id
        AND bta.returned_at IS NULL
        AND ou.user_id = auth.uid()
    )
  );
