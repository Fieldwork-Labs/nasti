-- Migration: Update organisation RLS to allow viewing Testing organisations
-- All authenticated users should be able to see Testing organisations (public directory)
-- Users can still only see their own General organisation

-- Drop existing policy
DROP POLICY IF EXISTS "organisation_rls" ON "public"."organisation";

-- Create new SELECT policy that allows:
-- 1. Users to see their own organisation (General or Testing)
-- 2. All authenticated users to see Testing organisations (public directory)
CREATE POLICY "organisation_select_policy" ON "public"."organisation"
  FOR SELECT
  USING (
    -- User is a member of this organisation
    id = (
      SELECT org_user.organisation_id
      FROM public.org_user
      WHERE org_user.user_id = auth.uid()
    )
    OR
    -- Organisation is a Testing organisation (public directory)
    type = 'Testing'
  );

-- Create UPDATE policy (only Admins can update their own organisation)
CREATE POLICY "organisation_update_policy" ON "public"."organisation"
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.org_user
      WHERE org_user.user_id = auth.uid()
        AND org_user.organisation_id = organisation.id
        AND org_user.role = 'Admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.org_user
      WHERE org_user.user_id = auth.uid()
        AND org_user.organisation_id = organisation.id
        AND org_user.role = 'Admin'
    )
  );

-- Add comments
COMMENT ON POLICY "organisation_select_policy" ON "public"."organisation" IS 'Users can see their own organisation and all Testing organisations (public directory)';
COMMENT ON POLICY "organisation_update_policy" ON "public"."organisation" IS 'Only Admins can update their own organisation details';
