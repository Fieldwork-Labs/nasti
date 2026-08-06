-- Testing organisation members always hold inventory access.
--
-- 20260803000000 split Members into two independently granted areas,
-- `collections` and `inventory`, and an Admin chooses which a Member gets. That
-- choice only makes sense for a General organisation. A Testing organisation
-- exists to receive assigned batches, test them, and return them — it never
-- records a collection or runs a trip, so `collections` is meaningless there
-- and `inventory` is not optional.
--
-- The rule is therefore not a default a user can override, it is an invariant:
-- for a Testing organisation, a Member's permissions are exactly
-- {inventory}. Admins are untouched — the role already implies every
-- permission, so their stored array stays empty in both kinds of organisation.
--
-- Enforced with a row trigger rather than a column default so that it holds on
-- every path into the table: the invitation edge functions, the
-- set_org_user_permissions RPC, and any direct write. The UI hides the choice
-- as well, but that is presentation, not enforcement.

-- ============================================================================
-- The invariant
-- ============================================================================
CREATE OR REPLACE FUNCTION public.normalise_org_member_permissions()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY DEFINER so the organisation lookup does not depend on whether the
-- writer can see the organisation row under RLS.
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org_type public.organisation_type;
BEGIN
  SELECT o.type
    INTO v_org_type
  FROM public.organisation o
  WHERE o.id = NEW.organisation_id;

  IF v_org_type = 'Testing' AND NEW.role = 'Member' THEN
    NEW.permissions := ARRAY['inventory']::public.org_permission[];
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.normalise_org_member_permissions() IS
  'Forces Members of a Testing organisation to hold exactly {inventory}. General organisations keep the per-member choice; Admins are unaffected in both.';

DROP TRIGGER IF EXISTS org_user_normalise_permissions ON public.org_user;
CREATE TRIGGER org_user_normalise_permissions
  BEFORE INSERT OR UPDATE ON public.org_user
  FOR EACH ROW EXECUTE FUNCTION public.normalise_org_member_permissions();

-- The invitation carries the permissions that accept_invitation copies onto
-- org_user, so it has to obey the same rule or the invitation would advertise
-- access the accepted member will not get.
DROP TRIGGER IF EXISTS invitation_normalise_permissions ON public.invitation;
CREATE TRIGGER invitation_normalise_permissions
  BEFORE INSERT OR UPDATE ON public.invitation
  FOR EACH ROW EXECUTE FUNCTION public.normalise_org_member_permissions();

-- ============================================================================
-- Bring existing rows into line
-- ============================================================================
-- 20260803000000 backfilled every Member to {collections} without checking the
-- organisation type. Production has no Testing organisations, so this is a
-- no-op there; it matters for development databases and for any Testing
-- organisation created between that migration and this one.
UPDATE public.org_user ou
SET permissions = ARRAY['inventory']::public.org_permission[]
FROM public.organisation o
WHERE o.id = ou.organisation_id
  AND o.type = 'Testing'
  AND ou.role = 'Member'
  AND ou.permissions IS DISTINCT FROM ARRAY['inventory']::public.org_permission[];

UPDATE public.invitation i
SET permissions = ARRAY['inventory']::public.org_permission[]
FROM public.organisation o
WHERE o.id = i.organisation_id
  AND o.type = 'Testing'
  AND i.role = 'Member'
  AND i.accepted_at IS NULL
  AND i.permissions IS DISTINCT FROM ARRAY['inventory']::public.org_permission[];

-- ============================================================================
-- There is no permission choice to make in a Testing organisation
-- ============================================================================
-- The trigger above would silently rewrite whatever this RPC was asked to
-- store, and the function would then return a value that does not match the
-- row. Rejecting is the honest answer: the caller asked for something the
-- domain does not offer.
CREATE OR REPLACE FUNCTION public.set_org_user_permissions(
  p_user_id uuid,
  p_permissions public.org_permission[]
)
RETURNS public.org_permission[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org_id uuid := (SELECT public.get_user_organisation_id());
  v_target public.org_user;
  v_permissions public.org_permission[];
BEGIN
  IF (SELECT public.auth_org_role()) IS DISTINCT FROM 'Admin' THEN
    RAISE EXCEPTION 'Only organisation admins can change member permissions'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_target
  FROM public.org_user
  WHERE user_id = p_user_id
    AND organisation_id = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User is not a member of your organisation'
      USING ERRCODE = '42501';
  END IF;

  IF v_target.role = 'Admin' THEN
    RAISE EXCEPTION 'Admins already have access to every area'
      USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT o.type FROM public.organisation o WHERE o.id = v_org_id
  ) = 'Testing' THEN
    RAISE EXCEPTION 'Members of a testing organisation always have inventory access'
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT p ORDER BY p), '{}'::public.org_permission[])
  INTO v_permissions
  FROM unnest(COALESCE(p_permissions, '{}'::public.org_permission[])) AS t(p);

  UPDATE public.org_user
  SET permissions = v_permissions
  WHERE id = v_target.id;

  RETURN v_permissions;
END;
$$;

REVOKE ALL PRIVILEGES
  ON FUNCTION public.set_org_user_permissions(uuid, public.org_permission[])
  FROM PUBLIC, anon;
GRANT EXECUTE
  ON FUNCTION public.set_org_user_permissions(uuid, public.org_permission[])
  TO authenticated;

COMMENT ON FUNCTION public.set_org_user_permissions(uuid, public.org_permission[]) IS
  'Admin-only: replace a General organisation member''s area permissions. Rejected for Testing organisations, whose members always hold inventory. Takes effect on the member''s next token refresh.';
