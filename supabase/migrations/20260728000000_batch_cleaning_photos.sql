-- ============================================================================
-- BATCH CLEANING PHOTOS: before/after documentation of a cleaning event
-- ============================================================================
-- Two sets of photos per cleaning record, distinguished by `stage`:
--   * 'before' — the material as it arrived, prior to cleaning
--   * 'after'  — the resulting material once cleaning is finished
--
-- Files live in the `batch-cleaning-photos` bucket under
-- <organisation_id>/cleaning/<cleaning_id>/<photo_id>.<ext>, matching the
-- org-prefixed layout used by the collection and species photo buckets.

CREATE TABLE public.batch_cleaning_photo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cleaning_id uuid NOT NULL
    REFERENCES public.batch_cleaning(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('before', 'after')),
  url text NOT NULL,
  caption text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by uuid REFERENCES auth.users(id),
  organisation_id uuid NOT NULL
    REFERENCES public.organisation(id) ON DELETE CASCADE
);

CREATE INDEX batch_cleaning_photo_cleaning_id_idx
  ON public.batch_cleaning_photo (cleaning_id, stage);

CREATE INDEX batch_cleaning_photo_organisation_id_idx
  ON public.batch_cleaning_photo (organisation_id);

-- ============================================================================
-- RLS: visible and writable by the organisation that recorded the cleaning
-- ============================================================================
ALTER TABLE public.batch_cleaning_photo ENABLE ROW LEVEL SECURITY;

CREATE POLICY batch_cleaning_photo_select ON public.batch_cleaning_photo
  FOR SELECT TO authenticated
  USING (organisation_id = (SELECT public.get_user_organisation_id()));

CREATE POLICY batch_cleaning_photo_insert ON public.batch_cleaning_photo
  FOR INSERT TO authenticated
  WITH CHECK (
    organisation_id = (SELECT public.get_user_organisation_id())
    AND EXISTS (
      SELECT 1 FROM public.batch_cleaning bc
      WHERE bc.id = cleaning_id
        AND bc.organisation_id = (SELECT public.get_user_organisation_id())
    )
  );

CREATE POLICY batch_cleaning_photo_update ON public.batch_cleaning_photo
  FOR UPDATE TO authenticated
  USING (organisation_id = (SELECT public.get_user_organisation_id()))
  WITH CHECK (organisation_id = (SELECT public.get_user_organisation_id()));

CREATE POLICY batch_cleaning_photo_delete ON public.batch_cleaning_photo
  FOR DELETE TO authenticated
  USING (organisation_id = (SELECT public.get_user_organisation_id()));

-- ============================================================================
-- Storage bucket, org-separated by path like the other photo buckets
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'batch-cleaning-photos',
  'batch-cleaning-photos',
  false,
  52428800, -- 50MB
  ARRAY['image/jpeg', 'image/png', 'image/jpg', 'image/webp']
);

CREATE POLICY "allow_org_access_batch_cleaning_photos_bucket"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'batch-cleaning-photos'::text
  AND (storage.foldername(name))[1] = (SELECT public.get_user_organisation_id())::text
)
WITH CHECK (
  bucket_id = 'batch-cleaning-photos'::text
  AND (storage.foldername(name))[1] = (SELECT public.get_user_organisation_id())::text
);
