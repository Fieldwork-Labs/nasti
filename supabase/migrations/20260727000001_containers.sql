-- ============================================================================
-- CONTAINERS: organisation-level catalogue of the seed containers an org uses
-- ============================================================================
-- Managed by org admins under Settings > Containers. Collections reference
-- these through collection_containers to record what the seed was collected
-- into and how much went into each container.
--
-- `active` lets an org retire a container without breaking the historical
-- collections that already reference it.

CREATE TYPE public.container_purpose AS ENUM ('collection', 'storage');

CREATE TABLE public.containers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL
    REFERENCES public.organisation(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (btrim(name) <> ''),
  purpose public.container_purpose NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX containers_organisation_id_idx
  ON public.containers (organisation_id);

-- A container name is only meaningful once per purpose within an organisation.
CREATE UNIQUE INDEX containers_organisation_name_purpose_key
  ON public.containers (organisation_id, lower(btrim(name)), purpose);

-- ============================================================================
-- RLS: readable by the whole organisation, writable by admins only
-- ============================================================================
ALTER TABLE public.containers ENABLE ROW LEVEL SECURITY;

CREATE POLICY containers_select ON public.containers
  FOR SELECT TO authenticated
  USING (organisation_id = (SELECT public.get_user_organisation_id()));

CREATE POLICY containers_insert ON public.containers
  FOR INSERT TO authenticated
  WITH CHECK (
    organisation_id = (SELECT public.get_user_organisation_id())
    AND (SELECT public.auth_org_role()) = 'Admin'
  );

CREATE POLICY containers_update ON public.containers
  FOR UPDATE TO authenticated
  USING (
    organisation_id = (SELECT public.get_user_organisation_id())
    AND (SELECT public.auth_org_role()) = 'Admin'
  )
  WITH CHECK (
    organisation_id = (SELECT public.get_user_organisation_id())
    AND (SELECT public.auth_org_role()) = 'Admin'
  );

CREATE POLICY containers_delete ON public.containers
  FOR DELETE TO authenticated
  USING (
    organisation_id = (SELECT public.get_user_organisation_id())
    AND (SELECT public.auth_org_role()) = 'Admin'
  );
