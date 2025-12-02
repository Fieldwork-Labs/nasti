-- Migration: Phase 2 - RLS Policies for Testing Organisations
-- Implements row-level security for organisation links, link requests, and batch testing assignments

-- =====================================================
-- HELPER FUNCTION: Check if organisations are linked
-- =====================================================
CREATE OR REPLACE FUNCTION is_linked_testing_org(p_general_org_id UUID, p_testing_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organisation_link
    WHERE general_org_id = p_general_org_id
      AND testing_org_id = p_testing_org_id
  );
$$;

COMMENT ON FUNCTION is_linked_testing_org IS 'Check if two organisations have an accepted link';


-- =====================================================
-- RLS POLICIES: organisation_link
-- =====================================================
ALTER TABLE "public"."organisation_link" ENABLE ROW LEVEL SECURITY;

-- General orgs can view their own links
CREATE POLICY general_org_can_view_links ON organisation_link
  FOR SELECT
  USING (
    is_org_member(auth.uid(), general_org_id)
  );

-- Testing orgs can view links pointing to them (read-only)
CREATE POLICY testing_org_can_view_links ON organisation_link
  FOR SELECT
  USING (
    is_org_member(auth.uid(), testing_org_id)
  );

-- Testing org admins can create links (typically from accepting a request)
CREATE POLICY testing_org_can_insert_links ON organisation_link
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM org_user
      WHERE org_user.user_id = auth.uid()
        AND org_user.organisation_id = testing_org_id
        AND org_user.role = 'Admin'
    )
  );

-- General org admins can delete their links
CREATE POLICY general_org_can_delete_links ON organisation_link
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM org_user
      WHERE org_user.user_id = auth.uid()
        AND org_user.organisation_id = general_org_id
        AND org_user.role = 'Admin'
    )
  );

-- General org admins can update their links (change permissions)
CREATE POLICY general_org_can_update_links ON organisation_link
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM org_user
      WHERE org_user.user_id = auth.uid()
        AND org_user.organisation_id = general_org_id
        AND org_user.role = 'Admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM org_user
      WHERE org_user.user_id = auth.uid()
        AND org_user.organisation_id = general_org_id
        AND org_user.role = 'Admin'
    )
  );


-- =====================================================
-- RLS POLICIES: organisation_link_request
-- =====================================================
ALTER TABLE "public"."organisation_link_request" ENABLE ROW LEVEL SECURITY;

-- General orgs can view their outgoing requests
CREATE POLICY general_org_can_view_requests ON organisation_link_request
  FOR SELECT
  USING (
    is_org_member(auth.uid(), general_org_id)
  );

-- Testing orgs can view incoming requests
CREATE POLICY testing_org_can_view_requests ON organisation_link_request
  FOR SELECT
  USING (
    is_org_member(auth.uid(), testing_org_id)
  );

-- General org admins can create requests
CREATE POLICY general_org_can_insert_requests ON organisation_link_request
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM org_user
      WHERE org_user.user_id = auth.uid()
        AND org_user.organisation_id = general_org_id
        AND org_user.role = 'Admin'
    )
  );

-- General org admins can delete/cancel their requests
CREATE POLICY general_org_can_delete_requests ON organisation_link_request
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM org_user
      WHERE org_user.user_id = auth.uid()
        AND org_user.organisation_id = general_org_id
        AND org_user.role = 'Admin'
    )
  );

-- Testing org admins can update requests (accept/reject)
CREATE POLICY testing_org_can_update_requests ON organisation_link_request
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM org_user
      WHERE org_user.user_id = auth.uid()
        AND org_user.organisation_id = testing_org_id
        AND org_user.role = 'Admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM org_user
      WHERE org_user.user_id = auth.uid()
        AND org_user.organisation_id = testing_org_id
        AND org_user.role = 'Admin'
    )
  );


-- =====================================================
-- RLS POLICIES: batch_testing_assignment
-- =====================================================
ALTER TABLE "public"."batch_testing_assignment" ENABLE ROW LEVEL SECURITY;

-- General orgs can view assignments for their batches
CREATE POLICY general_org_can_view_assignments ON batch_testing_assignment
  FOR SELECT
  USING (
    is_org_member(auth.uid(), assigned_by_org_id)
  );

-- Testing orgs can view assignments for batches assigned to them
CREATE POLICY testing_org_can_view_assignments ON batch_testing_assignment
  FOR SELECT
  USING (
    is_org_member(auth.uid(), assigned_to_org_id)
  );

-- General org admins can create assignments for their batches
-- (to linked testing orgs only - enforced in edge function)
CREATE POLICY general_org_can_insert_assignments ON batch_testing_assignment
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM org_user
      WHERE org_user.user_id = auth.uid()
        AND org_user.organisation_id = assigned_by_org_id
        AND org_user.role = 'Admin'
    )
  );

-- Testing org admins can update assignments (mark completed, returned, store subsample)
CREATE POLICY testing_org_can_update_assignments ON batch_testing_assignment
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM org_user
      WHERE org_user.user_id = auth.uid()
        AND org_user.organisation_id = assigned_to_org_id
        AND org_user.role = 'Admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM org_user
      WHERE org_user.user_id = auth.uid()
        AND org_user.organisation_id = assigned_to_org_id
        AND org_user.role = 'Admin'
    )
  );

-- General org admins can delete assignments (cancel before testing)
CREATE POLICY general_org_can_delete_assignments ON batch_testing_assignment
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM org_user
      WHERE org_user.user_id = auth.uid()
        AND org_user.organisation_id = assigned_by_org_id
        AND org_user.role = 'Admin'
    )
    AND completed_at IS NULL -- can only cancel before testing is done
  );


-- =====================================================
-- UPDATE BATCHES RLS: Include linked testing orgs
-- =====================================================

