-- Create species_photo table
CREATE TABLE public.species_photo (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    species_id uuid NOT NULL REFERENCES public.species(id) ON DELETE CASCADE,
    url text NOT NULL,
    caption text,
    source_type text NOT NULL CHECK (source_type IN ('upload', 'collection_photo', 'ala')),
    source_reference text,
    display_order integer NOT NULL DEFAULT 0,
    uploaded_at timestamp with time zone DEFAULT now(),
    organisation_id uuid NOT NULL REFERENCES public.organisation(id) ON DELETE CASCADE
);

-- Create indexes for fast lookup
CREATE INDEX idx_species_photo_species_id ON public.species_photo(species_id);
CREATE INDEX idx_species_photo_organisation_id ON public.species_photo(organisation_id);
CREATE INDEX idx_species_photo_display_order ON public.species_photo(species_id, display_order);

-- Enable RLS
ALTER TABLE public.species_photo ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow authenticated users to select species photos for their organisation"
ON public.species_photo
FOR SELECT
TO authenticated
USING (organisation_id = (SELECT org_user.organisation_id
                           FROM public.org_user
                           WHERE org_user.user_id = auth.uid()));

CREATE POLICY "Allow authenticated users to insert species photos for their organisation"
ON public.species_photo
FOR INSERT
TO authenticated
WITH CHECK (organisation_id = (SELECT org_user.organisation_id
                                 FROM public.org_user
                                 WHERE org_user.user_id = auth.uid()));

CREATE POLICY "Allow authenticated users to update species photos for their organisation"
ON public.species_photo
FOR UPDATE
TO authenticated
USING (organisation_id = (SELECT org_user.organisation_id
                           FROM public.org_user
                           WHERE org_user.user_id = auth.uid()))
WITH CHECK (organisation_id = (SELECT org_user.organisation_id
                                FROM public.org_user
                                WHERE org_user.user_id = auth.uid()));

CREATE POLICY "Allow authenticated users to delete species photos for their organisation"
ON public.species_photo
FOR DELETE
TO authenticated
USING (organisation_id = (SELECT org_user.organisation_id
                           FROM public.org_user
                           WHERE org_user.user_id = auth.uid()));
