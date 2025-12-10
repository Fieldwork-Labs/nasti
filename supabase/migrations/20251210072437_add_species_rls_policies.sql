-- Enable RLS on species table
ALTER TABLE public.species ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to select species for their organisation
CREATE POLICY "Allow authenticated users to select species for their organisation"
ON public.species
FOR SELECT
TO authenticated
USING (organisation_id = (SELECT org_user.organisation_id
                           FROM public.org_user
                           WHERE org_user.user_id = auth.uid()));

-- Allow authenticated users to insert species for their organisation
CREATE POLICY "Allow authenticated users to insert species for their organisation"
ON public.species
FOR INSERT
TO authenticated
WITH CHECK (organisation_id = (SELECT org_user.organisation_id
                                 FROM public.org_user
                                 WHERE org_user.user_id = auth.uid()));

-- Allow authenticated users to update species for their organisation
CREATE POLICY "Allow authenticated users to update species for their organisation"
ON public.species
FOR UPDATE
TO authenticated
USING (organisation_id = (SELECT org_user.organisation_id
                           FROM public.org_user
                           WHERE org_user.user_id = auth.uid()))
WITH CHECK (organisation_id = (SELECT org_user.organisation_id
                                FROM public.org_user
                                WHERE org_user.user_id = auth.uid()));

-- Allow authenticated users to delete species for their organisation
CREATE POLICY "Allow authenticated users to delete species for their organisation"
ON public.species
FOR DELETE
TO authenticated
USING (organisation_id = (SELECT org_user.organisation_id
                           FROM public.org_user
                           WHERE org_user.user_id = auth.uid()));
