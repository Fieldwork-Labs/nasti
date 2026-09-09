-- ============================================================================
-- TESTING ASSIGNMENT WORK STATE
-- ============================================================================
-- Work status is an accountable declaration by the testing provider. It is
-- deliberately separate from physical custody: closing or correcting work
-- does not move a bag and does not decide whether seed remains returnable.

ALTER TABLE public.batch_testing_assignment
  ADD COLUMN work_closed_at TIMESTAMPTZ,
  ADD COLUMN work_status TEXT,
  ADD COLUMN work_status_note TEXT,
  ADD COLUMN work_closed_by UUID
    REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE public.batch_testing_assignment
  ADD CONSTRAINT batch_testing_assignment_work_status_valid
    CHECK (
      work_status IS NULL
      OR work_status IN (
        'completed',
        'partially_completed',
        'not_completed'
      )
    ),
  ADD CONSTRAINT batch_testing_assignment_work_closure_complete
    CHECK (
      (
        work_closed_at IS NULL
        AND work_status IS NULL
        AND work_status_note IS NULL
        AND work_closed_by IS NULL
      )
      OR (
        work_closed_at IS NOT NULL
        AND work_status IS NOT NULL
        AND work_closed_by IS NOT NULL
      )
    ),
  ADD CONSTRAINT batch_testing_assignment_incomplete_work_has_note
    CHECK (
      work_status NOT IN ('partially_completed', 'not_completed')
      OR nullif(btrim(work_status_note), '') IS NOT NULL
    );

CREATE INDEX idx_batch_testing_assignment_work_open
  ON public.batch_testing_assignment (assigned_to_org_id, assigned_at)
  WHERE work_closed_at IS NULL;

COMMENT ON COLUMN public.batch_testing_assignment.work_closed_at IS
  'When the testing provider first closed the requested work. Custody may continue afterward.';

COMMENT ON COLUMN public.batch_testing_assignment.work_status IS
  'Current declared work outcome: completed, partially_completed, or not_completed. NULL while work is open.';

COMMENT ON COLUMN public.batch_testing_assignment.work_status_note IS
  'Explanation for the current work outcome; required for partially_completed and not_completed.';

COMMENT ON COLUMN public.batch_testing_assignment.work_closed_by IS
  'Testing-provider Admin who first closed the work. Later corrections are recorded separately in audit history.';

CREATE TABLE public.batch_testing_assignment_status_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL
    REFERENCES public.batch_testing_assignment(id) ON DELETE RESTRICT,
  old_work_status TEXT,
  new_work_status TEXT NOT NULL,
  note TEXT,
  actor_id UUID NOT NULL
    REFERENCES auth.users(id) ON DELETE RESTRICT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT batch_testing_assignment_status_audit_old_valid
    CHECK (
      old_work_status IS NULL
      OR old_work_status IN (
        'completed',
        'partially_completed',
        'not_completed'
      )
    ),
  CONSTRAINT batch_testing_assignment_status_audit_new_valid
    CHECK (
      new_work_status IN (
        'completed',
        'partially_completed',
        'not_completed'
      )
    ),
  CONSTRAINT batch_testing_assignment_status_audit_incomplete_has_note
    CHECK (
      new_work_status NOT IN ('partially_completed', 'not_completed')
      OR nullif(btrim(note), '') IS NOT NULL
    )
);

CREATE INDEX batch_testing_assignment_status_audit_assignment_idx
  ON public.batch_testing_assignment_status_audit (
    assignment_id,
    recorded_at,
    id
  );

COMMENT ON TABLE public.batch_testing_assignment_status_audit IS
  'Append-only history of every explicit testing-work closure and later status correction.';

CREATE FUNCTION public.reject_testing_assignment_status_audit_rewrite()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Testing assignment status audit is append-only'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER batch_testing_assignment_status_audit_reject_rewrite
BEFORE UPDATE OR DELETE
ON public.batch_testing_assignment_status_audit
FOR EACH ROW
EXECUTE FUNCTION public.reject_testing_assignment_status_audit_rewrite();

