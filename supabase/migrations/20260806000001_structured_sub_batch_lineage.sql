-- ============================================================================
-- STRUCTURED SUB-BATCH LINEAGE
-- ============================================================================
-- A lineage edge records a physical derivation. Assignment/work state stays on
-- the originally dispatched bag and is resolved through these immutable edges.

CREATE TYPE public.sub_batch_lineage_operation_kind AS ENUM (
  'split',
  'merge',
  'cleaning'
);

CREATE TABLE public.sub_batch_lineage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_sub_batch_id UUID NOT NULL
    REFERENCES public.sub_batches(id) ON DELETE RESTRICT,
  derived_sub_batch_id UUID NOT NULL
    REFERENCES public.sub_batches(id) ON DELETE RESTRICT,
  operation_kind public.sub_batch_lineage_operation_kind NOT NULL,
  operation_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID DEFAULT auth.uid()
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT sub_batch_lineage_distinct_bags
    CHECK (source_sub_batch_id <> derived_sub_batch_id),
  CONSTRAINT sub_batch_lineage_unique_edge
    UNIQUE (
      source_sub_batch_id,
      derived_sub_batch_id,
      operation_kind,
      operation_id
    )
);

CREATE INDEX sub_batch_lineage_source_idx
  ON public.sub_batch_lineage (source_sub_batch_id);

CREATE INDEX sub_batch_lineage_derived_idx
  ON public.sub_batch_lineage (derived_sub_batch_id);

CREATE INDEX sub_batch_lineage_operation_idx
  ON public.sub_batch_lineage (operation_kind, operation_id);

COMMENT ON TABLE public.sub_batch_lineage IS
  'Immutable source-to-derived physical bag ancestry for split, merge, and cleaning operations.';

COMMENT ON COLUMN public.sub_batch_lineage.operation_id IS
  'Groups all edges written by one derivation; cleaning operations use batch_cleaning.id.';

CREATE FUNCTION public.validate_sub_batch_lineage_edge()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source_batch_id UUID;
  v_derived_batch_id UUID;
  v_source_owner_org_id UUID;
  v_derived_owner_org_id UUID;
BEGIN
  SELECT sb.batch_id, b.organisation_id
  INTO v_source_batch_id, v_source_owner_org_id
  FROM public.sub_batches sb
  INNER JOIN public.batches b ON b.id = sb.batch_id
  WHERE sb.id = NEW.source_sub_batch_id;

  SELECT sb.batch_id, b.organisation_id
  INTO v_derived_batch_id, v_derived_owner_org_id
  FROM public.sub_batches sb
  INNER JOIN public.batches b ON b.id = sb.batch_id
  WHERE sb.id = NEW.derived_sub_batch_id;

  IF v_source_batch_id IS NULL OR v_derived_batch_id IS NULL THEN
    RAISE EXCEPTION 'Lineage bags must exist'
      USING ERRCODE = '23514';
  END IF;

  IF v_source_owner_org_id IS DISTINCT FROM v_derived_owner_org_id THEN
    RAISE EXCEPTION 'Lineage cannot cross seed owners'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.operation_kind IN ('split', 'merge')
    AND v_source_batch_id IS DISTINCT FROM v_derived_batch_id THEN
    RAISE EXCEPTION '% lineage must stay within one parent batch',
      NEW.operation_kind
      USING ERRCODE = '23514';
  END IF;

  IF NEW.operation_kind = 'split' AND EXISTS (
    SELECT 1
    FROM public.sub_batch_lineage lineage
    WHERE lineage.operation_kind = 'split'
      AND lineage.operation_id = NEW.operation_id
      AND lineage.source_sub_batch_id <> NEW.source_sub_batch_id
  ) THEN
    RAISE EXCEPTION 'A split operation must have one source bag'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.operation_kind = 'merge' AND EXISTS (
    SELECT 1
    FROM public.sub_batch_lineage lineage
    WHERE lineage.operation_kind = 'merge'
      AND lineage.operation_id = NEW.operation_id
      AND lineage.derived_sub_batch_id <> NEW.derived_sub_batch_id
  ) THEN
    RAISE EXCEPTION 'A merge operation must have one derived bag'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.operation_kind = 'cleaning' AND NOT EXISTS (
    SELECT 1
    FROM public.batch_cleaning cleaning
    INNER JOIN public.batch_cleaning_output output
      ON output.cleaning_id = cleaning.id
    INNER JOIN public.sub_batches derived
      ON derived.batch_id = output.output_batch_id
    WHERE cleaning.id = NEW.operation_id
      AND cleaning.input_sub_batch_id = NEW.source_sub_batch_id
      AND derived.id = NEW.derived_sub_batch_id
  ) THEN
    RAISE EXCEPTION 'Cleaning lineage must match its cleaning input and output'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    WITH RECURSIVE descendants (sub_batch_id) AS (
      SELECT NEW.derived_sub_batch_id
      UNION
      SELECT lineage.derived_sub_batch_id
      FROM public.sub_batch_lineage lineage
      INNER JOIN descendants
        ON descendants.sub_batch_id = lineage.source_sub_batch_id
    )
    SELECT 1
    FROM descendants
    WHERE sub_batch_id = NEW.source_sub_batch_id
  ) THEN
    RAISE EXCEPTION 'Lineage edge would create a cycle'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER sub_batch_lineage_validate_edge
