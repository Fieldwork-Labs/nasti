-- SEED BATCH SCHEMA
SET search_path TO public;


-- TABLE: storage_locations
CREATE TABLE storage_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- TABLE: batches
CREATE TABLE batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES collection(id) ON DELETE CASCADE,
  organisation_id UUID NOT NULL REFERENCES organisation(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  weight_grams INTEGER NOT NULL CHECK (weight_grams > 0),
  is_extracted BOOLEAN NOT NULL DEFAULT FALSE,
  is_treated BOOLEAN NOT NULL DEFAULT FALSE,
  is_sorted BOOLEAN NOT NULL DEFAULT FALSE,
  is_coated BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT
);

-- TABLE: batch_custody
CREATE TABLE batch_custody (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  organisation_id UUID NOT NULL REFERENCES organisation(id),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  transferred_by UUID REFERENCES auth.users(id),
  previous_organisation_id UUID REFERENCES organisation(id),
  notes TEXT,
  UNIQUE (batch_id, organisation_id, received_at)
);

-- VIEW: current_batch_custody
CREATE VIEW current_batch_custody AS
SELECT DISTINCT ON (batch_id)
  batch_id,
  organisation_id,
  received_at
FROM batch_custody
ORDER BY batch_id, received_at DESC;


-- TABLE: batch_splits
CREATE TABLE batch_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  child_batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- TABLE: batch_merges
CREATE TABLE batch_merges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merged_batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  source_batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- TABLE: treatments
CREATE TABLE treatments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  description TEXT,
  performed_at TIMESTAMPTZ DEFAULT now(),
  performed_by UUID REFERENCES auth.users(id)
);

-- TABLE: tests
CREATE TABLE tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('viability', 'germination')),
  result JSONB,
  tested_at TIMESTAMPTZ DEFAULT now(),
  tested_by UUID REFERENCES auth.users(id)
);


-- TABLE: batch_storage
CREATE TABLE batch_storage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES storage_locations(id) ON DELETE CASCADE,
  stored_at TIMESTAMPTZ DEFAULT now(),
  moved_out_at TIMESTAMPTZ,
  notes TEXT
);

-----

-- VIEW: current_batch_storage
-- shows the current storage location for each batch
CREATE VIEW current_batch_storage AS
SELECT DISTINCT ON (batch_id)
  batch_id,
  location_id,
  stored_at,
  notes
FROM batch_storage
WHERE moved_out_at IS NULL
ORDER BY batch_id, stored_at DESC;


-- VIEW: batch_lineage_to_collections
CREATE VIEW batch_lineage_to_collections AS
WITH RECURSIVE lineage AS (
  -- Non-recursive term
  SELECT id AS batch_id, collection_id
  FROM batches
  WHERE collection_id IS NOT NULL

  UNION ALL

  -- Single recursive term (combine both joins)
  SELECT 
    COALESCE(bs.child_batch_id, bm.merged_batch_id) AS batch_id,
    l.collection_id
  FROM lineage l
  LEFT JOIN batch_splits bs ON bs.parent_batch_id = l.batch_id
  LEFT JOIN batch_merges bm ON bm.source_batch_id = l.batch_id
  WHERE bs.child_batch_id IS NOT NULL OR bm.merged_batch_id IS NOT NULL
)
SELECT DISTINCT batch_id, collection_id
FROM lineage;


-- VIEW: obfuscated_collection_data
CREATE VIEW obfuscated_collection_data AS
SELECT
  c.id,
  c.organisation_id,
  to_char(c.created_at, 'Mon YYYY') AS collected_month_year
FROM public."collection" c;

-- POLICY HELPERS
CREATE FUNCTION is_org_member(user_id UUID, org_id UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_user WHERE org_user.user_id = user_id AND org_user.organisation_id = org_id
  );
$$ LANGUAGE SQL STABLE;

-- Helper: current custodian org_id for a batch
CREATE OR REPLACE FUNCTION current_custodian_org_id(p_batch_id uuid)
RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT cbc.organisation_id
  FROM current_batch_custody cbc
  WHERE cbc.batch_id = p_batch_id
$$;

-- Helper: is the caller a member of the current custodian org for batch?
CREATE OR REPLACE FUNCTION is_current_custodian(p_user_id uuid, p_batch_id uuid)
RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT is_org_member(p_user_id, current_custodian_org_id(p_batch_id))
$$;

-- Helper: verify all given batches share the same current custodian org.
-- Returns that org_id (or NULL if the set is empty); raises if multiple orgs found.
CREATE OR REPLACE FUNCTION assert_same_custodian(p_batch_ids uuid[])
RETURNS uuid
LANGUAGE plpgsql STABLE AS $$
DECLARE v_org uuid;
BEGIN
  SELECT cbc.organisation_id
  INTO v_org
  FROM current_batch_custody cbc
  JOIN unnest(p_batch_ids) b(id) ON b.id = cbc.batch_id
  GROUP BY cbc.organisation_id
  HAVING count(*) = array_length(p_batch_ids, 1);

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'All source batches must share the same current custodian organisation';
  END IF;
  RETURN v_org;
END;
$$;
----

-- RLS POLICY

-- Returns true if user is a member of *any past or present* custodian org
create or replace function is_batch_custodian_or_past(auth_uid uuid, batch_id uuid)
returns boolean language sql stable as $$
  select exists (
    select 1
    from batch_custody bc
    join org_user om on bc.organisation_id = om.organisation_id
    where bc.batch_id = batch_id
      and om.user_id = auth_uid
  );
