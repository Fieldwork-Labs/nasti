CREATE OR REPLACE FUNCTION public.get_organisation_users()
 RETURNS TABLE(id uuid, email text, name text, organisation_id uuid, joined_at timestamp with time zone, role org_user_types)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    WITH user_organisations AS (
        SELECT DISTINCT o.organisation_id AS org_id
        FROM public.org_user o 
        WHERE o.user_id = auth.uid()
    )
    SELECT 
        u.id::UUID, 
        u.email::TEXT, 
        (u.raw_user_meta_data->>'name')::TEXT AS name,
        o.organisation_id::UUID,
        o.joined_at::timestamptz,
        o.role::org_user_types
    FROM auth.users u
    JOIN public.org_user o ON u.id = o.user_id
    JOIN user_organisations uo ON o.organisation_id = uo.org_id;
END;
$function$
;
