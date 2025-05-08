CREATE POLICY "Allow authenticated users to select their collection photos" 
ON public.collection_photo 
FOR SELECT 
TO authenticated 
USING (EXISTS (
    SELECT 1 
    FROM public.collection 
    JOIN public.trip ON collection.trip_id = trip.id 
    WHERE collection.id = collection_photo.collection_id 
    AND trip.organisation_id = (SELECT org_user.organisation_id 
                                 FROM public.org_user 
                                 WHERE org_user.user_id = auth.uid())
));

CREATE POLICY "Allow authenticated users to insert collection photos" 
ON public.collection_photo 
FOR INSERT 
TO authenticated 
WITH CHECK (EXISTS (
    SELECT 1 
    FROM public.collection 
    JOIN public.trip ON collection.trip_id = trip.id 
    WHERE collection.id = collection_photo.collection_id 
    AND trip.organisation_id = (SELECT org_user.organisation_id 
                                 FROM public.org_user 
                                 WHERE org_user.user_id = auth.uid())
));
CREATE POLICY "Allow authenticated users to update their own collection photos or admin to update any that belong to the organisation" 
ON public.collection_photo 
FOR UPDATE 
TO authenticated 
USING (
    (EXISTS (
        SELECT 1 
        FROM public.collection 
        WHERE collection.id = collection_photo.collection_id 
        AND collection.created_by = auth.uid()
    )) OR 
    (EXISTS (
        SELECT 1 
        FROM public.org_user 
        JOIN public.collection ON collection.id = collection_photo.collection_id
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
        WHERE collection.id = collection_photo.collection_id 
        AND trip.organisation_id = (SELECT org_user.organisation_id 
                                     FROM public.org_user 
                                     WHERE org_user.user_id = auth.uid())
    )
);

CREATE POLICY "Allow authenticated users to delete their own collection photos or admin to delete any that belong to the organisation" 
ON public.collection_photo 
FOR DELETE 
TO authenticated 
USING (
    (EXISTS (
        SELECT 1 
        FROM public.collection 
        WHERE collection.id = collection_photo.collection_id 
        AND collection.created_by = auth.uid()
    )) OR 
    (EXISTS (
        SELECT 1 
        FROM public.org_user 
        JOIN public.collection ON collection.id = collection_photo.collection_id
        JOIN public.trip ON collection.trip_id = trip.id 
        WHERE org_user.user_id = auth.uid() 
        AND org_user.role = 'Admin'
        AND trip.organisation_id = (SELECT org_user.organisation_id 
                                     FROM public.org_user 
                                     WHERE org_user.user_id = auth.uid())
    ))
);

-- Collections
CREATE POLICY "Allow authenticated users to select collections for their organisation" 
ON public.collection 
FOR SELECT 
TO authenticated 
USING (organisation_id = (SELECT org_user.organisation_id 
                           FROM public.org_user 
                           WHERE org_user.user_id = auth.uid()));

CREATE POLICY "Allow authenticated users to insert collections for their organisation" 
ON public.collection 
FOR INSERT 
TO authenticated 
WITH CHECK (organisation_id = (SELECT org_user.organisation_id 
                                 FROM public.org_user 
                                 WHERE org_user.user_id = auth.uid()));

CREATE POLICY "Allow authenticated users to update their own collections or admin to update any" 
ON public.collection 
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

CREATE POLICY "Allow authenticated users to delete their own collections or admin to delete any that belong to the organisation" 
ON public.collection 
FOR DELETE 
TO authenticated 
USING (
    (created_by = auth.uid()) OR 
    (EXISTS (
        SELECT 1 
        FROM public.org_user 
        JOIN public.collection ON collection.organisation_id = org_user.organisation_id
        WHERE org_user.user_id = auth.uid() 
        AND org_user.role = 'Admin'
    ))
);