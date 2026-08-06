-- ============================================================================
-- STORAGE RELATIONSHIP TENANCY
-- ============================================================================
-- RLS establishes who may write a batch, but it does not by itself guarantee
-- that catalogue references belong to the batch's current custodian. Enforce
-- that invariant for direct writes as well as RPC-managed workflows.

CREATE OR REPLACE FUNCTION public.validate_sub_batch_storage_container()
RETURNS TRIGGER AS $$
DECLARE
  v_custodian_organisation_id UUID;
BEGIN
  IF NEW.container_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT custody.organisation_id
  INTO v_custodian_organisation_id
  FROM public.batch_custody custody
  WHERE custody.batch_id = NEW.batch_id
  ORDER BY custody.received_at DESC, custody.id DESC
  LIMIT 1;

  IF v_custodian_organisation_id IS NULL THEN
    RAISE EXCEPTION 'Batch has no current custodian organisation'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.containers container
    WHERE container.id = NEW.container_id
      AND container.organisation_id = v_custodian_organisation_id
      AND container.purpose = 'storage'
      AND container.active
  ) THEN
    RAISE EXCEPTION
      'Storage container is inactive, invalid, or belongs to another organisation'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '';

REVOKE ALL ON FUNCTION public.validate_sub_batch_storage_container()
  FROM PUBLIC;

DROP TRIGGER IF EXISTS sub_batches_storage_container_relationship
ON public.sub_batches;

CREATE TRIGGER sub_batches_storage_container_relationship
BEFORE INSERT OR UPDATE OF container_id, batch_id
ON public.sub_batches
FOR EACH ROW
EXECUTE FUNCTION public.validate_sub_batch_storage_container();

COMMENT ON FUNCTION public.validate_sub_batch_storage_container() IS
  'Requires a sub-batch container to be an active storage container owned by the batch current custodian.';

CREATE OR REPLACE FUNCTION public.validate_active_storage_location()
RETURNS TRIGGER AS $$
DECLARE
  v_custodian_organisation_id UUID;
  v_location_organisation_id UUID;
  v_location_active BOOLEAN;
BEGIN
  SELECT custody.organisation_id
  INTO v_custodian_organisation_id
  FROM public.batch_custody custody
  WHERE custody.batch_id = NEW.batch_id
  ORDER BY custody.received_at DESC, custody.id DESC
  LIMIT 1;

  IF v_custodian_organisation_id IS NULL THEN
    RAISE EXCEPTION 'Batch has no current custodian organisation'
      USING ERRCODE = '23514';
  END IF;

  SELECT location.organisation_id, location.active
  INTO v_location_organisation_id, v_location_active
  FROM public.storage_locations location
  WHERE location.id = NEW.location_id;

  IF NOT FOUND OR NOT v_location_active THEN
    RAISE EXCEPTION 'Storage location is inactive or does not exist'
      USING ERRCODE = '23514';
  END IF;

  IF v_location_organisation_id IS DISTINCT FROM
    v_custodian_organisation_id THEN
    RAISE EXCEPTION 'Storage location belongs to another organisation'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '';

REVOKE ALL ON FUNCTION public.validate_active_storage_location()
  FROM PUBLIC;

DROP TRIGGER IF EXISTS batch_storage_active_location
ON public.batch_storage;

CREATE TRIGGER batch_storage_active_location
BEFORE INSERT OR UPDATE OF location_id, batch_id
ON public.batch_storage
FOR EACH ROW
EXECUTE FUNCTION public.validate_active_storage_location();

COMMENT ON FUNCTION public.validate_active_storage_location() IS
  'Requires storage rows to reference an active location owned by the batch current custodian.';
