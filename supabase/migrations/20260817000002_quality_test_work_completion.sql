-- ============================================================================
-- QUALITY TEST WORK COMPLETION
-- ============================================================================
-- Recording a result does not itself complete requested testing work. When a
-- test consumes the final seed represented by an assignment, however, there
-- is no work left to perform and every still-open represented assignment is
-- closed as completed in the same transaction.

ALTER FUNCTION public.fn_create_quality_test(UUID, UUID, JSONB, UUID)
  RENAME TO fn_create_quality_test_without_work_completion;

REVOKE ALL PRIVILEGES ON FUNCTION
  public.fn_create_quality_test_without_work_completion(
    UUID,
    UUID,
    JSONB,
    UUID
  )
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.fn_create_quality_test(
  p_batch_id UUID,
  p_sub_batch_id UUID,
  p_result JSONB,
  p_performed_by_organisation_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_test_id UUID;
  v_user_id UUID := (SELECT auth.uid());
  v_current_weight NUMERIC;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  v_test_id := public.fn_create_quality_test_without_work_completion(
    p_batch_id,
    p_sub_batch_id,
    p_result,
    p_performed_by_organisation_id
  );

  SELECT weight.current_weight
    INTO v_current_weight
  FROM public.sub_batch_current_weight weight
  WHERE weight.id = p_sub_batch_id;

  IF v_current_weight = 0 THEN
    -- The underlying mutation already locks the directly assigned bag. Lock
    -- every represented assignment in UUID order as well so derived or merged
    -- lineage cannot introduce a conflicting lock order later.
    PERFORM 1
    FROM public.batch_testing_assignment assignment
    WHERE assignment.id IN (
      SELECT resolved.assignment_id
      FROM public.fn_resolve_testing_assignments_for_sub_batch(
        p_sub_batch_id
      ) resolved
    )
    ORDER BY assignment.id
    FOR UPDATE;

    INSERT INTO public.batch_testing_assignment_status_audit (
      assignment_id,
      old_work_status,
      new_work_status,
      note,
      actor_id,
      recorded_at
    )
    SELECT
      assignment.id,
      assignment.work_status,
      'completed',
      NULL,
      v_user_id,
      v_now
    FROM public.batch_testing_assignment assignment
    WHERE assignment.id IN (
      SELECT resolved.assignment_id
      FROM public.fn_resolve_testing_assignments_for_sub_batch(
        p_sub_batch_id
      ) resolved
    )
      AND assignment.work_closed_at IS NULL
    ORDER BY assignment.id;

    UPDATE public.batch_testing_assignment assignment
    SET work_closed_at = v_now,
        work_status = 'completed',
        work_status_note = NULL,
        work_closed_by = v_user_id
    WHERE assignment.id IN (
      SELECT resolved.assignment_id
      FROM public.fn_resolve_testing_assignments_for_sub_batch(
        p_sub_batch_id
      ) resolved
    )
      AND assignment.work_closed_at IS NULL;
  END IF;

  RETURN v_test_id;
END;
$$;

COMMENT ON FUNCTION
  public.fn_create_quality_test(UUID, UUID, JSONB, UUID) IS
  'Records one quality test without closing work on the first result; consuming all represented seed atomically closes still-open assignment work as completed and appends audit history.';

REVOKE ALL PRIVILEGES ON FUNCTION
  public.fn_create_quality_test(UUID, UUID, JSONB, UUID)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.fn_create_quality_test(UUID, UUID, JSONB, UUID)
  TO authenticated;
