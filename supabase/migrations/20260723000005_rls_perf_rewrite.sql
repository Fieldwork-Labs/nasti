-- Comprehensive RLS rewrite addressing the advisor's perf warnings:
--   * auth_rls_initplan       — wrap auth.uid() / helper calls in (SELECT ...)
--                               so they're evaluated once per query, not per row
--   * multiple_permissive_policies — drop legacy duplicates, merge dual-purpose
--                                    policies into single OR'd ones
--
-- Also leverages the JWT claims hook from 20260507000003: org membership and
-- role now come from get_user_organisation_id() / auth_org_role() without a
-- join to org_user.
--
-- Naming convention: <table>_<action>[_<scope>]. Older verbose names are
-- replaced; references in app code use table+action, not policy names.

-- ============================================================================
-- custody policy helpers
-- ============================================================================
-- current_batch_custody is now a security-invoker view. The original helper
-- functions queried that view (or batch_custody directly) as the caller, which
-- re-entered batch_custody's own RLS policy and caused a stack-depth error.
-- These boolean-only predicates need an unfiltered custody history to answer
-- correctly, so they bypass RLS in a tightly scoped function and reject calls
-- made on behalf of any user other than the authenticated caller.
--
-- Custody moved to the bag (sub_batches.held_by_org_id, 20260723000001), so the
-- predicates below split into two grains. The batch-grained one answers "does
-- the caller's organisation own this batch"; the bag-grained ones answer "may
-- the caller read, or act on, this exact bag". A batch-only predicate leaks
-- siblings on read and hands the owner power over a Testing-held bag on write,
-- so anything that touches bag-level material uses the bag-grained pair.

-- Retained under its old name, and no longer reading batch_custody at all.
-- With treatments and full-batch assignment gone, every surviving write to
-- batch_custody is "a batch was just created", so the latest custody row never
-- diverges from batches.organisation_id and this predicate provably means
-- "batch owner". Renaming it would bury the bag-custody change under forty
-- call sites; that is a follow-up, recorded in the plan's maintenance notes.
CREATE OR REPLACE FUNCTION public.is_current_custodian(
  p_user_id uuid,
  p_batch_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    $1 = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.batches b
      INNER JOIN public.org_user ou
        ON ou.organisation_id = b.organisation_id
      WHERE b.id = $2
        AND ou.user_id = $1
        AND ou.is_active = true
    )
$$;

COMMENT ON FUNCTION public.is_current_custodian(uuid, uuid) IS
  'Batch owner check. The name is retained for its ~40 call sites; batch_custody is no longer consulted. Bag-level questions use is_current_bag_custodian.';

-- The write/act gate. Everything that mutates, consumes or moves a bag asks
-- this and nothing else: it is true for a General organisation working its own
-- bag and for a Testing organisation working one it has been sent, and false
-- for the owner of a batch whose bag is currently in someone else's hands.
CREATE OR REPLACE FUNCTION public.is_current_bag_custodian(
  p_user_id uuid,
  p_sub_batch_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    $1 = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.sub_batches sb
      INNER JOIN public.org_user ou
        ON ou.organisation_id = sb.held_by_org_id
      WHERE sb.id = $2
        AND ou.user_id = $1
        AND ou.is_active = true
    )
$$;

COMMENT ON FUNCTION public.is_current_bag_custodian(uuid, uuid) IS
  'True when the caller is an active member of the organisation holding this bag. The single write/act gate for bag-level operations.';

-- The read gate, and the reason a Testing organisation's retained bag is
-- invisible to the General organisation it came from: that bag is held by
-- Testing and has no assignment naming General as its sender, so neither arm
-- below matches.
--
-- Deliberately plpgsql rather than sql. A LANGUAGE sql body is name-resolved
-- when the function is created, and batch_testing_assignment.sub_batch_id is
-- not in place until 20260804000001, which runs after this migration. A plpgsql
-- body resolves at call time, by which point the column exists — and nothing
-- evaluates an RLS predicate between the two migrations, because migrations run
-- as the table owner.
CREATE OR REPLACE FUNCTION public.can_read_sub_batch(p_sub_batch_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.sub_batches sb
    INNER JOIN public.org_user ou
      ON ou.organisation_id = sb.held_by_org_id
    WHERE sb.id = p_sub_batch_id
      AND ou.user_id = (SELECT auth.uid())
      AND ou.is_active = true
  )
  OR EXISTS (
    SELECT 1
    FROM public.batch_testing_assignment bta
    INNER JOIN public.org_user ou
      ON ou.organisation_id = bta.assigned_by_org_id
    WHERE bta.sub_batch_id = p_sub_batch_id
      AND ou.user_id = (SELECT auth.uid())
      AND ou.is_active = true
  );
END;
$$;

COMMENT ON FUNCTION public.can_read_sub_batch(uuid) IS
  'Bag read boundary: the organisation holding the bag, or the organisation that sent it for testing. Open or closed assignments both count, so a sender keeps its history.';

-- Replaces has_active_testing_assignment(uuid). Holding a bag, not being named
-- on an open assignment row, is what earns a Testing organisation sight of the
-- parent batch and its collection and species.
CREATE OR REPLACE FUNCTION public.holds_any_bag_of_batch(p_batch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sub_batches sb
    INNER JOIN public.org_user ou
      ON ou.organisation_id = sb.held_by_org_id
    WHERE sb.batch_id = p_batch_id
      AND ou.user_id = (SELECT auth.uid())
      AND ou.is_active = true
  )
