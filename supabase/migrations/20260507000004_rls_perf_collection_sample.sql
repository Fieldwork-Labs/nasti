-- Sample migration: rewrite RLS policies on `public.collection` to address
-- the advisor's perf warnings. Pattern this file establishes will be applied
-- to the remaining tables in the next migration.
--
-- Changes:
--   1. Drop `collection_rls` — legacy FOR ALL policy from the original schema.
--      Also references `company_id` which no longer exists, so it's dead.
--   2. Drop `Allow authenticated users to select collections for their
--      organisation` — superseded by `collection_select_policy`, which covers
--      the same path plus testing-org access.
--   3. Recreate the survivors using:
--        - `get_user_organisation_id()` (now JWT-backed, no org_user join)
--        - `auth_org_role()` (JWT-backed admin check, no org_user join)
--        - `(select auth.uid())` wrapping so it's evaluated once per query
--          instead of per row.

DROP POLICY IF EXISTS "collection_rls" ON public.collection;
DROP POLICY IF EXISTS "Allow authenticated users to select collections for their organisation" ON public.collection;

DROP POLICY IF EXISTS "collection_select_policy" ON public.collection;
CREATE POLICY "collection_select_policy" ON public.collection
  FOR SELECT
  TO authenticated
  USING (
    organisation_id = (SELECT public.get_user_organisation_id())
    OR EXISTS (
      SELECT 1
      
      FROM public.batch_testing_assignment bta
      INNER JOIN public.batches b ON b.id = bta.batch_id
      INNER JOIN public.org_user ou ON ou.organisation_id = bta.assigned_to_org_id
      WHERE b.collection_id = collection.id
        AND bta.returned_at IS NULL
        AND ou.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Allow authenticated users to insert collections for their organisation" ON public.collection;
CREATE POLICY "Allow authenticated users to insert collections for their organisation" ON public.collection
  FOR INSERT
  TO authenticated
  WITH CHECK (organisation_id = (SELECT public.get_user_organisation_id()));

DROP POLICY IF EXISTS "Allow authenticated users to update their own collections or admin to update any" ON public.collection;
CREATE POLICY "Allow authenticated users to update their own collections or admin to update any" ON public.collection
  FOR UPDATE
  TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    OR (SELECT public.auth_org_role()) = 'Admin'
  )
  WITH CHECK (organisation_id = (SELECT public.get_user_organisation_id()));

DROP POLICY IF EXISTS "Allow authenticated users to delete their own collections or admin to delete any that belong to the organisation" ON public.collection;
CREATE POLICY "Allow authenticated users to delete their own collections or admin to delete any that belong to the organisation" ON public.collection
  FOR DELETE
  TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    OR (
      (SELECT public.auth_org_role()) = 'Admin'
      AND organisation_id = (SELECT public.get_user_organisation_id())
    )
  );