$$;

-- For batches
-- BATCHES
ALTER TABLE batches ENABLE ROW LEVEL SECURITY;

-- Read if caller is member of any previous or current custodian org for that batch
CREATE POLICY org_members_can_select_batches
  ON batches
  FOR SELECT
  USING (is_batch_custodian_or_past(auth.uid(), id));

-- Modify only if caller is member of current custodian org for that batch
CREATE POLICY current_custodian_can_update_batches
  ON batches
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM current_batch_custody cbc
      JOIN org_user om ON om.organisation_id = cbc.organisation_id
      WHERE cbc.batch_id = batches.id
      AND om.user_id = auth.uid()
    )
  );

-- Policy for DELETE
CREATE POLICY current_custodian_can_delete_batches
  ON batches
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM current_batch_custody cbc
      JOIN org_user om ON om.organisation_id = cbc.organisation_id
      WHERE cbc.batch_id = batches.id
      AND om.user_id = auth.uid()
    )
  );


-- No INSERT policy: end users create via RPCs only
-- (absence of INSERT policy means inserts are denied)

-- BATCH_CUSTODY
ALTER TABLE batch_custody ENABLE ROW LEVEL SECURITY;

CREATE POLICY custody_select_custodian ON batch_custody
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM current_batch_custody cbc
      WHERE cbc.batch_id = batch_custody.batch_id
        AND is_org_member(auth.uid(), cbc.organisation_id)
    )
  );

CREATE POLICY custody_update_custodian ON batch_custody
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM current_batch_custody cbc
      WHERE cbc.batch_id = batch_custody.batch_id
        AND is_org_member(auth.uid(), cbc.organisation_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM current_batch_custody cbc
      WHERE cbc.batch_id = batch_custody.batch_id
        AND is_org_member(auth.uid(), cbc.organisation_id)
    )
  );

CREATE POLICY custody_delete_custodian ON batch_custody
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM current_batch_custody cbc
      WHERE cbc.batch_id = batch_custody.batch_id
        AND is_org_member(auth.uid(), cbc.organisation_id)
    )
  );

-- No INSERT policy for custody: transfers occur via RPC

-- BATCH_SPLITS
ALTER TABLE batch_splits ENABLE ROW LEVEL SECURITY;

CREATE POLICY splits_select_custodian ON batch_splits
  FOR SELECT USING ( is_current_custodian(auth.uid(), parent_batch_id) );

CREATE POLICY splits_update_custodian ON batch_splits
  FOR UPDATE USING ( is_current_custodian(auth.uid(), parent_batch_id) )
  WITH CHECK    ( is_current_custodian(auth.uid(), parent_batch_id) );

CREATE POLICY splits_delete_custodian ON batch_splits
  FOR DELETE USING ( is_current_custodian(auth.uid(), parent_batch_id) );

-- No INSERT policy: splits created via RPC

-- BATCH_MERGES
ALTER TABLE batch_merges ENABLE ROW LEVEL SECURITY;

CREATE POLICY merges_select_custodian ON batch_merges
  FOR SELECT USING ( is_current_custodian(auth.uid(), merged_batch_id) );

CREATE POLICY merges_update_custodian ON batch_merges
  FOR UPDATE USING ( is_current_custodian(auth.uid(), merged_batch_id) )
  WITH CHECK    ( is_current_custodian(auth.uid(), merged_batch_id) );

CREATE POLICY merges_delete_custodian ON batch_merges
  FOR DELETE USING ( is_current_custodian(auth.uid(), merged_batch_id) );

-- No INSERT policy: merges created via RPC

-- RLS for batch_storage
ALTER TABLE batch_storage ENABLE ROW LEVEL SECURITY;

-- Policy: current custodian organisation members can view storage records
CREATE POLICY custodian_can_view_batch_storage ON batch_storage
  USING (
    EXISTS (
      SELECT 1
      FROM current_batch_custody cbc
      WHERE cbc.batch_id = batch_storage.batch_id
        AND is_org_member(auth.uid(), cbc.organisation_id)
    )
  );

-- Policy: current custodian organisation members can insert storage records
CREATE POLICY custodian_can_insert_batch_storage ON batch_storage
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM current_batch_custody cbc
      WHERE cbc.batch_id = batch_storage.batch_id
        AND is_org_member(auth.uid(), cbc.organisation_id)
    )
  );

-- Policy: current custodian organisation members can update storage records
CREATE POLICY custodian_can_update_batch_storage ON batch_storage
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM current_batch_custody cbc
      WHERE cbc.batch_id = batch_storage.batch_id
        AND is_org_member(auth.uid(), cbc.organisation_id)
    )
  );


-- For treatments: current custodian org
ALTER TABLE treatments ENABLE ROW LEVEL SECURITY;
CREATE POLICY custodian_can_access_treatments ON treatments
USING (EXISTS (
SELECT 1 FROM batches b
JOIN current_batch_custody cbc ON b.id = cbc.batch_id
WHERE b.id = treatments.batch_id AND is_org_member(auth.uid(), cbc.organisation_id)
));


-- For tests: current custodian org and testers assigned
ALTER TABLE tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY custodian_can_access_tests ON tests
USING (EXISTS (
SELECT 1 FROM batches b
JOIN current_batch_custody cbc ON b.id = cbc.batch_id
WHERE b.id = tests.batch_id AND is_org_member(auth.uid(), cbc.organisation_id)
));