$$;

COMMENT ON FUNCTION public.holds_any_bag_of_batch(uuid) IS
  'True when the caller''s organisation holds at least one bag of the batch.';

-- Not caller-relative: it answers whether any of the batch's seed has left the
-- owner's hands at all. Deleting a batch cascades through its bags — and,
-- from 20260804000001, through the assignments naming them — so the delete
-- policy needs an unfiltered answer. Asking through RLS would not give one: a
-- bag a Testing organisation split off and kept is invisible to the owner, and
-- is exactly the row that must block the delete.
CREATE OR REPLACE FUNCTION public.batch_has_externally_held_bags(p_batch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sub_batches sb
    INNER JOIN public.batches b ON b.id = sb.batch_id
    WHERE sb.batch_id = p_batch_id
      AND sb.held_by_org_id IS DISTINCT FROM b.organisation_id
  )
$$;

COMMENT ON FUNCTION public.batch_has_externally_held_bags(uuid) IS
  'True when any bag of the batch is held by an organisation other than the batch owner. Blocks destructive whole-batch operations.';

CREATE OR REPLACE FUNCTION public.is_batch_custodian_or_past(
  auth_uid uuid,
  batch_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    $1 = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.batch_custody bc
      INNER JOIN public.org_user ou
        ON ou.organisation_id = bc.organisation_id
      WHERE bc.batch_id = $2
        AND ou.user_id = $1
        AND ou.is_active = true
    )
$$;

REVOKE ALL PRIVILEGES
  ON FUNCTION public.is_current_custodian(uuid, uuid)
  FROM PUBLIC, anon;
REVOKE ALL PRIVILEGES
  ON FUNCTION public.is_current_bag_custodian(uuid, uuid)
  FROM PUBLIC, anon;
REVOKE ALL PRIVILEGES
  ON FUNCTION public.can_read_sub_batch(uuid)
  FROM PUBLIC, anon;
REVOKE ALL PRIVILEGES
  ON FUNCTION public.holds_any_bag_of_batch(uuid)
  FROM PUBLIC, anon;
REVOKE ALL PRIVILEGES
  ON FUNCTION public.batch_has_externally_held_bags(uuid)
  FROM PUBLIC, anon;
REVOKE ALL PRIVILEGES
  ON FUNCTION public.is_batch_custodian_or_past(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE
  ON FUNCTION public.is_current_custodian(uuid, uuid)
  TO authenticated;
GRANT EXECUTE
  ON FUNCTION public.is_current_bag_custodian(uuid, uuid)
  TO authenticated;
GRANT EXECUTE
  ON FUNCTION public.can_read_sub_batch(uuid)
  TO authenticated;
GRANT EXECUTE
  ON FUNCTION public.holds_any_bag_of_batch(uuid)
  TO authenticated;
GRANT EXECUTE
  ON FUNCTION public.batch_has_externally_held_bags(uuid)
  TO authenticated;
GRANT EXECUTE
  ON FUNCTION public.is_batch_custodian_or_past(uuid, uuid)
  TO authenticated;

-- ============================================================================
-- collection
-- ============================================================================
DROP POLICY IF EXISTS "collection_rls" ON public.collection;
DROP POLICY IF EXISTS "Allow authenticated users to select collections for their organisation" ON public.collection;
DROP POLICY IF EXISTS "Allow authenticated users to insert collections for their organisation" ON public.collection;
DROP POLICY IF EXISTS "Allow authenticated users to update their own collections or admin to update any" ON public.collection;
DROP POLICY IF EXISTS "Allow authenticated users to delete their own collections or admin to delete any that belong to the organisation" ON public.collection;
DROP POLICY IF EXISTS "collection_select_policy" ON public.collection;

-- The second arm used to read the assignment table directly for an unreturned
-- row. Holding a bag is now the fact that grants sight of what the seed is, so
-- it asks that instead — and it has to, because returned_at no longer exists.
-- 20260804000001 restates this policy; the two must not diverge.
CREATE POLICY collection_select ON public.collection
  FOR SELECT TO authenticated
  USING (
    organisation_id = (SELECT public.get_user_organisation_id())
    OR EXISTS (
      SELECT 1
      FROM public.batches b
      WHERE b.collection_id = collection.id
        AND public.holds_any_bag_of_batch(b.id)
    )
  );

CREATE POLICY collection_insert ON public.collection
  FOR INSERT TO authenticated
  WITH CHECK (organisation_id = (SELECT public.get_user_organisation_id()));

CREATE POLICY collection_update ON public.collection
  FOR UPDATE TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    OR (
      organisation_id = (SELECT public.get_user_organisation_id())
      AND (SELECT public.auth_org_role()) = 'Admin'
    )
  )
  WITH CHECK (organisation_id = (SELECT public.get_user_organisation_id()));

CREATE POLICY collection_delete ON public.collection
  FOR DELETE TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    OR (
      (SELECT public.auth_org_role()) = 'Admin'
      AND organisation_id = (SELECT public.get_user_organisation_id())
    )
  );

