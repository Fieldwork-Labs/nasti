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
-- collection
-- ============================================================================
DROP POLICY IF EXISTS "collection_rls" ON public.collection;
DROP POLICY IF EXISTS "Allow authenticated users to select collections for their organisation" ON public.collection;
DROP POLICY IF EXISTS "Allow authenticated users to insert collections for their organisation" ON public.collection;
DROP POLICY IF EXISTS "Allow authenticated users to update their own collections or admin to update any" ON public.collection;
DROP POLICY IF EXISTS "Allow authenticated users to delete their own collections or admin to delete any that belong to the organisation" ON public.collection;
DROP POLICY IF EXISTS "collection_select_policy" ON public.collection;

CREATE POLICY collection_select ON public.collection
  FOR SELECT TO authenticated
  USING (
    organisation_id = (SELECT public.get_user_organisation_id())
    OR EXISTS (
      SELECT 1
      FROM public.batch_testing_assignment bta
      INNER JOIN public.batches b ON b.id = bta.batch_id
      INNER JOIN public.org_user ou ON ou.organisation_id = bta.assigned_to_org_id
      WHERE b.collection_id = collection.id
        AND bta.returned_at IS NULL
        AND ou.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY collection_insert ON public.collection
  FOR INSERT TO authenticated
  WITH CHECK (organisation_id = (SELECT public.get_user_organisation_id()));

CREATE POLICY collection_update ON public.collection
  FOR UPDATE TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    OR (SELECT public.auth_org_role()) = 'Admin'
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
  ));

CREATE POLICY collection_photo_delete ON public.collection_photo
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.collection c
    WHERE c.id = collection_photo.collection_id
      AND c.organisation_id = (SELECT public.get_user_organisation_id())
  ));

-- ============================================================================
-- invitation
-- ============================================================================
DROP POLICY IF EXISTS "invitation_rls" ON public.invitation;

CREATE POLICY invitation_all ON public.invitation
  FOR ALL TO authenticated
  USING (organisation_id = (SELECT public.get_user_organisation_id()))
  WITH CHECK (organisation_id = (SELECT public.get_user_organisation_id()));

-- ============================================================================
-- org_user
-- ============================================================================
DROP POLICY IF EXISTS "org_user_rls" ON public.org_user;

CREATE POLICY org_user_all ON public.org_user
  FOR ALL TO authenticated
  USING (
    organisation_id = (SELECT public.get_user_organisation_id())
    OR user_id = (SELECT auth.uid())
  )
  WITH CHECK (
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

CREATE POLICY batches_delete ON public.batches
  FOR DELETE TO authenticated
  USING (public.is_current_custodian((SELECT auth.uid()), id));

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
DROP POLICY IF EXISTS custodian_can_access_treatments ON public.treatments;

CREATE POLICY treatments_all ON public.treatments
  FOR ALL TO authenticated
  USING (public.is_current_custodian((SELECT auth.uid()), input_batch_id))
  WITH CHECK (public.is_current_custodian((SELECT auth.uid()), input_batch_id));

-- ============================================================================
-- batch_storage
-- ============================================================================
DROP POLICY IF EXISTS custodian_can_view_batch_storage ON public.batch_storage;
DROP POLICY IF EXISTS custodian_can_insert_batch_storage ON public.batch_storage;
DROP POLICY IF EXISTS custodian_can_update_batch_storage ON public.batch_storage;

CREATE POLICY batch_storage_select ON public.batch_storage
  FOR SELECT TO authenticated
  USING (public.is_current_custodian((SELECT auth.uid()), batch_id));

CREATE POLICY batch_storage_insert ON public.batch_storage
  FOR INSERT TO authenticated
  WITH CHECK (public.is_current_custodian((SELECT auth.uid()), batch_id));

CREATE POLICY batch_storage_update ON public.batch_storage
  FOR UPDATE TO authenticated
  USING (public.is_current_custodian((SELECT auth.uid()), batch_id));

-- ============================================================================
-- organisation
-- ============================================================================
DROP POLICY IF EXISTS organisation_select_policy ON public.organisation;
DROP POLICY IF EXISTS organisation_update_policy ON public.organisation;

CREATE POLICY organisation_select ON public.organisation
  FOR SELECT TO authenticated
  USING (
    id = (SELECT public.get_user_organisation_id())
    OR type = 'Testing'
    OR EXISTS (
      SELECT 1
      FROM public.organisation_link ol
      INNER JOIN public.org_user ou ON ou.organisation_id = ol.testing_org_id
      WHERE ol.general_org_id = organisation.id
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
    public.is_org_member((SELECT auth.uid()), general_org_id)
    OR public.is_org_member((SELECT auth.uid()), testing_org_id)
  );

CREATE POLICY organisation_link_insert ON public.organisation_link
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member((SELECT auth.uid()), testing_org_id)
    AND (SELECT public.auth_org_role()) = 'Admin'
  );

CREATE POLICY organisation_link_update ON public.organisation_link
  FOR UPDATE TO authenticated
  USING (
    public.is_org_member((SELECT auth.uid()), general_org_id)
    AND (SELECT public.auth_org_role()) = 'Admin'
  )
  WITH CHECK (
    public.is_org_member((SELECT auth.uid()), general_org_id)
    AND (SELECT public.auth_org_role()) = 'Admin'
  );

CREATE POLICY organisation_link_delete ON public.organisation_link
  FOR DELETE TO authenticated
  USING (
    public.is_org_member((SELECT auth.uid()), general_org_id)
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
    public.is_org_member((SELECT auth.uid()), general_org_id)
    OR public.is_org_member((SELECT auth.uid()), testing_org_id)
  );

CREATE POLICY organisation_link_request_insert ON public.organisation_link_request
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member((SELECT auth.uid()), general_org_id)
    AND (SELECT public.auth_org_role()) = 'Admin'
  );

