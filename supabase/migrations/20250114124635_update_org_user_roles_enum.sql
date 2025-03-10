-- 1. Rename the old type
alter type "public"."org_user_types" rename to "org_user_types__old_version_to_be_dropped";

-- 2. Create new type
create type "public"."org_user_types" as enum ('Member', 'Admin');

-- 3. Update the table
alter table "public"."org_user" alter column role type "public"."org_user_types" using role::text::"public"."org_user_types";

-- 4. Update the function
CREATE OR REPLACE FUNCTION public.get_organisation_users(current_user_id uuid)
 RETURNS TABLE(id uuid, email text, name text, organisation_id uuid, joined_at timestamp with time zone, role org_user_types)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        u.id, 
        u.email, 
        u.raw_user_meta_data->>'name' AS name,
        org_user.organisation_id,
        org_user.joined_at,
        org_user.role
    FROM auth.users u
    JOIN public.org_user ON u.id = public.org_user.user_id
    WHERE public.org_user.organisation_id IN (
        SELECT organisation_id 
        FROM public.org_user 
        WHERE user_id = current_user_id
    );
END;
$function$;

-- 5. Drop the old type with CASCADE
drop type "public"."org_user_types__old_version_to_be_dropped" CASCADE;