-- Drop existing SELECT policy for batches
DROP POLICY IF EXISTS org_members_can_select_batches ON batches;

-- Recreate with testing org access
-- General orgs: see own batches + batches at linked testing orgs (via assignments)
-- Testing orgs: see batches assigned to them
CREATE POLICY org_members_can_select_batches
  ON batches
  FOR SELECT
  USING (
    -- Original access: member of any custodian org (past or current)
    is_batch_custodian_or_past(auth.uid(), id)
    OR
    -- New: General org members can see batches they've assigned to testing orgs
    EXISTS (
      SELECT 1
      FROM batch_testing_assignment bta
      WHERE bta.batch_id = batches.id
        AND is_org_member(auth.uid(), bta.assigned_by_org_id)
    )
    OR
    -- New: Testing org members can see batches assigned to them
    EXISTS (
      SELECT 1
      FROM batch_testing_assignment bta
      WHERE bta.batch_id = batches.id
        AND is_org_member(auth.uid(), bta.assigned_to_org_id)
    )
  );


-- =====================================================
-- UPDATE TESTS RLS: Include testing organisations
-- =====================================================

-- First, check if tests table has RLS enabled and policies exist
DO $$
BEGIN
  -- Drop existing policies if they exist
  DROP POLICY IF EXISTS org_members_can_view_tests ON tests;
  DROP POLICY IF EXISTS org_members_can_insert_tests ON tests;
  DROP POLICY IF EXISTS org_members_can_update_tests ON tests;
  DROP POLICY IF EXISTS org_members_can_delete_tests ON tests;
END $$;

-- Enable RLS on tests if not already enabled
ALTER TABLE tests ENABLE ROW LEVEL SECURITY;

-- Tests can be viewed by batch owner org (via custody) OR performing org
CREATE POLICY org_members_can_view_tests ON tests
  FOR SELECT
  USING (
    -- User's org owns the batch (via current custody)
    EXISTS (
      SELECT 1
      FROM current_batch_custody cbc
      INNER JOIN org_user ou ON ou.organisation_id = cbc.organisation_id
      WHERE cbc.batch_id = tests.batch_id
        AND ou.user_id = auth.uid()
    )
    OR
    -- User's org performed the test
    (performed_by_organisation_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM org_user ou
       WHERE ou.organisation_id = performed_by_organisation_id
         AND ou.user_id = auth.uid()
     ))
  );

-- Tests can be created by batch owner org OR by testing orgs with assignments
CREATE POLICY org_members_can_insert_tests ON tests
  FOR INSERT
  WITH CHECK (
    -- User's org owns the batch (via current custody)
    EXISTS (
      SELECT 1
      FROM current_batch_custody cbc
      INNER JOIN org_user ou ON ou.organisation_id = cbc.organisation_id
      WHERE cbc.batch_id = tests.batch_id
        AND ou.user_id = auth.uid()
    )
    OR
    -- User's org has an active testing assignment for this batch
    EXISTS (
      SELECT 1
      FROM batch_testing_assignment bta
      INNER JOIN org_user ou ON ou.organisation_id = bta.assigned_to_org_id
      WHERE bta.batch_id = tests.batch_id
        AND bta.returned_at IS NULL
        AND ou.user_id = auth.uid()
    )
  );

-- Tests can be updated by performing org
CREATE POLICY org_members_can_update_tests ON tests
  FOR UPDATE
  USING (
    performed_by_organisation_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM org_user ou
      WHERE ou.organisation_id = performed_by_organisation_id
        AND ou.user_id = auth.uid()
    )
  )
  WITH CHECK (
    performed_by_organisation_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM org_user ou
      WHERE ou.organisation_id = performed_by_organisation_id
        AND ou.user_id = auth.uid()
    )
  );

-- Tests can be deleted by performing org
CREATE POLICY org_members_can_delete_tests ON tests
  FOR DELETE
  USING (
    performed_by_organisation_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM org_user ou
      WHERE ou.organisation_id = performed_by_organisation_id
        AND ou.user_id = auth.uid()
    )
  );

-- Add comments
COMMENT ON POLICY org_members_can_view_tests ON tests IS 'Batch owner org (via custody) and performing org can view tests';
COMMENT ON POLICY org_members_can_insert_tests ON tests IS 'Batch owner org and testing orgs with active assignments can create tests';
COMMENT ON POLICY org_members_can_update_tests ON tests IS 'Only the org that performed the test can update it';
COMMENT ON POLICY org_members_can_delete_tests ON tests IS 'Only the org that performed the test can delete it';

-- Add comments for organisation link policies
COMMENT ON POLICY general_org_can_insert_links ON organisation_link IS 'Only General org admins can create links';
COMMENT ON POLICY general_org_can_delete_links ON organisation_link IS 'Only General org admins can delete their links';
COMMENT ON POLICY general_org_can_update_links ON organisation_link IS 'Only General org admins can update link permissions';

-- Add comments for link request policies
COMMENT ON POLICY general_org_can_insert_requests ON organisation_link_request IS 'Only General org admins can create link requests';
COMMENT ON POLICY general_org_can_delete_requests ON organisation_link_request IS 'Only General org admins can cancel their requests';
COMMENT ON POLICY testing_org_can_update_requests ON organisation_link_request IS 'Only Testing org admins can accept/reject link requests';

-- Add comments for batch assignment policies
COMMENT ON POLICY general_org_can_insert_assignments ON batch_testing_assignment IS 'Only General org admins can assign batches for testing';
COMMENT ON POLICY testing_org_can_update_assignments ON batch_testing_assignment IS 'Only Testing org admins can update assignment status';
COMMENT ON POLICY general_org_can_delete_assignments ON batch_testing_assignment IS 'Only General org admins can cancel assignments before testing';