-- ============================================================================
-- collection_photo
-- ============================================================================
DROP POLICY IF EXISTS "collection_photo_rls" ON public.collection_photo;
DROP POLICY IF EXISTS "Allow authenticated users to select their collection photos" ON public.collection_photo;
DROP POLICY IF EXISTS "Allow authenticated users to insert collection photos" ON public.collection_photo;
DROP POLICY IF EXISTS "Allow authenticated users to update their own collection photos" ON public.collection_photo;
DROP POLICY IF EXISTS "Allow authenticated users to delete their own collection photos" ON public.collection_photo;
DROP POLICY IF EXISTS "Allow authenticated users to update their own collection photos or admin to update any that belong to the organisation" ON public.collection_photo;
DROP POLICY IF EXISTS "Allow authenticated users to delete their own collection photos or admin to delete any that belong to the organisation" ON public.collection_photo;

CREATE POLICY collection_photo_select ON public.collection_photo
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.collection c
    WHERE c.id = collection_photo.collection_id
      AND c.organisation_id = (SELECT public.get_user_organisation_id())
  ));

CREATE POLICY collection_photo_insert ON public.collection_photo
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.collection c
    WHERE c.id = collection_photo.collection_id
      AND c.organisation_id = (SELECT public.get_user_organisation_id())
  ));

CREATE POLICY collection_photo_update ON public.collection_photo
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.collection c
    WHERE c.id = collection_photo.collection_id
      AND c.organisation_id = (SELECT public.get_user_organisation_id())
      AND (
        c.created_by = (SELECT auth.uid())
        OR (SELECT public.auth_org_role()) = 'Admin'
      )
  ));

CREATE POLICY collection_photo_delete ON public.collection_photo
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.collection c
    WHERE c.id = collection_photo.collection_id
      AND c.organisation_id = (SELECT public.get_user_organisation_id())
      AND (
        c.created_by = (SELECT auth.uid())
        OR (SELECT public.auth_org_role()) = 'Admin'
      )
  ));

-- ============================================================================
-- invitation
-- ============================================================================
DROP POLICY IF EXISTS "invitation_rls" ON public.invitation;
DROP POLICY IF EXISTS invitation_all ON public.invitation;

CREATE POLICY invitation_select ON public.invitation
  FOR SELECT TO authenticated
  USING (
    organisation_id = (SELECT public.get_user_organisation_id())
    AND (SELECT public.auth_org_role()) = 'Admin'
  );

CREATE POLICY invitation_update ON public.invitation
  FOR UPDATE TO authenticated
  USING (
    organisation_id = (SELECT public.get_user_organisation_id())
    AND (SELECT public.auth_org_role()) = 'Admin'
  )
  WITH CHECK (
    organisation_id = (SELECT public.get_user_organisation_id())
    AND (SELECT public.auth_org_role()) = 'Admin'
  );

CREATE POLICY invitation_delete ON public.invitation
  FOR DELETE TO authenticated
  USING (
    organisation_id = (SELECT public.get_user_organisation_id())
    AND (SELECT public.auth_org_role()) = 'Admin'
  );

-- ============================================================================
-- org_user
-- ============================================================================
DROP POLICY IF EXISTS "org_user_rls" ON public.org_user;
DROP POLICY IF EXISTS org_user_all ON public.org_user;

CREATE POLICY org_user_select ON public.org_user
  FOR SELECT TO authenticated
  USING (
    organisation_id = (SELECT public.get_user_organisation_id())
    OR user_id = (SELECT auth.uid())
  );

-- ============================================================================
-- trip / trip_member / trip_species
-- ============================================================================
DROP POLICY IF EXISTS "trip_rls" ON public.trip;
DROP POLICY IF EXISTS "trip_member_rls" ON public.trip_member;
DROP POLICY IF EXISTS "trip_species_rls" ON public.trip_species;

CREATE POLICY trip_all ON public.trip
  FOR ALL TO authenticated
  USING (organisation_id = (SELECT public.get_user_organisation_id()))
  WITH CHECK (organisation_id = (SELECT public.get_user_organisation_id()));

CREATE POLICY trip_member_all ON public.trip_member
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.trip t
    WHERE t.id = trip_member.trip_id
      AND t.organisation_id = (SELECT public.get_user_organisation_id())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.trip t
    WHERE t.id = trip_member.trip_id
      AND t.organisation_id = (SELECT public.get_user_organisation_id())
  ));

CREATE POLICY trip_species_all ON public.trip_species
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.trip t
    WHERE t.id = trip_species.trip_id
      AND t.organisation_id = (SELECT public.get_user_organisation_id())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.trip t
    WHERE t.id = trip_species.trip_id
      AND t.organisation_id = (SELECT public.get_user_organisation_id())
  ));

-- ============================================================================
-- batches  (drop overlapping batch_select_policy; keep broader policy)
-- ============================================================================
DROP POLICY IF EXISTS batch_select_policy ON public.batches;
DROP POLICY IF EXISTS org_members_can_select_batches ON public.batches;
DROP POLICY IF EXISTS current_custodian_can_update_batches ON public.batches;
DROP POLICY IF EXISTS current_custodian_can_delete_batches ON public.batches;

