# Implementation Plan: Testing Organizations

## Overview

Convert from individual Tester users to Testing Organizations with batch assignment, custody tracking, and processing workflows.

---

## Phase 1: Database Schema & Core Models

### 1.1 Add Organisation Type

**Migration: `add_organisation_type.sql`**

- Add `type` column to `organisation` table: `ENUM('General', 'Testing')`
- Default existing orgs to 'General'
- Index on type for filtering

### 1.2a Create Organisation Links Table

**Migration: `create_organisation_links.sql`**

```sql
CREATE TABLE organisation_link (
  id UUID PRIMARY KEY,
  general_org_id UUID REFERENCES organisation(id),
  testing_org_id UUID REFERENCES organisation(id),
  can_process BOOLEAN DEFAULT false,
  can_test BOOLEAN DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(general_org_id, testing_org_id)
)
```

- RLS: General org members can create/view their links
- Testing org members can view links pointing to them (read-only)

### 1.2b Create Organisation Link Request Table

**Migration: `create_organisation_link_requests.sql`**

```sql
CREATE TABLE organisation_link_request (
  id UUID PRIMARY KEY,
  general_org_id UUID REFERENCES organisation(id),
  testing_org_id UUID REFERENCES organisation(id),
  can_process BOOLEAN DEFAULT false,
  can_test BOOLEAN DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  accepted_by UUID REFERENCES auth.users(id),
  accepted_at TIMESTAMPTZ,
  UNIQUE(general_org_id, testing_org_id)
)
```

- RLS: General org members can create/view their requests
- Testing org members can view and accept/reject requests sent to them

### 1.3 Update Tests Table

**Migration: `add_test_performed_by_org.sql`**

- Add `performed_by_organisation_id UUID REFERENCES organisation(id)` to `tests`
- Populate existing tests with batch's current custodian org
- Update test creation to always record performing org

### 1.4 Batch Assignment Tracking

**Migration: `create_batch_testing_assignment.sql`**

```sql
CREATE TABLE batch_testing_assignment (
  id UUID PRIMARY KEY,
  batch_id UUID REFERENCES batches(id),
  assigned_to_org_id UUID REFERENCES organisation(id),
  assigned_by_org_id UUID REFERENCES organisation(id),
  assignment_type TEXT CHECK (assignment_type IN ('sample', 'full_batch')),
  sample_weight_grams INTEGER, -- weight of sample sent (for sample type)
  subsample_weight_grams INTEGER, -- weight of QA subsample retained by testing org
  subsample_storage_location_id UUID REFERENCES storage_locations(id), -- where QA subsample stored
  assigned_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ, -- when test was recorded
  returned_at TIMESTAMPTZ -- when batch/remainder was returned to owner
)
```

**Status is derived from assignment record:**
- Assignment exists with `returned_at = NULL` → batch/sample is "out for testing"
- `assignment_type = 'sample'` → "sample out", main batch stays with owner
- `assignment_type = 'full_batch'` → "out for processing/testing", custody transferred
- `completed_at != NULL` and `returned_at = NULL` → in testing org's inventory (QA samples tab)
- `returned_at != NULL` → assignment completed

---

## Phase 2: Backend Logic & RLS

### 2.1 RLS Policies

**Migration: `testing_org_rls.sql`**

**Batches:**

- General orgs: see own batches + batches at linked testing orgs
- Testing orgs: see batches assigned to them via `batch_testing_assignment`

**Tests:**

- Add `performed_by_organisation_id` to test policies
- Both general and testing orgs can view/create tests for batches they have access to

**Organisation Links:**

- General orgs can create/view/delete their links
- Testing orgs can view links pointing to them (read-only)

**Organisation Link Requests:**

- General orgs can create/view/cancel their requests
- Testing orgs can view and accept/reject requests sent to them

**Batch Testing Assignment:**

- General orgs can create assignments for their batches to linked testing orgs
- Both orgs can view assignments for their batches
- Testing orgs can update assignments (complete, return)

### 2.2 Helper Functions

```sql
-- Only create if provides genuine convenience
is_linked_testing_org(general_org_id, testing_org_id) -- Check if orgs are linked
```

**Note:** Don't create unnecessary functions. Query tables directly:
- Testing organisations: `SELECT * FROM organisation WHERE type = 'Testing'`
- Testing assignments: `SELECT * FROM batch_testing_assignment WHERE ...`

---

## Phase 3: Edge Functions

### 3.1 Assign Batch(es) for Testing

**Function: `assign_batches_for_testing`**

