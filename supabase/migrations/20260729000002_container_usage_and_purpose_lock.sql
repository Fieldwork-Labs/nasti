-- ============================================================================
-- CONTAINER USAGE AND PURPOSE IMMUTABILITY
-- ============================================================================
-- Usage summaries must include historical rows hidden by ordinary custody RLS,
-- while remaining scoped to the caller's organisation. Purpose is fixed at
-- creation; replacement is explicit through delete/deactivate plus create.

CREATE OR REPLACE FUNCTION public.fn_get_container_usage()
RETURNS TABLE (
  container_id UUID,
  collection_count BIGINT,
  storage_sub_batch_count BIGINT
) AS $$
  SELECT
    container.id AS container_id,
    count(DISTINCT collection_container.collection_id) AS collection_count,
    count(DISTINCT sub_batch.id) AS storage_sub_batch_count
  FROM public.containers container
  LEFT JOIN public.collection_containers collection_container
    ON collection_container.container_id = container.id
  LEFT JOIN public.sub_batches sub_batch
    ON sub_batch.container_id = container.id
  WHERE container.organisation_id = public.get_user_organisation_id()
  GROUP BY container.id;
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '';

REVOKE ALL ON FUNCTION public.fn_get_container_usage() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_get_container_usage()
  TO authenticated;

COMMENT ON FUNCTION public.fn_get_container_usage() IS
  'Returns complete collection and storage sub-batch usage counts for the caller organisation containers.';

CREATE OR REPLACE FUNCTION public.prevent_container_purpose_change()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Container purpose cannot be changed after creation'
    USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '';

REVOKE ALL ON FUNCTION public.prevent_container_purpose_change()
  FROM PUBLIC;

DROP TRIGGER IF EXISTS containers_purpose_immutable
ON public.containers;

CREATE TRIGGER containers_purpose_immutable
BEFORE UPDATE OF purpose
ON public.containers
FOR EACH ROW
WHEN (OLD.purpose IS DISTINCT FROM NEW.purpose)
EXECUTE FUNCTION public.prevent_container_purpose_change();

COMMENT ON FUNCTION public.prevent_container_purpose_change() IS
  'Makes a container collection/storage purpose immutable after creation.';