CREATE POLICY batches_select ON public.batches
  FOR SELECT TO authenticated
  USING (
    public.is_batch_custodian_or_past((SELECT auth.uid()), id)
    OR EXISTS (
      SELECT 1 FROM public.batch_testing_assignment bta
      WHERE bta.batch_id = batches.id
        AND public.is_org_member((SELECT auth.uid()), bta.assigned_by_org_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.batch_testing_assignment bta
      WHERE bta.batch_id = batches.id
        AND public.is_org_member((SELECT auth.uid()), bta.assigned_to_org_id)
    )
  );

CREATE POLICY batches_update ON public.batches
  FOR UPDATE TO authenticated
  USING (public.is_current_custodian((SELECT auth.uid()), id));

-- Deleting a batch cascades through its bags and, from 20260804000001, through
-- the assignments that name them. An assignment is a physical fact about seed
-- in someone else's hands, so the rule is rejection: while any bag of the batch
-- is held by another organisation, the batch cannot be deleted at all. Nothing
-- here auto-closes an assignment or moves it to a successor.
CREATE POLICY batches_delete ON public.batches
  FOR DELETE TO authenticated
  USING (
    public.is_current_custodian((SELECT auth.uid()), id)
    AND NOT public.batch_has_externally_held_bags(id)
  );

-- ============================================================================
-- batch_custody
-- ============================================================================
DROP POLICY IF EXISTS custody_select_custodian ON public.batch_custody;
DROP POLICY IF EXISTS custody_update_custodian ON public.batch_custody;
DROP POLICY IF EXISTS custody_delete_custodian ON public.batch_custody;

CREATE POLICY batch_custody_select ON public.batch_custody
  FOR SELECT TO authenticated
  USING (public.is_current_custodian((SELECT auth.uid()), batch_id));

CREATE POLICY batch_custody_update ON public.batch_custody
  FOR UPDATE TO authenticated
  USING (public.is_current_custodian((SELECT auth.uid()), batch_id))
  WITH CHECK (public.is_current_custodian((SELECT auth.uid()), batch_id));

CREATE POLICY batch_custody_delete ON public.batch_custody
  FOR DELETE TO authenticated
  USING (public.is_current_custodian((SELECT auth.uid()), batch_id));

-- ============================================================================
-- batch_splits
-- ============================================================================
DROP POLICY IF EXISTS splits_select_custodian ON public.batch_splits;
DROP POLICY IF EXISTS splits_update_custodian ON public.batch_splits;
DROP POLICY IF EXISTS splits_delete_custodian ON public.batch_splits;

CREATE POLICY batch_splits_select ON public.batch_splits
  FOR SELECT TO authenticated
  USING (public.is_current_custodian((SELECT auth.uid()), parent_batch_id));

CREATE POLICY batch_splits_update ON public.batch_splits
  FOR UPDATE TO authenticated
  USING (public.is_current_custodian((SELECT auth.uid()), parent_batch_id))
  WITH CHECK (public.is_current_custodian((SELECT auth.uid()), parent_batch_id));

CREATE POLICY batch_splits_delete ON public.batch_splits
  FOR DELETE TO authenticated
  USING (public.is_current_custodian((SELECT auth.uid()), parent_batch_id));

-- ============================================================================
-- batch_merges
-- ============================================================================
DROP POLICY IF EXISTS merges_select_custodian ON public.batch_merges;
DROP POLICY IF EXISTS merges_update_custodian ON public.batch_merges;
DROP POLICY IF EXISTS merges_delete_custodian ON public.batch_merges;

CREATE POLICY batch_merges_select ON public.batch_merges
  FOR SELECT TO authenticated
  USING (public.is_current_custodian((SELECT auth.uid()), merged_batch_id));

CREATE POLICY batch_merges_update ON public.batch_merges
  FOR UPDATE TO authenticated
  USING (public.is_current_custodian((SELECT auth.uid()), merged_batch_id))
  WITH CHECK (public.is_current_custodian((SELECT auth.uid()), merged_batch_id));

CREATE POLICY batch_merges_delete ON public.batch_merges
  FOR DELETE TO authenticated
  USING (public.is_current_custodian((SELECT auth.uid()), merged_batch_id));

-- ============================================================================
-- treatments
-- ============================================================================
-- Treating is no longer a supported workflow, so this table is historical: it
-- keeps resolving for batch_lineage, batch_history and quality_test_statistics,
-- and no new rows are ever written. Read access only — fn_treat_batch is gone,
-- and without this a FOR ALL policy would leave any authenticated user able to
-- fabricate lineage by inserting directly.
DROP POLICY IF EXISTS custodian_can_access_treatments ON public.treatments;
DROP POLICY IF EXISTS treatments_all ON public.treatments;

CREATE POLICY treatments_select ON public.treatments
  FOR SELECT TO authenticated
  USING (public.is_current_custodian((SELECT auth.uid()), input_batch_id));

-- ============================================================================
-- batch_storage
-- ============================================================================
DROP POLICY IF EXISTS custodian_can_view_batch_storage ON public.batch_storage;
DROP POLICY IF EXISTS custodian_can_insert_batch_storage ON public.batch_storage;
DROP POLICY IF EXISTS custodian_can_update_batch_storage ON public.batch_storage;

-- Storage describes where a bag physically is, so it follows the bag and not
-- the parent batch. Keying on batch_id would let an owner shelve or move a bag
-- a Testing organisation is holding.
CREATE POLICY batch_storage_select ON public.batch_storage
  FOR SELECT TO authenticated
  USING (public.can_read_sub_batch(sub_batch_id));

CREATE POLICY batch_storage_insert ON public.batch_storage
  FOR INSERT TO authenticated
  WITH CHECK (public.is_current_bag_custodian((SELECT auth.uid()), sub_batch_id));

CREATE POLICY batch_storage_update ON public.batch_storage
  FOR UPDATE TO authenticated
  USING (public.is_current_bag_custodian((SELECT auth.uid()), sub_batch_id))
  WITH CHECK (public.is_current_bag_custodian((SELECT auth.uid()), sub_batch_id));

-- ============================================================================
-- organisation
-- ============================================================================
DROP POLICY IF EXISTS organisation_select_policy ON public.organisation;
DROP POLICY IF EXISTS organisation_update_policy ON public.organisation;

CREATE POLICY organisation_select ON public.organisation
  FOR SELECT TO authenticated
  USING (
    id = (SELECT public.get_user_organisation_id())
    OR is_testing_provider
    OR EXISTS (
      SELECT 1
      FROM public.organisation_link ol
      INNER JOIN public.org_user ou ON ou.organisation_id = ol.provider_org_id
      WHERE ol.requesting_org_id = organisation.id
        AND ou.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY organisation_update ON public.organisation
  FOR UPDATE TO authenticated
  USING (
    id = (SELECT public.get_user_organisation_id())
    AND (SELECT public.auth_org_role()) = 'Admin'
  )
  WITH CHECK (
    id = (SELECT public.get_user_organisation_id())
    AND (SELECT public.auth_org_role()) = 'Admin'
  );

-- ============================================================================
-- organisation_link  (merge view policies into one combined SELECT)
-- ============================================================================
DROP POLICY IF EXISTS general_org_can_view_links ON public.organisation_link;
DROP POLICY IF EXISTS testing_org_can_view_links ON public.organisation_link;
DROP POLICY IF EXISTS testing_org_can_insert_links ON public.organisation_link;
DROP POLICY IF EXISTS general_org_can_delete_links ON public.organisation_link;
DROP POLICY IF EXISTS general_org_can_update_links ON public.organisation_link;

CREATE POLICY organisation_link_select ON public.organisation_link
  FOR SELECT TO authenticated
  USING (
    public.is_org_member((SELECT auth.uid()), requesting_org_id)
    OR public.is_org_member((SELECT auth.uid()), provider_org_id)
  );

CREATE POLICY organisation_link_insert ON public.organisation_link
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member((SELECT auth.uid()), provider_org_id)
    AND (SELECT public.auth_org_role()) = 'Admin'
  );

CREATE POLICY organisation_link_update ON public.organisation_link
  FOR UPDATE TO authenticated
  USING (
    public.is_org_member((SELECT auth.uid()), requesting_org_id)
    AND (SELECT public.auth_org_role()) = 'Admin'
  )
  WITH CHECK (
    public.is_org_member((SELECT auth.uid()), requesting_org_id)
    AND (SELECT public.auth_org_role()) = 'Admin'
  );

CREATE POLICY organisation_link_delete ON public.organisation_link
  FOR DELETE TO authenticated
  USING (
    public.is_org_member((SELECT auth.uid()), requesting_org_id)
    AND (SELECT public.auth_org_role()) = 'Admin'
  );

-- ============================================================================
-- organisation_link_request  (merge view policies into one combined SELECT)
-- ============================================================================
DROP POLICY IF EXISTS general_org_can_view_requests ON public.organisation_link_request;
DROP POLICY IF EXISTS testing_org_can_view_requests ON public.organisation_link_request;
DROP POLICY IF EXISTS general_org_can_insert_requests ON public.organisation_link_request;
DROP POLICY IF EXISTS general_org_can_delete_requests ON public.organisation_link_request;
DROP POLICY IF EXISTS testing_org_can_update_requests ON public.organisation_link_request;

CREATE POLICY organisation_link_request_select ON public.organisation_link_request
  FOR SELECT TO authenticated
  USING (
    public.is_org_member((SELECT auth.uid()), requesting_org_id)
    OR public.is_org_member((SELECT auth.uid()), provider_org_id)
  );

CREATE POLICY organisation_link_request_insert ON public.organisation_link_request
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member((SELECT auth.uid()), requesting_org_id)
    AND (SELECT public.auth_org_role()) = 'Admin'
  );

CREATE POLICY organisation_link_request_update ON public.organisation_link_request
  FOR UPDATE TO authenticated
  USING (
    public.is_org_member((SELECT auth.uid()), provider_org_id)
    AND (SELECT public.auth_org_role()) = 'Admin'
  )
  WITH CHECK (
    public.is_org_member((SELECT auth.uid()), provider_org_id)
    AND (SELECT public.auth_org_role()) = 'Admin'
  );

CREATE POLICY organisation_link_request_delete ON public.organisation_link_request
  FOR DELETE TO authenticated
  USING (
    public.is_org_member((SELECT auth.uid()), requesting_org_id)
    AND (SELECT public.auth_org_role()) = 'Admin'
  );

-- ============================================================================
-- batch_testing_assignment  (merge view policies into one combined SELECT)
-- ============================================================================
DROP POLICY IF EXISTS general_org_can_view_assignments ON public.batch_testing_assignment;
DROP POLICY IF EXISTS testing_org_can_view_assignments ON public.batch_testing_assignment;
DROP POLICY IF EXISTS general_org_can_insert_assignments ON public.batch_testing_assignment;
DROP POLICY IF EXISTS testing_org_can_update_assignments ON public.batch_testing_assignment;
DROP POLICY IF EXISTS general_org_can_delete_assignments ON public.batch_testing_assignment;

CREATE POLICY batch_testing_assignment_select ON public.batch_testing_assignment
  FOR SELECT TO authenticated
  USING (
    public.is_org_member((SELECT auth.uid()), assigned_by_org_id)
    OR public.is_org_member((SELECT auth.uid()), assigned_to_org_id)
  );

CREATE POLICY batch_testing_assignment_insert ON public.batch_testing_assignment
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member((SELECT auth.uid()), assigned_by_org_id)
    AND (SELECT public.auth_org_role()) = 'Admin'
  );

