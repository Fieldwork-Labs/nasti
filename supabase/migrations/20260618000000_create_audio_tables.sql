-- collection_audio table (mirrors collection_photo, adds mime_type + duration_ms)
CREATE TABLE collection_audio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL REFERENCES collection(id) ON DELETE CASCADE,
  url text NOT NULL,
  mime_type text NOT NULL,
  caption text,
  duration_ms integer,
  uploaded_at timestamptz DEFAULT now()
);

-- scouting_notes_audio table (mirrors scouting_notes_photos, adds mime_type + duration_ms)
CREATE TABLE scouting_notes_audio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scouting_notes_id uuid NOT NULL REFERENCES scouting_notes(id) ON DELETE CASCADE,
  url text NOT NULL,
  mime_type text NOT NULL,
  caption text,
  duration_ms integer,
  uploaded_at timestamptz DEFAULT now()
);

-- ============================================================================
-- RLS: collection_audio (mirrors collection_photo policies)
-- ============================================================================
ALTER TABLE public.collection_audio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to select their collection audio"
ON public.collection_audio
FOR SELECT
TO authenticated
USING (EXISTS (
    SELECT 1
    FROM public.collection
    JOIN public.trip ON collection.trip_id = trip.id
    WHERE collection.id = collection_audio.collection_id
    AND trip.organisation_id = (SELECT org_user.organisation_id
                                 FROM public.org_user
                                 WHERE org_user.user_id = auth.uid())
));

CREATE POLICY "Allow authenticated users to insert collection audio"
ON public.collection_audio
FOR INSERT
TO authenticated
WITH CHECK (EXISTS (
    SELECT 1
    FROM public.collection
    JOIN public.trip ON collection.trip_id = trip.id
    WHERE collection.id = collection_audio.collection_id
    AND trip.organisation_id = (SELECT org_user.organisation_id
                                 FROM public.org_user
                                 WHERE org_user.user_id = auth.uid())
));

CREATE POLICY "Allow authenticated users to update their own collection audio or admin to update any that belong to the organisation"
ON public.collection_audio
FOR UPDATE
TO authenticated
USING (
    (EXISTS (
        SELECT 1
        FROM public.collection
        WHERE collection.id = collection_audio.collection_id
        AND collection.created_by = auth.uid()
    )) OR
    (EXISTS (
        SELECT 1
        FROM public.org_user
        JOIN public.collection ON collection.id = collection_audio.collection_id
        JOIN public.trip ON collection.trip_id = trip.id
        WHERE org_user.user_id = auth.uid()
        AND org_user.role = 'Admin'
        AND trip.organisation_id = (SELECT org_user.organisation_id
                                     FROM public.org_user
                                     WHERE org_user.user_id = auth.uid())
    ))
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.collection
        JOIN public.trip ON collection.trip_id = trip.id
        WHERE collection.id = collection_audio.collection_id
        AND trip.organisation_id = (SELECT org_user.organisation_id
                                     FROM public.org_user
                                     WHERE org_user.user_id = auth.uid())
    )
);

CREATE POLICY "Allow authenticated users to delete their own collection audio or admin to delete any that belong to the organisation"
ON public.collection_audio
FOR DELETE
TO authenticated
USING (
    (EXISTS (
        SELECT 1
        FROM public.collection
        WHERE collection.id = collection_audio.collection_id
        AND collection.created_by = auth.uid()
    )) OR
    (EXISTS (
        SELECT 1
        FROM public.org_user
        JOIN public.collection ON collection.id = collection_audio.collection_id
        JOIN public.trip ON collection.trip_id = trip.id
        WHERE org_user.user_id = auth.uid()
        AND org_user.role = 'Admin'
        AND trip.organisation_id = (SELECT org_user.organisation_id
                                     FROM public.org_user
                                     WHERE org_user.user_id = auth.uid())
    ))
);

