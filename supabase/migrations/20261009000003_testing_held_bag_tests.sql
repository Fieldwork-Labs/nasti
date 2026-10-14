-- Which tests belong to each bag a Testing organisation holds
--
-- The Testing inventory is one row per held bag, and a row should show the
-- results for its seed. That is not only tests recorded against the bag's own
-- id: a bag the laboratory split off or merged was never tested itself, yet
-- the seed in it was. Pairing each held bag with the tests its lineage carries
-- follows the same ancestry as fn_testing_held_bags does for assignments.
--
-- Only tests the caller's organisation performed are returned. The rows
-- themselves, with batch context, come from fn_testing_test_history.

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.fn_testing_held_bag_tests()
 RETURNS TABLE(sub_batch_id uuid, test_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH RECURSIVE caller AS (
    SELECT public.get_user_organisation_id() AS org_id
  ),
  held AS (
    SELECT bag.id
    FROM public.sub_batches bag
    INNER JOIN public.sub_batch_current_weight weight
      ON weight.id = bag.id
    INNER JOIN caller
      ON caller.org_id = bag.held_by_org_id
    WHERE weight.current_weight > 0
  ),
  ancestors (held_id, sub_batch_id) AS (
    SELECT held.id, held.id
    FROM held
    UNION
    SELECT ancestors.held_id, lineage.source_sub_batch_id
    FROM public.sub_batch_lineage lineage
    INNER JOIN ancestors
      ON ancestors.sub_batch_id = lineage.derived_sub_batch_id
  )
  SELECT DISTINCT ancestors.held_id, test.id
  FROM ancestors
  INNER JOIN public.tests test
    ON test.sub_batch_id = ancestors.sub_batch_id
  INNER JOIN caller
    ON caller.org_id = test.performed_by_organisation_id
  WHERE test.type = 'quality'
  ORDER BY 1, 2
$function$
;

REVOKE ALL ON FUNCTION public.fn_testing_held_bag_tests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_testing_held_bag_tests() TO authenticated;