CREATE POLICY batch_testing_assignment_update ON public.batch_testing_assignment
  FOR UPDATE TO authenticated
  USING (
    public.is_org_member((SELECT auth.uid()), assigned_to_org_id)
    AND (SELECT public.auth_org_role()) = 'Admin'
  )
  WITH CHECK (
    public.is_org_member((SELECT auth.uid()), assigned_to_org_id)
    AND (SELECT public.auth_org_role()) = 'Admin'
  );

CREATE POLICY batch_testing_assignment_delete ON public.batch_testing_assignment
  FOR DELETE TO authenticated
  USING (
    public.is_org_member((SELECT auth.uid()), assigned_by_org_id)
    AND (SELECT public.auth_org_role()) = 'Admin'
    AND completed_at IS NULL
  );

-- ============================================================================
-- tests
-- ============================================================================
DROP POLICY IF EXISTS org_members_can_view_tests ON public.tests;
DROP POLICY IF EXISTS org_members_can_insert_tests ON public.tests;
DROP POLICY IF EXISTS org_members_can_update_tests ON public.tests;
DROP POLICY IF EXISTS org_members_can_delete_tests ON public.tests;

CREATE POLICY tests_select ON public.tests
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.current_batch_custody cbc
      WHERE cbc.batch_id = tests.batch_id
        AND cbc.organisation_id = (SELECT public.get_user_organisation_id())
    )
    OR (
      performed_by_organisation_id IS NOT NULL
      AND performed_by_organisation_id = (SELECT public.get_user_organisation_id())
    )
  );

