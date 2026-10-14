-- ---------------------------------------------------------------------------
-- Deleting a quality test
--
-- A recorded test's type and replicate weights are fixed (see
-- fn_guard_quality_test_consumed_weight), so a test entered with the wrong
-- type or weights has to be deleted and recorded again. A destructive test
-- cannot simply be removed: its test_consumption adjustment references it,
-- and re-recording it would deduct the seed a second time.
--
-- fn_delete_quality_test marks the test deleted and, for each consumption
-- adjustment it wrote, adds a correction that gives the grams back to the bag.
-- The ledger keeps both rows. A deleted test is hidden from every reader:
-- tests_hide_deleted covers direct and security_invoker reads, and the two
-- SECURITY DEFINER readers filter it explicitly.
--
-- The seed goes back to the bag it came from, so deletion is refused when
-- that bag no longer stands for it:
-- - it was merged or cleaned into other bags afterwards;
-- - the caller's organisation no longer holds it;
-- - the test used up a bag at a laboratory, which closed its assignment.
--
-- Those checks are made against the test's bag, so a test's batch and bag are
-- fixed once recorded, and deletion refuses a test whose consumption was taken
-- from any other bag. Nothing in the app moves a test between bags.
-- ---------------------------------------------------------------------------

ALTER TABLE public.tests
  ADD COLUMN deleted_at timestamp with time zone,
  ADD COLUMN deleted_by uuid REFERENCES auth.users(id);

-- Deletion goes through fn_delete_quality_test only: hard deletes would drop
-- the test without restoring its seed, and setting deleted_at directly would
-- hide it without a correction.
REVOKE DELETE ON public.tests FROM authenticated;
DROP POLICY IF EXISTS "tests_delete" ON public.tests;
DROP POLICY IF EXISTS "tests_permission_delete" ON public.tests;

REVOKE UPDATE ON public.tests FROM authenticated;
GRANT UPDATE (
  id,
  type,
  result,
  tested_at,
  tested_by,
  statistics,
  performed_by_organisation_id
) ON public.tests TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_guard_test_bag_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.batch_id IS DISTINCT FROM OLD.batch_id
     OR NEW.sub_batch_id IS DISTINCT FROM OLD.sub_batch_id THEN
    RAISE EXCEPTION 'A test''s batch and bag cannot be changed once recorded'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE TRIGGER tests_bag_immutable
  BEFORE UPDATE OF batch_id, sub_batch_id ON public.tests
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_guard_test_bag_immutable();

REVOKE ALL ON FUNCTION public.fn_guard_test_bag_immutable() FROM PUBLIC, anon;

CREATE POLICY "tests_hide_deleted"
  ON public.tests
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);

CREATE OR REPLACE FUNCTION public.fn_delete_quality_test(p_test_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_caller_org_id uuid := public.get_user_organisation_id();
  v_test public.tests;
  v_held_by_org_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_test
  FROM public.tests test
  WHERE test.id = p_test_id
    AND test.type = 'quality'
    AND test.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quality test not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_test.performed_by_organisation_id IS DISTINCT FROM v_caller_org_id THEN
    RAISE EXCEPTION 'Only the organisation that recorded a test can delete it'
      USING ERRCODE = '42501';
  END IF;

  -- Bag first, then the test: the order test creation takes.
  SELECT bag.held_by_org_id
    INTO v_held_by_org_id
  FROM public.sub_batches bag
  WHERE bag.id = v_test.sub_batch_id
  FOR UPDATE;

  PERFORM 1
  FROM public.tests test
  WHERE test.id = p_test_id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.tests test
    WHERE test.id = p_test_id
      AND test.deleted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Quality test not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- The checks below are against the test's bag, so the seed must have come
  -- from that bag.
  IF EXISTS (
    SELECT 1
    FROM public.batch_weight_adjustments consumption
    WHERE consumption.test_id = p_test_id
      AND consumption.kind = 'test_consumption'
      AND consumption.sub_batch_id IS DISTINCT FROM v_test.sub_batch_id
  ) THEN
    RAISE EXCEPTION 'This test''s seed was taken from a different bag, so it cannot be restored'
      USING ERRCODE = '55000';
  END IF;

  IF v_held_by_org_id IS DISTINCT FROM v_caller_org_id THEN
    RAISE EXCEPTION 'This test''s bag is no longer held by your organisation, so its seed cannot be restored'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.sub_batch_lineage lineage
    WHERE lineage.source_sub_batch_id = v_test.sub_batch_id
      AND lineage.operation_kind IN ('merge', 'cleaning')
  ) THEN
    RAISE EXCEPTION 'This test''s bag has since been merged or cleaned, so its seed cannot be restored'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.batch_testing_assignment assignment
    WHERE assignment.id IN (
      SELECT resolved.assignment_id
      FROM public.fn_resolve_testing_assignments_for_sub_batch(
        v_test.sub_batch_id
      ) resolved
    )
      AND assignment.outcome = 'consumed'
  ) THEN
    RAISE EXCEPTION 'This bag was used up in testing and its assignment closed, so the test cannot be deleted'
      USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.batch_weight_adjustments (
    sub_batch_id,
    weight_grams,
    reason,
    created_by,
    kind,
    corrects_adjustment_id
  )
  SELECT
    consumption.sub_batch_id,
    -consumption.weight_grams,
    'Quality test deleted; seed restored (test_id: ' || p_test_id || ')',
    v_user_id,
    'correction',
    consumption.id
  FROM public.batch_weight_adjustments consumption
  WHERE consumption.test_id = p_test_id
    AND consumption.kind = 'test_consumption'
    AND NOT EXISTS (
      SELECT 1
      FROM public.batch_weight_adjustments correction
      WHERE correction.corrects_adjustment_id = consumption.id
    );

  UPDATE public.tests test
  SET deleted_at = now(),
      deleted_by = v_user_id
  WHERE test.id = p_test_id;
END;
$function$
;

REVOKE ALL ON FUNCTION public.fn_delete_quality_test(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_delete_quality_test(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER readers skip deleted tests
-- ---------------------------------------------------------------------------

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
    AND test.deleted_at IS NULL
    AND test.performed_by_organisation_id = public.get_user_organisation_id()
  ORDER BY test.tested_at DESC NULLS LAST, test.id
$function$
;

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
    AND test.deleted_at IS NULL
  ORDER BY 1, 2
$function$
;
