-- ============================================================================
-- STORAGE LOCATION RETIREMENT
-- ============================================================================
-- Referenced locations must remain available to storage history. Unused
-- locations may still be deleted; used locations are retired instead.

ALTER TABLE public.storage_locations
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.storage_locations.active IS
  'Whether this location may be selected for new storage assignments.';

ALTER TABLE public.batch_storage
  DROP CONSTRAINT IF EXISTS batch_storage_location_id_fkey;

ALTER TABLE public.batch_storage
  ADD CONSTRAINT batch_storage_location_id_fkey
    FOREIGN KEY (location_id)
    REFERENCES public.storage_locations(id)
    ON DELETE RESTRICT;

-- Existing hooks edit locations directly, so restore the missing admin update
-- policy. Removal itself remains server-authoritative through the RPC below.
DROP POLICY IF EXISTS storage_locations_update ON public.storage_locations;

CREATE POLICY storage_locations_update ON public.storage_locations
  FOR UPDATE TO authenticated
  USING (
    organisation_id = (SELECT public.get_user_organisation_id())
    AND (SELECT public.auth_org_role()) = 'Admin'
  )
  WITH CHECK (
    organisation_id = (SELECT public.get_user_organisation_id())
    AND (SELECT public.auth_org_role()) = 'Admin'
  );

CREATE OR REPLACE FUNCTION public.validate_active_storage_location()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.storage_locations location
    WHERE location.id = NEW.location_id
      AND location.active
  ) THEN
    RAISE EXCEPTION 'Storage location is inactive or does not exist'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS batch_storage_active_location
ON public.batch_storage;

CREATE TRIGGER batch_storage_active_location
BEFORE INSERT OR UPDATE OF location_id
ON public.batch_storage
FOR EACH ROW EXECUTE FUNCTION public.validate_active_storage_location();

CREATE OR REPLACE FUNCTION public.fn_remove_storage_location(
  p_location_id UUID
) RETURNS TEXT AS $$
DECLARE
  v_location public.storage_locations%ROWTYPE;
BEGIN
  SELECT location.*
  INTO v_location
  FROM public.storage_locations location
  WHERE location.id = p_location_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Storage location not found';
  END IF;

  IF v_location.organisation_id IS DISTINCT FROM
    public.get_user_organisation_id()
    OR public.auth_org_role() IS DISTINCT FROM 'Admin' THEN
    RAISE EXCEPTION 'Permission denied: organisation admin required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.batch_storage storage
    WHERE storage.location_id = p_location_id
  ) THEN
    UPDATE public.storage_locations
    SET active = false
    WHERE id = p_location_id;

    RETURN 'retired';
  END IF;

  DELETE FROM public.storage_locations
  WHERE id = p_location_id;

  RETURN 'deleted';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.fn_remove_storage_location(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_remove_storage_location(UUID)
  TO authenticated;

COMMENT ON FUNCTION public.fn_remove_storage_location(UUID) IS
  'Deletes an unused storage location or retires a referenced location without deleting history.';