-- No INSERT policy, deliberately. The old one authorised any sub-batch in a
-- batch with an active assignment, which is the sibling leak in write form: a
-- Testing organisation could record a test against a bag it had never been
-- sent. fn_create_quality_test is SECURITY DEFINER and is the only intended
-- writer. If a direct path is ever needed it must be scoped to
-- is_current_bag_custodian on tests.sub_batch_id, never to the parent batch.

CREATE POLICY tests_update ON public.tests
  FOR UPDATE TO authenticated
  USING (
    performed_by_organisation_id IS NOT NULL
    AND performed_by_organisation_id = (SELECT public.get_user_organisation_id())
  )
  WITH CHECK (
    performed_by_organisation_id IS NOT NULL
    AND performed_by_organisation_id = (SELECT public.get_user_organisation_id())
  );

CREATE POLICY tests_delete ON public.tests
  FOR DELETE TO authenticated
  USING (
    performed_by_organisation_id IS NOT NULL
    AND performed_by_organisation_id = (SELECT public.get_user_organisation_id())
  );

-- ============================================================================
-- species  (drop legacy duplicate species_select_policy)
-- ============================================================================
DROP POLICY IF EXISTS species_select_policy ON public.species;
DROP POLICY IF EXISTS "Allow authenticated users to select species for their organisation" ON public.species;
DROP POLICY IF EXISTS "Allow authenticated users to insert species for their organisation" ON public.species;
DROP POLICY IF EXISTS "Allow authenticated users to update species for their organisation" ON public.species;
DROP POLICY IF EXISTS "Allow authenticated users to delete species for their organisation" ON public.species;

CREATE POLICY species_select ON public.species
  FOR SELECT TO authenticated
  USING (organisation_id = (SELECT public.get_user_organisation_id()));

CREATE POLICY species_insert ON public.species
  FOR INSERT TO authenticated
  WITH CHECK (organisation_id = (SELECT public.get_user_organisation_id()));

CREATE POLICY species_update ON public.species
  FOR UPDATE TO authenticated
  USING (organisation_id = (SELECT public.get_user_organisation_id()))
  WITH CHECK (organisation_id = (SELECT public.get_user_organisation_id()));

CREATE POLICY species_delete ON public.species
  FOR DELETE TO authenticated
  USING (organisation_id = (SELECT public.get_user_organisation_id()));

-- ============================================================================
-- species_photo
-- ============================================================================
DROP POLICY IF EXISTS "Allow authenticated users to select species photos for their organisation" ON public.species_photo;
DROP POLICY IF EXISTS "Allow authenticated users to insert species photos for their organisation" ON public.species_photo;
DROP POLICY IF EXISTS "Allow authenticated users to update species photos for their organisation" ON public.species_photo;
DROP POLICY IF EXISTS "Allow authenticated users to delete species photos for their organisation" ON public.species_photo;