- Parameters:
  - `batch_ids` (array of UUID) - support multi-select
  - `testing_org_id` UUID
  - `assignment_type` ('sample'|'full_batch')
  - `sample_weight_grams` (required if sample type)
- Validates:
  - All batches belong to caller's org
  - Testing org is linked with appropriate permissions
  - Batches not already assigned
- Creates `batch_testing_assignment` records for each batch
- If full_batch: creates batch custody transfer to testing org
- Returns assignment details

### 3.2 Return Batch from Testing

**Function: `return_batch_from_testing`**

- Parameters:
  - `assignment_id` UUID
  - `subsample_weight_grams` (optional) - if retaining QA sample
  - `storage_location_id` (optional) - where subsample stored
- Validates: testing org has this assignment
- Updates assignment record:
  - `subsample_weight_grams` if provided
  - `subsample_storage_location_id` if provided
  - `returned_at` timestamp
- Creates custody transfer back to original org (if full batch)
- Returns updated assignment

### 3.3 Complete Testing Assignment

**Function: `complete_testing_assignment`**

- Parameters: `assignment_id` UUID
- Validates: test has been recorded for this assignment
- Updates assignment `completed_at` timestamp
- Moves batch from Todo → Inventory in testing org view

---

## Phase 4: Frontend - General Org Views

### 4.1 Testing Org Management Page

**Route: `/settings/testing-orgs`**

**Tabs:**

1. **Available Testing Orgs** (public directory)
   - List all Testing organisations
   - Show if already linked or request pending
   - "Request Link" button → opens permissions modal
2. **My Links**
   - List currently linked testing orgs with permissions
   - Edit/remove link options
3. **Pending Requests**
   - List outgoing link requests awaiting acceptance
   - Cancel request option

**Link Request Modal:**
- Select testing org
- Set permissions: can_test, can_process (checkboxes)
- Submit request

### 4.2 Assign Batch(es) for Testing

**Component: `AssignBatchesForTestingModal`**

**Triggered from:**
- Batch inventory row action (single batch)
- Batch inventory bulk action (multiple selected batches)

**Modal UI:**
- Shows selected batch(es) with details
- Dropdown: select linked testing org (filtered by permissions)
- Radio buttons: Assignment type
  - Sample (show sample weight input for EACH batch)
  - Full Batch
- Permission indicator for selected testing org
- Calls `assign_batches_for_testing` function

**Inventory bulk selection:**
- Add checkbox column to batch inventory table
- "Assign Selected for Testing" button appears when batches selected
- Opens modal with pre-selected batches

### 4.3 Batch Inventory Updates

**Status Indicators:**
- Badge: "Sample Out for Testing" (assignment_type = 'sample', returned_at = NULL)
- Badge: "Out for Processing/Testing" (assignment_type = 'full_batch', returned_at = NULL)
- Show testing org name in badge/tooltip

**Weight Column:**
- If sample sent: show `current_weight - sample_weight_grams`
- If full batch sent: show strikethrough weight with "At [Testing Org]" label

**Actions:**
- "Assign for Testing" button (disabled if already assigned and not returned)
- Checkbox for bulk selection

### 4.4 Test History Display

**Enhancement to test list:**
- Add organization badge showing which org performed each test
- Format: `[Org Name]` badge next to test date/type
- Different styling for tests by other orgs vs own org
- Tooltip shows full org name

---

## Phase 5: Frontend - Testing Org Views

### 5.1 Testing Assignments Dashboard

**Route: `/testing-assignments`** (Testing org members only)

**Tab 1: Todo List**

- Query: `batch_testing_assignment WHERE assigned_to_org_id = [org] AND completed_at IS NULL`
- Columns:
  - Sending org (assigned_by_org_id)
  - Batch code
  - Species
  - Assignment type (Sample / Full Batch)
  - Weight (sample_weight_grams if sample, else current_weight)
  - Assigned date
- Action: "Record Test" → opens QualityTestModal
- After test recorded: auto-updates `completed_at`, moves to Inventory tab

**Tab 2: Inventory / QA Samples**

- Query: `batch_testing_assignment WHERE assigned_to_org_id = [org] AND completed_at IS NOT NULL AND returned_at IS NULL`
- Shows batches with completed tests, not yet returned
- Columns:
  - Sending org
  - Batch code
  - Test result summary
  - Subsample weight (if stored)
  - Storage location
- Actions per row:
  - "Store Subsample" → modal to enter weight & location
  - "Return to Owner" → confirms and calls return function

**Store Subsample Modal:**
- Input: subsample weight
- Dropdown: storage location
- Updates assignment record
- Batch remains in Inventory tab