-- ============================================================================
-- RLS: scouting_notes_audio (mirrors scouting_notes_photos policies)
-- ============================================================================
ALTER TABLE public.scouting_notes_audio ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated users to select their scouting_notes audio"
ON public.scouting_notes_audio
FOR SELECT
TO authenticated
USING (EXISTS (
    SELECT 1
    FROM public.scouting_notes
    JOIN public.trip ON scouting_notes.trip_id = trip.id
    WHERE scouting_notes.id = scouting_notes_audio.scouting_notes_id
    AND trip.organisation_id = (SELECT org_user.organisation_id
                                 FROM public.org_user
                                 WHERE org_user.user_id = auth.uid())
));

CREATE POLICY "Allow authenticated users to insert scouting_notes audio"
ON public.scouting_notes_audio
FOR INSERT
TO authenticated
WITH CHECK (EXISTS (
    SELECT 1
    FROM public.scouting_notes
    JOIN public.trip ON scouting_notes.trip_id = trip.id
    WHERE scouting_notes.id = scouting_notes_audio.scouting_notes_id
    AND trip.organisation_id = (SELECT org_user.organisation_id
                                 FROM public.org_user
                                 WHERE org_user.user_id = auth.uid())
));

CREATE POLICY "Allow authenticated users to update their own scouting_notes audio or admin to update any that belong to the organisation"
ON public.scouting_notes_audio
FOR UPDATE
TO authenticated
USING (
    (EXISTS (
        SELECT 1
        FROM public.scouting_notes
        WHERE scouting_notes.id = scouting_notes_audio.scouting_notes_id
        AND scouting_notes.created_by = auth.uid()
    )) OR
    (EXISTS (
        SELECT 1
        FROM public.org_user
        JOIN public.scouting_notes ON scouting_notes.id = scouting_notes_audio.scouting_notes_id
        JOIN public.trip ON scouting_notes.trip_id = trip.id
        WHERE org_user.user_id = auth.uid()
        AND org_user.role = 'Admin'
        AND trip.organisation_id = (SELECT org_user.organisation_id
                                     FROM public.org_user
                                     WHERE org_user.user_id = auth.uid())
    ))
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.scouting_notes
        JOIN public.trip ON scouting_notes.trip_id = trip.id
        WHERE scouting_notes.id = scouting_notes_audio.scouting_notes_id
        AND trip.organisation_id = (SELECT org_user.organisation_id
                                     FROM public.org_user
                                     WHERE org_user.user_id = auth.uid())
    )
);

CREATE POLICY "Allow authenticated users to delete their own scouting_notes audio or admin to delete any that belong to the organisation"
ON public.scouting_notes_audio
FOR DELETE
TO authenticated
USING (
    (EXISTS (
        SELECT 1
        FROM public.scouting_notes
        WHERE scouting_notes.id = scouting_notes_audio.scouting_notes_id
        AND scouting_notes.created_by = auth.uid()
    )) OR
    (EXISTS (
        SELECT 1
        FROM public.org_user
        JOIN public.scouting_notes ON scouting_notes.id = scouting_notes_audio.scouting_notes_id
        JOIN public.trip ON scouting_notes.trip_id = trip.id
        WHERE org_user.user_id = auth.uid()
        AND org_user.role = 'Admin'
        AND trip.organisation_id = (SELECT org_user.organisation_id
                                     FROM public.org_user
                                     WHERE org_user.user_id = auth.uid())
    ))
);

-- ============================================================================
-- Storage bucket for audio (shared by collection + scouting_notes audio,
-- path-separated by org, mirroring the collection-photos bucket)
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'collection-audio',
  'collection-audio',
  false,
  104857600, -- 100MB
  ARRAY['audio/m4a', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/webm', 'audio/ogg', 'audio/wav']
);

CREATE POLICY "allow_org_access_collection_audio_bucket"
ON storage.objects
FOR ALL
TO authenticated
USING ((bucket_id = 'collection-audio'::text) AND ((storage.foldername(name))[1] = (( SELECT get_user_organisation_id() AS get_user_organisation_id))::text));