BEFORE INSERT ON public.sub_batch_lineage
FOR EACH ROW EXECUTE FUNCTION public.validate_sub_batch_lineage_edge();

CREATE FUNCTION public.reject_sub_batch_lineage_rewrite()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Sub-batch lineage is append-only'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER sub_batch_lineage_reject_rewrite
BEFORE UPDATE OR DELETE ON public.sub_batch_lineage
FOR EACH ROW EXECUTE FUNCTION public.reject_sub_batch_lineage_rewrite();

ALTER TABLE public.sub_batch_lineage ENABLE ROW LEVEL SECURITY;

CREATE POLICY sub_batch_lineage_select_participant
ON public.sub_batch_lineage
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.sub_batches bag
    INNER JOIN public.batches batch ON batch.id = bag.batch_id
    WHERE bag.id IN (
      sub_batch_lineage.source_sub_batch_id,
      sub_batch_lineage.derived_sub_batch_id
    )
      AND (
        batch.organisation_id = public.get_user_organisation_id()
        OR bag.held_by_org_id = public.get_user_organisation_id()
      )
  )
);

GRANT SELECT ON public.sub_batch_lineage TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.sub_batch_lineage FROM authenticated;

CREATE FUNCTION public.fn_resolve_testing_assignments_for_sub_batch(
  p_sub_batch_id UUID
) RETURNS TABLE (assignment_id UUID)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH RECURSIVE ancestors (sub_batch_id) AS (
    VALUES (p_sub_batch_id)
    UNION
    SELECT lineage.source_sub_batch_id
    FROM public.sub_batch_lineage lineage
    INNER JOIN ancestors
      ON ancestors.sub_batch_id = lineage.derived_sub_batch_id
  )
  SELECT DISTINCT assignment.id
  FROM ancestors
  INNER JOIN public.batch_testing_assignment assignment
    ON assignment.sub_batch_id = ancestors.sub_batch_id
  ORDER BY assignment.id;
$$;

REVOKE ALL ON FUNCTION
  public.fn_resolve_testing_assignments_for_sub_batch(UUID)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  public.fn_resolve_testing_assignments_for_sub_batch(UUID)
  TO authenticated;

COMMENT ON FUNCTION
  public.fn_resolve_testing_assignments_for_sub_batch(UUID) IS
  'Resolves distinct testing assignments represented by a bag through all of its lineage ancestors.';
