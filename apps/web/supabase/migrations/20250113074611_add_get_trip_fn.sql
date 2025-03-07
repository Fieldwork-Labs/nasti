CREATE OR REPLACE FUNCTION public.get_trip(p_trip_id uuid)
 RETURNS TABLE(id uuid, name text, location_name text, location_coordinate text, organisation_id uuid, metadata jsonb, start_date date, end_date date, created_at timestamp without time zone, created_by uuid, members uuid[], species uuid[])
 LANGUAGE sql
 STABLE
AS $function$
  SELECT 
    t.id,
    t.name,
    t.location_name,
    t.location_coordinate::text,
    t.organisation_id,
    t.metadata,
    t.start_date,
    t.end_date,
    t.created_at,
    t.created_by,
    ARRAY_AGG(DISTINCT tm.id) as members,
    ARRAY_AGG(DISTINCT ts.id) as species
  FROM trip t
  LEFT JOIN trip_member tm ON t.id = tm.trip_id
  LEFT JOIN trip_species ts ON t.id = ts.trip_id
  WHERE t.id = p_trip_id 
    AND t.organisation_id = get_user_organisation_id()
  GROUP BY t.id, t.name, t.location_name, t.location_coordinate, 
           t.organisation_id, t.metadata, t.start_date, t.end_date, 
           t.created_at, t.created_by;
$function$
;