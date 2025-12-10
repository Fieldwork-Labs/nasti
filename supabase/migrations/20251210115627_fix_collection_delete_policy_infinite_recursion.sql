-- Drop the existing DELETE policy that causes infinite recursion
DROP POLICY IF EXISTS "Allow authenticated users to delete their own collections or admin to delete any that belong to the organisation" ON public.collection;

-- Drop the existing UPDATE policy that has a security issue (allows any admin to update any collection)
DROP POLICY IF EXISTS "Allow authenticated users to update their own collections or admin to update any" ON public.collection;

-- Create the corrected DELETE policy that references the current row directly
-- instead of joining back to the collection table
CREATE POLICY "Allow authenticated users to delete their own collections or admin to delete any that belong to the organisation"
ON public.collection
FOR DELETE
TO authenticated
USING (
    (created_by = auth.uid()) OR
    (EXISTS (
        SELECT 1
        FROM public.org_user
        WHERE org_user.user_id = auth.uid()
        AND org_user.role = 'Admin'
        AND org_user.organisation_id = collection.organisation_id
    ))
);

-- Create the corrected UPDATE policy that verifies admin belongs to the same organisation
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
        AND org_user.organisation_id = collection.organisation_id
    ))
)
WITH CHECK (
    organisation_id = (SELECT org_user.organisation_id
                       FROM public.org_user
                       WHERE org_user.user_id = auth.uid())
);