**Return to Owner Modal:**
- Shows assignment details
- If subsample stored: shows subsample info
- Confirm button calls `return_batch_from_testing`
- Removes from Inventory tab

### 5.2 Testing Org Batch Details

- Banner at top: "Assigned by [General Org Name]" (prominent display)
- Assignment info card:
  - Assignment type
  - Original weight / Sample weight
  - Assigned date
  - Link to sending org (if permissions allow)
- Test recording: auto-fills `performed_by_organisation_id` with testing org ID
- Return workflow integrated in batch actions menu

### 5.3 Test Recording Enhancement

**Automatic org tracking:**
- Backend: when test is created, set `performed_by_organisation_id = current_user_org_id`
- No manual selection needed
- On test save success: update assignment `completed_at` if from Todo list

---

## Phase 6: UI/UX Enhancements

### 6.1 Navigation Updates

**General Orgs:**
- Add "Testing Orgs" to settings/admin menu

**Testing Orgs:**
- Add "Testing Assignments" to main navigation
- Replace regular inventory with testing assignments dashboard

---

## Phase 7: Data Migration & Cleanup

### 7.1 Existing Org Classification

**Migration: `set_existing_orgs_to_general.sql`**

```sql
UPDATE organisation
SET type = 'General'
WHERE type IS NULL;
```

### 7.2 Testing Org Creation

- Testing organisations can only be created by site administrators (not through UI)
- Created directly via database or admin-only tools
- No user-facing onboarding workflow needed

---

## Implementation Order

1. **Phase 1** (Database): Core schema changes (migrations 1.1-1.4)
2. **Phase 2** (Backend): RLS policies and helper functions
3. **Phase 3** (Edge Functions): Business logic for assignments and returns
4. **Phase 4** (Frontend - General): Testing org management and batch assignment
5. **Phase 5** (Frontend - Testing): Todo/Inventory dashboard and return workflows
6. **Phase 6** (UX): Navigation and polish
7. **Phase 7** (Migration): Set existing orgs to General type

---

## Key Architectural Decisions

✅ **Testing orgs are real organisations** - not special users
✅ **Batch custody model** - reuse existing custody system for full batch assignments
✅ **Two-list system** - Todo (active assignments) vs Inventory (completed tests, QA samples)
✅ **Sample vs Full** - clearly differentiated in assignment type
✅ **Audit trail** - all tests track performing org
✅ **Public directory** - testing orgs are discoverable
✅ **Permission model** - links specify what testing org can do
✅ **Request/approval workflow** - testing orgs must accept link requests
✅ **Derived status** - no testing_status column, derive from assignment records
✅ **QA sample tracking** - subsample fields in assignment, not on batch
✅ **Multi-select assignment** - assign multiple batches at once

---

## Testing Checklist

- [ ] General org can request link to testing org with permissions
- [ ] Testing org can accept/reject link requests
- [ ] Can assign single batch for testing
- [ ] Can assign multiple batches for testing (bulk)
- [ ] Can assign sample only (batch stays with original)
- [ ] Can assign full batch (custody transfers)
- [ ] Testing org sees assigned batches in Todo
- [ ] After recording test, batch moves to Inventory
- [ ] Can store subsample with weight and location
- [ ] Can return batch to owner (with/without subsample)
- [ ] Test history shows performing org badge
- [ ] Original org sees batch status (sample out / out for processing)
- [ ] Weight column shows adjusted weight when sample sent
- [ ] RLS prevents unauthorized access to test assignments
- [ ] Only site admins can create testing organisations

---

## Notes from Client Meeting

- Make tester users an organisation rather than individual user
- Allow selection of testers that exist
- Testers receive a small subset of weight of the batch
- Testers should see the sending organisation in their batch list and details
- Testers may retain a small sample for insurance purposes, which would live at a storage location
- Testers need a way to send the seed batch back to the original owner once testing and processing is complete
- Testers should get two lists:
  1. Todo list of seed batches currently in custody for testing
  2. Batches that have been kept as a small QA sample in storage
- After recording a test, batch moves to inventory list
- In inventory list, controls for storing subsample and sending remainder back to original owner
- On the test table itself, we need to record the organisation that made the test
- On the test history list item, show a badge for organisation that did the test
- Organisations can send a sample for testing, or the whole batch for testing and processing
- When a sample only is sent, the main batch remains with the original owner but is marked as "sample out for testing"
- When the whole batch is sent, the batch is still shown in the original organisation's inventory list but is marked as out for "processing/testing" in the weight column
