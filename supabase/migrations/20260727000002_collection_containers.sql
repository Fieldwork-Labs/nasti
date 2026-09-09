-- ============================================================================
-- COLLECTION_CONTAINERS: what a collection was collected into
-- ============================================================================
-- Replaces the free-text collection.amount_units. A collection can span
-- several containers, each holding its own amount, so the relationship is a
-- join table rather than a column on collection.
--
-- `amount` is nullable: collectors in the field regularly record which
-- containers were used before they know how much went into each one.

CREATE TABLE public.collection_containers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL
    REFERENCES public.collection(id) ON DELETE CASCADE,
  container_id uuid NOT NULL
    REFERENCES public.containers(id) ON DELETE RESTRICT,
  amount numeric CHECK (amount IS NULL OR amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (collection_id, container_id)
);

CREATE INDEX collection_containers_collection_id_idx
  ON public.collection_containers (collection_id);
CREATE INDEX collection_containers_container_id_idx
  ON public.collection_containers (container_id);

-- ============================================================================
-- RLS: mirrors collection_photo — scoped through the parent collection
-- ============================================================================
ALTER TABLE public.collection_containers ENABLE ROW LEVEL SECURITY;

CREATE POLICY collection_containers_select ON public.collection_containers
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.collection c
    WHERE c.id = collection_containers.collection_id
      AND c.organisation_id = (SELECT public.get_user_organisation_id())
  ));

-- The container must belong to the caller's organisation too, which keeps
-- collections from referencing another org's container catalogue.
CREATE POLICY collection_containers_insert ON public.collection_containers
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.collection c
      WHERE c.id = collection_containers.collection_id
        AND c.organisation_id = (SELECT public.get_user_organisation_id())
    )
    AND EXISTS (
      SELECT 1 FROM public.containers ct
      WHERE ct.id = collection_containers.container_id
        AND ct.organisation_id = (SELECT public.get_user_organisation_id())
    )
  );

CREATE POLICY collection_containers_update ON public.collection_containers
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.collection c
    WHERE c.id = collection_containers.collection_id
      AND c.organisation_id = (SELECT public.get_user_organisation_id())
      AND (
        c.created_by = (SELECT auth.uid())
        OR (SELECT public.auth_org_role()) = 'Admin'
      )
  ))
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.collection c
      WHERE c.id = collection_containers.collection_id
        AND c.organisation_id = (SELECT public.get_user_organisation_id())
    )
    AND EXISTS (
      SELECT 1 FROM public.containers ct
      WHERE ct.id = collection_containers.container_id
        AND ct.organisation_id = (SELECT public.get_user_organisation_id())
    )
  );

CREATE POLICY collection_containers_delete ON public.collection_containers
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.collection c
    WHERE c.id = collection_containers.collection_id
      AND c.organisation_id = (SELECT public.get_user_organisation_id())
      AND (
        c.created_by = (SELECT auth.uid())
        OR (SELECT public.auth_org_role()) = 'Admin'
      )
  ));

-- ============================================================================
-- Migrate collection.amount_units into the new structure, then drop it
-- ============================================================================
-- Each distinct unit an organisation has typed becomes a container, so no
-- historical amount information is lost. They come in inactive: they are
-- free-text leftovers, not a catalogue the org has curated, so admins opt them
-- into the pick list rather than out of it. DISTINCT ON matches the unique
-- index's case-insensitive key, so "Buckets" and "buckets" collapse into one.

INSERT INTO public.containers (organisation_id, name, purpose, active)
SELECT DISTINCT ON (c.organisation_id, lower(btrim(c.amount_units)))
  c.organisation_id,
  btrim(c.amount_units),
  'collection'::public.container_purpose,
  false
FROM public.collection c
WHERE c.organisation_id IS NOT NULL
  AND c.amount_units IS NOT NULL
  AND btrim(c.amount_units) <> ''
ORDER BY
  c.organisation_id,
  lower(btrim(c.amount_units)),
  c.created_at;

INSERT INTO public.collection_containers (collection_id, container_id, amount)
SELECT
  c.id,
  ct.id,
  CASE WHEN c.amount_quantity > 0 THEN c.amount_quantity END
FROM public.collection c
INNER JOIN public.containers ct
  ON ct.organisation_id = c.organisation_id
  AND lower(btrim(ct.name)) = lower(btrim(c.amount_units))
  AND ct.purpose = 'collection'
WHERE c.organisation_id IS NOT NULL
  AND c.amount_units IS NOT NULL
  AND btrim(c.amount_units) <> '';

ALTER TABLE public.collection
  DROP COLUMN amount_units;
  
ALTER TABLE public.collection
  DROP COLUMN amount_quantity;