CREATE POLICY species_photo_select ON public.species_photo
  FOR SELECT TO authenticated
  USING (organisation_id = (SELECT public.get_user_organisation_id()));

CREATE POLICY species_photo_insert ON public.species_photo
  FOR INSERT TO authenticated
  WITH CHECK (organisation_id = (SELECT public.get_user_organisation_id()));

CREATE POLICY species_photo_update ON public.species_photo
  FOR UPDATE TO authenticated
  USING (organisation_id = (SELECT public.get_user_organisation_id()))
  WITH CHECK (organisation_id = (SELECT public.get_user_organisation_id()));

CREATE POLICY species_photo_delete ON public.species_photo
  FOR DELETE TO authenticated
  USING (organisation_id = (SELECT public.get_user_organisation_id()));

-- ============================================================================
-- scouting_notes
-- ============================================================================
DROP POLICY IF EXISTS "Allow authenticated users to select scouting_notess for their organisation" ON public.scouting_notes;
DROP POLICY IF EXISTS "Allow authenticated users to insert scouting_notess for their organisation" ON public.scouting_notes;
DROP POLICY IF EXISTS "Allow authenticated users to update their own scouting_notess or admin to update any" ON public.scouting_notes;
DROP POLICY IF EXISTS "Allow authenticated users to delete their own scouting_notess or admin to delete any that belong to the organisation" ON public.scouting_notes;

CREATE POLICY scouting_notes_select ON public.scouting_notes
  FOR SELECT TO authenticated
  USING (organisation_id = (SELECT public.get_user_organisation_id()));

CREATE POLICY scouting_notes_insert ON public.scouting_notes
  FOR INSERT TO authenticated
  WITH CHECK (organisation_id = (SELECT public.get_user_organisation_id()));

CREATE POLICY scouting_notes_update ON public.scouting_notes
  FOR UPDATE TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    OR (SELECT public.auth_org_role()) = 'Admin'
  )
  WITH CHECK (organisation_id = (SELECT public.get_user_organisation_id()));

CREATE POLICY scouting_notes_delete ON public.scouting_notes
  FOR DELETE TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    OR (
      (SELECT public.auth_org_role()) = 'Admin'
      AND organisation_id = (SELECT public.get_user_organisation_id())
    )
  );

-- ============================================================================
-- scouting_notes_photos
-- ============================================================================
DROP POLICY IF EXISTS "Allow authenticated users to select their scouting_notes photos" ON public.scouting_notes_photos;
DROP POLICY IF EXISTS "Allow authenticated users to insert scouting_notes photos" ON public.scouting_notes_photos;
DROP POLICY IF EXISTS "Allow authenticated users to update their own scouting_notes photos or admin to update any that belong to the organisation" ON public.scouting_notes_photos;
DROP POLICY IF EXISTS "Allow authenticated users to delete their own scouting_notes photos or admin to delete any that belong to the organisation" ON public.scouting_notes_photos;

CREATE POLICY scouting_notes_photos_select ON public.scouting_notes_photos
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.scouting_notes sn
    JOIN public.trip t ON sn.trip_id = t.id
    WHERE sn.id = scouting_notes_photos.scouting_notes_id
      AND t.organisation_id = (SELECT public.get_user_organisation_id())
  ));

CREATE POLICY scouting_notes_photos_insert ON public.scouting_notes_photos
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.scouting_notes sn
    JOIN public.trip t ON sn.trip_id = t.id
    WHERE sn.id = scouting_notes_photos.scouting_notes_id
      AND t.organisation_id = (SELECT public.get_user_organisation_id())
  ));

CREATE POLICY scouting_notes_photos_update ON public.scouting_notes_photos
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.scouting_notes sn
      WHERE sn.id = scouting_notes_photos.scouting_notes_id
        AND sn.created_by = (SELECT auth.uid())
    )
    OR (SELECT public.auth_org_role()) = 'Admin'
  )
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.scouting_notes sn
    JOIN public.trip t ON sn.trip_id = t.id
    WHERE sn.id = scouting_notes_photos.scouting_notes_id
      AND t.organisation_id = (SELECT public.get_user_organisation_id())
  ));

CREATE POLICY scouting_notes_photos_delete ON public.scouting_notes_photos
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.scouting_notes sn
      WHERE sn.id = scouting_notes_photos.scouting_notes_id
        AND sn.created_by = (SELECT auth.uid())
    )
    OR (
      (SELECT public.auth_org_role()) = 'Admin'
      AND EXISTS (
        SELECT 1 FROM public.scouting_notes sn
        JOIN public.trip t ON sn.trip_id = t.id
        WHERE sn.id = scouting_notes_photos.scouting_notes_id
          AND t.organisation_id = (SELECT public.get_user_organisation_id())
      )
    )
  );

-- ============================================================================
-- storage_locations
-- ============================================================================
DROP POLICY IF EXISTS storage_locations_select_policy ON public.storage_locations;
DROP POLICY IF EXISTS storage_locations_insert_policy ON public.storage_locations;

CREATE POLICY storage_locations_select ON public.storage_locations
  FOR SELECT TO authenticated
  USING (organisation_id = (SELECT public.get_user_organisation_id()));

