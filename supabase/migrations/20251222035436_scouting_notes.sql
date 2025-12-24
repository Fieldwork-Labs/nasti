create table public.scouting_notes (
  id uuid not null default gen_random_uuid (),
  species_id uuid null,
  species_uncertain boolean not null default false,
  field_name text null,
  specimen_collected boolean null default false,
  organisation_id uuid null,
  location geography null,
  created_by uuid null,
  created_at timestamp with time zone not null default now(),
  trip_id uuid null,
  description text null,
  constraint scouting_notes_pkey primary key (id),
  constraint scouting_notes_organisation_id_fkey foreign KEY (organisation_id) references organisation (id),
  constraint scouting_notes_created_by_fkey foreign KEY (created_by) references auth.users (id) on delete set null,
  constraint scouting_notes_species_id_fkey foreign KEY (species_id) references species (id),
  constraint scouting_notes_trip_id_fkey foreign KEY (trip_id) references trip (id)
) TABLESPACE pg_default;

create table public.scouting_notes_photos (
  id uuid not null default gen_random_uuid (),
  scouting_notes_id uuid not null,
  url text not null,
  caption text null,
  uploaded_at timestamp with time zone null default now(),
  constraint scouting_notes_photo_pkey primary key (id),
  constraint scouting_notes_photo_scouting_notes_id_fkey foreign KEY (scouting_notes_id) references scouting_notes (id) on delete CASCADE
) TABLESPACE pg_default;

CREATE POLICY "Allow authenticated users to select their scouting_notes photos" 
ON public.scouting_notes_photos 
FOR SELECT 
TO authenticated 
USING (EXISTS (
    SELECT 1 
    FROM public.scouting_notes 
    JOIN public.trip ON scouting_notes.trip_id = trip.id 
    WHERE scouting_notes.id = scouting_notes_photos.scouting_notes_id 
    AND trip.organisation_id = (SELECT org_user.organisation_id 
                                 FROM public.org_user 
                                 WHERE org_user.user_id = auth.uid())
));

CREATE POLICY "Allow authenticated users to insert scouting_notes photos" 
ON public.scouting_notes_photos 
FOR INSERT 
TO authenticated 
WITH CHECK (EXISTS (
    SELECT 1 
    FROM public.scouting_notes 
    JOIN public.trip ON scouting_notes.trip_id = trip.id 
    WHERE scouting_notes.id = scouting_notes_photos.scouting_notes_id 
    AND trip.organisation_id = (SELECT org_user.organisation_id 
                                 FROM public.org_user 
                                 WHERE org_user.user_id = auth.uid())
));
CREATE POLICY "Allow authenticated users to update their own scouting_notes photos or admin to update any that belong to the organisation" 
ON public.scouting_notes_photos 
FOR UPDATE 
TO authenticated 
USING (
    (EXISTS (
        SELECT 1 
        FROM public.scouting_notes 
        WHERE scouting_notes.id = scouting_notes_photos.scouting_notes_id 
        AND scouting_notes.created_by = auth.uid()
    )) OR 
    (EXISTS (
        SELECT 1 
        FROM public.org_user 
        JOIN public.scouting_notes ON scouting_notes.id = scouting_notes_photos.scouting_notes_id
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
        WHERE scouting_notes.id = scouting_notes_photos.scouting_notes_id 
        AND trip.organisation_id = (SELECT org_user.organisation_id 
                                     FROM public.org_user 
                                     WHERE org_user.user_id = auth.uid())
    )
);

CREATE POLICY "Allow authenticated users to delete their own scouting_notes photos or admin to delete any that belong to the organisation" 
ON public.scouting_notes_photos 
FOR DELETE 
TO authenticated 
USING (
    (EXISTS (
        SELECT 1 
        FROM public.scouting_notes 
        WHERE scouting_notes.id = scouting_notes_photos.scouting_notes_id 
        AND scouting_notes.created_by = auth.uid()
    )) OR 
    (EXISTS (
        SELECT 1 
        FROM public.org_user 
        JOIN public.scouting_notes ON scouting_notes.id = scouting_notes_photos.scouting_notes_id
        JOIN public.trip ON scouting_notes.trip_id = trip.id 
        WHERE org_user.user_id = auth.uid() 
        AND org_user.role = 'Admin'
        AND trip.organisation_id = (SELECT org_user.organisation_id 
                                     FROM public.org_user 
                                     WHERE org_user.user_id = auth.uid())
    ))
);

-- scouting_notess
CREATE POLICY "Allow authenticated users to select scouting_notess for their organisation" 
ON public.scouting_notes 
FOR SELECT 
TO authenticated 
USING (organisation_id = (SELECT org_user.organisation_id 
                           FROM public.org_user 
                           WHERE org_user.user_id = auth.uid()));

CREATE POLICY "Allow authenticated users to insert scouting_notess for their organisation" 
ON public.scouting_notes 
FOR INSERT 
TO authenticated 
WITH CHECK (organisation_id = (SELECT org_user.organisation_id 
                                 FROM public.org_user 
                                 WHERE org_user.user_id = auth.uid()));

CREATE POLICY "Allow authenticated users to update their own scouting_notess or admin to update any" 
ON public.scouting_notes 
FOR UPDATE 
TO authenticated 
USING (
    (created_by = auth.uid()) OR 
    (EXISTS (
        SELECT 1 
        FROM public.org_user 
        WHERE org_user.user_id = auth.uid() 
        AND org_user.role = 'Admin'
    ))
) 
WITH CHECK (
    organisation_id = (SELECT org_user.organisation_id 
                       FROM public.org_user 
                       WHERE org_user.user_id = auth.uid())
);

CREATE POLICY "Allow authenticated users to delete their own scouting_notess or admin to delete any that belong to the organisation" 
ON public.scouting_notes 
FOR DELETE 
TO authenticated 
USING (
    (created_by = auth.uid()) OR 
    (EXISTS (
        SELECT 1 
        FROM public.org_user 
        JOIN public.scouting_notes ON scouting_notes.organisation_id = org_user.organisation_id
        WHERE org_user.user_id = auth.uid() 
        AND org_user.role = 'Admin'
    ))
);


create policy "allow_org_access_scouting_notes_photos"
on storage.objects
for ALL
to authenticated
using ((bucket_id = 'scouting-notes-photos'::text) AND ((storage.foldername(name))[1] = (( SELECT get_user_organisation_id() AS get_user_organisation_id))::text));