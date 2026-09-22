-- Inventory data migration
--
-- Preserve collection quantities while replacing free-text units with the
-- organisation-scoped container catalogue. Existing members retain their
-- pre-feature collection-writing access.

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

UPDATE public.org_user
SET permissions = ARRAY['collections']::public.org_permission[]
WHERE role = 'Member';

UPDATE public.invitation
SET permissions = ARRAY['collections']::public.org_permission[]
WHERE role = 'Member'
  AND accepted_at IS NULL;

ALTER TABLE public.collection DROP COLUMN amount_units;
ALTER TABLE public.collection DROP COLUMN amount_quantity;