CREATE POLICY organisation_link_request_update ON public.organisation_link_request
  FOR UPDATE TO authenticated
  USING (
    public.is_org_member((SELECT auth.uid()), testing_org_id)
    AND (SELECT public.auth_org_role()) = 'Admin'
  )
  WITH CHECK (
    public.is_org_member((SELECT auth.uid()), testing_org_id)
    AND (SELECT public.auth_org_role()) = 'Admin'
  );

CREATE POLICY organisation_link_request_delete ON public.organisation_link_request
  FOR DELETE TO authenticated
  USING (
    public.is_org_member((SELECT auth.uid()), general_org_id)
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

CREATE POLICY tests_insert ON public.tests
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.current_batch_custody cbc
      WHERE cbc.batch_id = tests.batch_id
        AND cbc.organisation_id = (SELECT public.get_user_organisation_id())
    )
    OR EXISTS (
      SELECT 1 FROM public.batch_testing_assignment bta
      WHERE bta.batch_id = tests.batch_id
        AND bta.returned_at IS NULL
        AND bta.assigned_to_org_id = (SELECT public.get_user_organisation_id())
    )
  );

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

CREATE POLICY sub_batches_select ON public.sub_batches
  FOR SELECT TO authenticated
  USING (public.is_current_custodian((SELECT auth.uid()), batch_id));

CREATE POLICY sub_batches_insert ON public.sub_batches
  FOR INSERT TO authenticated
  WITH CHECK (public.is_current_custodian((SELECT auth.uid()), batch_id));

CREATE POLICY sub_batches_update ON public.sub_batches
  FOR UPDATE TO authenticated
  USING (public.is_current_custodian((SELECT auth.uid()), batch_id));

CREATE POLICY sub_batches_delete ON public.sub_batches
  FOR DELETE TO authenticated
  USING (public.is_current_custodian((SELECT auth.uid()), batch_id));

-- ============================================================================
-- batch_weight_adjustments
-- ============================================================================
DROP POLICY IF EXISTS custodian_can_view_adjustments ON public.batch_weight_adjustments;
DROP POLICY IF EXISTS custodian_can_insert_adjustments ON public.batch_weight_adjustments;

CREATE POLICY batch_weight_adjustments_select ON public.batch_weight_adjustments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sub_batches sb
    WHERE sb.id = batch_weight_adjustments.sub_batch_id
      AND public.is_current_custodian((SELECT auth.uid()), sb.batch_id)
  ));

CREATE POLICY batch_weight_adjustments_insert ON public.batch_weight_adjustments
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sub_batches sb
    WHERE sb.id = batch_weight_adjustments.sub_batch_id
      AND public.is_current_custodian((SELECT auth.uid()), sb.batch_id)
  ));

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
