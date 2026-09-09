-- ============================================================================
-- STORAGE RELATIONSHIP TENANCY
-- ============================================================================
-- RLS establishes who may write a bag, but it does not by itself guarantee
-- that catalogue references belong to whoever holds it. Enforce that invariant
-- for direct writes as well as RPC-managed workflows.
--
-- Both validators key on the bag's holder rather than the parent batch's
-- custodian. That is what lets a Testing organisation put a bag it has been
-- sent into its own container and its own storage location without gaining any
-- sight of the owner's catalogue — and it is what stops the owner referencing
-- its own containers on a bag it no longer holds.

CREATE OR REPLACE FUNCTION public.validate_sub_batch_storage_container()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.container_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- held_by_org_id is NOT NULL and is filled by sub_batches_default_held_by,
  -- which sorts before this trigger and so has already run.
  IF NOT EXISTS (
    SELECT 1
    FROM public.containers container
    WHERE container.id = NEW.container_id
      AND container.organisation_id = NEW.held_by_org_id
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
  'Requires a sub-batch container to be an active storage container owned by the organisation holding the bag.';

CREATE OR REPLACE FUNCTION public.validate_active_storage_location()
RETURNS TRIGGER AS $$
DECLARE
  v_holder_organisation_id UUID;
  v_location_organisation_id UUID;
  v_location_active BOOLEAN;
BEGIN
  SELECT sb.held_by_org_id
  INTO v_holder_organisation_id
  FROM public.sub_batches sb
  WHERE sb.id = NEW.sub_batch_id;

  IF v_holder_organisation_id IS NULL THEN
    RAISE EXCEPTION 'Storage row does not reference an existing bag'
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
    v_holder_organisation_id THEN
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

-- sub_batch_id joins the watched columns now that the bag, not the batch, is
-- what decides whose locations are valid.
CREATE TRIGGER batch_storage_active_location
BEFORE INSERT OR UPDATE OF location_id, batch_id, sub_batch_id
ON public.batch_storage
FOR EACH ROW
EXECUTE FUNCTION public.validate_active_storage_location();

COMMENT ON FUNCTION public.validate_active_storage_location() IS
  'Requires storage rows to reference an active location owned by the organisation holding the bag.';
