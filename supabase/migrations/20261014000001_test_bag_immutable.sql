-- ---------------------------------------------------------------------------
-- A test's bag is fixed once recorded
--
-- fn_delete_quality_test checks and locks the test's sub_batch_id, but gives
-- the seed back to the bag named on the test's consumption adjustments. The
-- column grant in 20261013000001_delete_quality_test.sql still let a caller
-- repoint a test from a merged, cleaned or transferred bag to one it holds,
-- so the checks passed against that bag while the seed went back to the old
-- one. Nothing in the app moves a test between bags or batches, so both
-- columns are now fixed, and deletion refuses any test whose consumption was
-- taken from a bag other than its own.
-- ---------------------------------------------------------------------------

REVOKE UPDATE (batch_id, sub_batch_id) ON public.tests FROM authenticated;

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

DROP TRIGGER IF EXISTS tests_bag_immutable ON public.tests;

CREATE TRIGGER tests_bag_immutable
  BEFORE UPDATE OF batch_id, sub_batch_id ON public.tests
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_guard_test_bag_immutable();

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
  -- from that bag. Guards tests repointed before the bag was fixed.
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
