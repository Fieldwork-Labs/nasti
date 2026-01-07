-- Create storage bucket for species profile photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'species-profile-photos',
  'species-profile-photos',
  false,
  52428800, -- 50MB
  ARRAY['image/jpeg', 'image/png', 'image/jpg', 'image/webp']
);

-- Create storage policy for species profile photos
CREATE POLICY "allow_org_access_species_photos_bucket"
ON storage.objects
FOR ALL
TO authenticated
USING ((bucket_id = 'species-profile-photos'::text) AND ((storage.foldername(name))[1] = (( SELECT get_user_organisation_id() AS get_user_organisation_id))::text));
