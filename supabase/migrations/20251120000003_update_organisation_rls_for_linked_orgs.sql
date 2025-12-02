-- Update organisation RLS policy to allow linked organisations to see each other

DROP POLICY IF EXISTS "organisation_select_policy" ON "public"."organisation";

CREATE POLICY "organisation_select_policy" ON "public"."organisation"
  FOR SELECT
  USING (
    -- Users can see their own organisation
    id = (
      SELECT org_user.organisation_id
      FROM public.org_user
      WHERE org_user.user_id = auth.uid()
    )
    OR
    -- Everyone can see Testing organisations (public directory)
    type = 'Testing'
    OR
    -- Testing orgs can see General orgs they have links with
    EXISTS (
      SELECT 1
      FROM public.organisation_link ol
      INNER JOIN public.org_user ou ON ou.organisation_id = ol.testing_org_id
      WHERE ol.general_org_id = organisation.id
        AND ou.user_id = auth.uid()
    )
  );
