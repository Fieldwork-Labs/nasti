-- A Testing organisation can list the tests it has performed
--
-- tests_select and tests_update already let an organisation read and edit the
-- tests it performed, so the rows themselves are reachable. What is not is the
-- context a list needs: a tested bag is usually handed back to its owner, and
-- can_read_batch stops a laboratory reading a batch it holds no bag of. By then
-- an embedded `batch:batches(...)` join comes back empty, leaving a test with
-- no batch code, species or owner to identify it by.
--
-- This returns each test the caller's organisation performed together with that
-- context. It exposes nothing the laboratory did not already see while it held
-- the seed, and only for tests it performed itself.

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.fn_testing_test_history()
 RETURNS TABLE(
   test_id uuid,
   batch_id uuid,
   sub_batch_id uuid,
   result jsonb,
   statistics jsonb,
   tested_at timestamp with time zone,
   tested_by uuid,
   performed_by_organisation_id uuid,
   batch_code text,
   species_name text,
   collection_code text,
   owner_org_name text
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT
    test.id,
    test.batch_id,
    test.sub_batch_id,
    test.result,
    test.statistics,
    test.tested_at,
    test.tested_by,
    test.performed_by_organisation_id,
    batch.code,
    COALESCE(collection_species.name, batch_species.name),
    collection.code,
    owner_org.name
  FROM public.tests test
  INNER JOIN public.batches batch
    ON batch.id = test.batch_id
  LEFT JOIN public.collection collection
    ON collection.id = batch.collection_id
  LEFT JOIN public.species collection_species
    ON collection_species.id = collection.species_id
  LEFT JOIN public.species batch_species
    ON batch_species.id = batch.species_id
  LEFT JOIN public.organisation owner_org
    ON owner_org.id = batch.organisation_id
  WHERE test.type = 'quality'
    AND test.performed_by_organisation_id = public.get_user_organisation_id()
  ORDER BY test.tested_at DESC NULLS LAST, test.id
$function$
;

REVOKE ALL ON FUNCTION public.fn_testing_test_history() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_testing_test_history() TO authenticated;