ALTER TABLE public.batch_testing_assignment_status_audit
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY batch_testing_assignment_status_audit_select_participant
ON public.batch_testing_assignment_status_audit
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.batch_testing_assignment assignment
    WHERE assignment.id =
      batch_testing_assignment_status_audit.assignment_id
      AND public.get_user_organisation_id() IN (
        assignment.assigned_by_org_id,
        assignment.assigned_to_org_id
      )
  )
);

GRANT SELECT
  ON public.batch_testing_assignment_status_audit
  TO authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.batch_testing_assignment_status_audit
  FROM authenticated;

CREATE FUNCTION public.fn_set_testing_assignment_work_status(
  p_assignment_id UUID,
  p_work_status TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS public.batch_testing_assignment
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_caller_org_id UUID;
  v_caller_role public.org_user_types;
  v_assignment public.batch_testing_assignment;
  v_old_work_status TEXT;
  v_note TEXT := nullif(btrim(p_note), '');
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '28000';
  END IF;

  SELECT member.organisation_id, member.role
    INTO v_caller_org_id, v_caller_role
  FROM public.org_user member
  WHERE member.user_id = v_user_id
    AND member.is_active = true
  ORDER BY member.joined_at, member.organisation_id
  LIMIT 1;

  IF v_caller_org_id IS NULL THEN
    RAISE EXCEPTION 'Active organisation membership required'
      USING ERRCODE = '42501';
  END IF;

  IF v_caller_role IS DISTINCT FROM 'Admin' THEN
    RAISE EXCEPTION 'Testing Admin role required to close or correct work'
      USING ERRCODE = '42501';
  END IF;

  SELECT assignment.*
    INTO v_assignment
  FROM public.batch_testing_assignment assignment
  WHERE assignment.id = p_assignment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Testing assignment not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_assignment.assigned_to_org_id IS DISTINCT FROM v_caller_org_id THEN
    RAISE EXCEPTION 'Only the assigned testing provider may change work status'
      USING ERRCODE = '42501';
  END IF;

  IF p_work_status IS NULL OR p_work_status NOT IN (
    'completed',
    'partially_completed',
    'not_completed'
  ) THEN
    RAISE EXCEPTION 'Invalid testing work status'
      USING ERRCODE = '22023';
  END IF;

  IF p_work_status IN ('partially_completed', 'not_completed')
    AND v_note IS NULL THEN
    RAISE EXCEPTION 'A note is required for partial or not-completed work'
      USING ERRCODE = '22023';
  END IF;

  IF v_assignment.work_status IS NOT DISTINCT FROM p_work_status
    AND v_assignment.work_status_note IS NOT DISTINCT FROM v_note THEN
    RAISE EXCEPTION 'Testing work already has that status and note'
      USING ERRCODE = '22023';
  END IF;

  v_old_work_status := v_assignment.work_status;

  UPDATE public.batch_testing_assignment assignment
  SET work_closed_at = COALESCE(assignment.work_closed_at, v_now),
      work_closed_by = COALESCE(assignment.work_closed_by, v_user_id),
      work_status = p_work_status,
      work_status_note = v_note
  WHERE assignment.id = p_assignment_id
  RETURNING assignment.* INTO v_assignment;

  INSERT INTO public.batch_testing_assignment_status_audit (
    assignment_id,
    old_work_status,
    new_work_status,
    note,
    actor_id,
    recorded_at
  ) VALUES (
    p_assignment_id,
    v_old_work_status,
    p_work_status,
    v_note,
    v_user_id,
    v_now
  );

  RETURN v_assignment;
END;
$$;

COMMENT ON FUNCTION
  public.fn_set_testing_assignment_work_status(UUID, TEXT, TEXT) IS
  'Lets the assigned testing provider Admin explicitly close or correct work status while preserving the first closure fact and appending every declaration to audit history.';

REVOKE ALL PRIVILEGES ON FUNCTION
  public.fn_set_testing_assignment_work_status(UUID, TEXT, TEXT)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.fn_set_testing_assignment_work_status(UUID, TEXT, TEXT)
  TO authenticated;
