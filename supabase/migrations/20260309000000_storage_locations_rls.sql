-- Enable RLS on storage_locations
ALTER TABLE storage_locations ENABLE ROW LEVEL SECURITY;

-- Allow org members to read storage locations in their organisation
CREATE POLICY "storage_locations_select_policy" ON storage_locations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.org_user
      WHERE org_user.user_id = auth.uid()
        AND org_user.organisation_id = storage_locations.organisation_id
    )
  );

-- Allow org admins to insert storage locations
CREATE POLICY "storage_locations_insert_policy" ON storage_locations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.org_user
      WHERE org_user.user_id = auth.uid()
        AND org_user.organisation_id = storage_locations.organisation_id
        AND org_user.role = 'Admin'
    )
  );
