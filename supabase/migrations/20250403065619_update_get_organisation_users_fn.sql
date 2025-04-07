drop function if exists "public"."get_organisation_users"(current_user_id uuid);

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_organisation_users()
 RETURNS TABLE(id uuid, email text, name text, organisation_id uuid, joined_at timestamp with time zone, role org_user_types, is_active boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
        o.role::org_user_types,
        o.is_active::BOOLEAN
    FROM auth.users u
    JOIN public.org_user o ON u.id = o.user_id
    JOIN user_organisations uo ON o.organisation_id = uo.org_id;
END;
$function$
;