CREATE POLICY storage_locations_insert ON public.storage_locations
  FOR INSERT TO authenticated
  WITH CHECK (
    organisation_id = (SELECT public.get_user_organisation_id())
    AND (SELECT public.auth_org_role()) = 'Admin'
  );

-- ============================================================================
-- sub_batches
-- ============================================================================
DROP POLICY IF EXISTS sub_batches_select_policy ON public.sub_batches;
DROP POLICY IF EXISTS sub_batches_insert_policy ON public.sub_batches;
DROP POLICY IF EXISTS sub_batches_update_policy ON public.sub_batches;
DROP POLICY IF EXISTS sub_batches_delete_policy ON public.sub_batches;

-- Every one of these is keyed on the bag, not the parent. The batch-grained
-- version showed a Testing organisation every sibling bag of the batch its one
-- bag came from, and let the owner mutate or delete a bag it no longer held.
-- Reads use can_read_sub_batch so the sender keeps sight of a bag while it is
-- out at a lab; writes use the stricter holder-only gate.
CREATE POLICY sub_batches_select ON public.sub_batches
  FOR SELECT TO authenticated
  USING (public.can_read_sub_batch(id));

-- The INSERT and UPDATE checks read held_by_org_id off the candidate row
-- rather than calling is_current_bag_custodian(…, id): a WITH CHECK runs
-- before the row is visible to a lookup by id, so the predicate would see
-- nothing and deny every insert. The BEFORE INSERT trigger from 20260723000001
-- has already defaulted the column by this point, so the check is meaningful.
CREATE POLICY sub_batches_insert ON public.sub_batches
  FOR INSERT TO authenticated
  WITH CHECK (held_by_org_id = (SELECT public.get_user_organisation_id()));

-- USING gates on who holds the bag now; WITH CHECK stops a holder handing it
-- to another organisation. Between them and the column-level UPDATE revoke,
-- custody cannot move except through the reviewed RPCs.
CREATE POLICY sub_batches_update ON public.sub_batches
  FOR UPDATE TO authenticated
  USING (public.is_current_bag_custodian((SELECT auth.uid()), id))
  WITH CHECK (held_by_org_id = (SELECT public.get_user_organisation_id()));

CREATE POLICY sub_batches_delete ON public.sub_batches
  FOR DELETE TO authenticated
  USING (public.is_current_bag_custodian((SELECT auth.uid()), id));

-- ============================================================================
-- batch_weight_adjustments
-- ============================================================================
DROP POLICY IF EXISTS custodian_can_view_adjustments ON public.batch_weight_adjustments;
DROP POLICY IF EXISTS custodian_can_insert_adjustments ON public.batch_weight_adjustments;

-- The read side is load-bearing for correctness, not only for access:
-- sub_batch_current_weight is security_invoker, so an organisation that cannot
-- read a bag's adjustments reads its *original* weight where the UI and the
-- quality-test form both expect its current one. A Testing organisation must
-- therefore be able to see the adjustments on the bag it holds.
CREATE POLICY batch_weight_adjustments_select ON public.batch_weight_adjustments
  FOR SELECT TO authenticated
  USING (public.can_read_sub_batch(sub_batch_id));

-- Writing an adjustment is consuming seed. Only the holder may do it —
-- otherwise the owner of the parent batch could zero a bag sitting in a lab.
CREATE POLICY batch_weight_adjustments_insert ON public.batch_weight_adjustments
  FOR INSERT TO authenticated
  WITH CHECK (public.is_current_bag_custodian((SELECT auth.uid()), sub_batch_id));

-- ============================================================================
-- batch_cleaning / batch_cleaning_output
-- ============================================================================
DROP POLICY IF EXISTS batch_cleaning_select_policy ON public.batch_cleaning;
DROP POLICY IF EXISTS batch_cleaning_insert_policy ON public.batch_cleaning;
DROP POLICY IF EXISTS batch_cleaning_output_select_policy ON public.batch_cleaning_output;
DROP POLICY IF EXISTS batch_cleaning_output_insert_policy ON public.batch_cleaning_output;

CREATE POLICY batch_cleaning_select ON public.batch_cleaning
  FOR SELECT TO authenticated
  USING (organisation_id = (SELECT public.get_user_organisation_id()));

CREATE POLICY batch_cleaning_insert ON public.batch_cleaning
  FOR INSERT TO authenticated
  WITH CHECK (organisation_id = (SELECT public.get_user_organisation_id()));

CREATE POLICY batch_cleaning_output_select ON public.batch_cleaning_output
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.batch_cleaning bc
    WHERE bc.id = batch_cleaning_output.cleaning_id
      AND bc.organisation_id = (SELECT public.get_user_organisation_id())
  ));

CREATE POLICY batch_cleaning_output_insert ON public.batch_cleaning_output
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.batch_cleaning bc
    WHERE bc.id = batch_cleaning_output.cleaning_id
      AND bc.organisation_id = (SELECT public.get_user_organisation_id())
  ));

-- ============================================================================
-- ibra_regions  (drop the redundant FOR ALL "deny" policy — REVOKE on the
-- table already prevents writes; the policy was firing on SELECT too)
-- ============================================================================
DROP POLICY IF EXISTS "Deny all write operations on ibra_regions" ON public.ibra_regions;
