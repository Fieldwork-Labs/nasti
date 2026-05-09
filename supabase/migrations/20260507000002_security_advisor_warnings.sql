-- Group 3: drop the legacy wide-open species RLS policy. Org-scoped policies
-- were added in 20251210072437_add_species_rls_policies.sql but this one was
-- left behind, silently overriding them.
DROP POLICY IF EXISTS species_rls ON public.species;

-- Group 1: lock down search_path on every public function flagged by the
-- advisor. Prevents search_path hijacking, especially against SECURITY DEFINER
-- functions where it could lead to code execution as the function owner.
-- Wrapped in DO blocks so missing functions (e.g. on a partially-migrated
-- local DB) don't abort the whole migration.
DO $$
DECLARE
  sig text;
  sigs text[] := ARRAY[
    'public.generate_species_abbreviation(text)',
    'public.fn_clean_batch(uuid, text, text, text, boolean, text, jsonb)',
    'public.fn_treat_batch(uuid, integer, jsonb, public.batch_quality, integer, text)',
    'public.current_custodian_org_id(uuid)',
    'public.fn_create_quality_test(uuid, uuid, jsonb, uuid)',
    'public.fn_merge_sub_batches(uuid[], text)',
    'public.fn_split_sub_batch(uuid, jsonb)',
    'public.validate_treatment_array(jsonb)',
    'public.assert_same_custodian(uuid[])',
    'public.is_linked_testing_org(uuid, uuid)',
    'public.is_batch_custodian_or_past(uuid, uuid)',
    'public.get_invitation_by_token(uuid)',
    'public.auto_populate_collection_code()',
    'public.batch_weight_info(public.batches)',
    'public.fn_clean_sub_batch(uuid, text, text, text, boolean, text, jsonb)',
    'public.calculate_standard_deviation(numeric[])',
    'public.get_next_code_sequence(text, uuid, uuid)',
    'public.get_ibra_regions(numeric, numeric, numeric, numeric, text)',
    'public.is_org_member(uuid, uuid)',
    'public.sub_batch_weight_info(public.sub_batches)',
    'public.update_quality_test_statistics()',
    'public.get_user_organisation_id()',
    'public.fn_mix_batches(uuid[], text)',
    'public.load_ibra7_regions_paginated()',
    'public.generate_org_abbreviation(text)',
    'public.fn_create_origin_batch_for_collection()',
    'public.get_ibra_code_from_location(geography)',
    'public.is_current_custodian(uuid, uuid)',
    'public.generate_collection_code(uuid, uuid, text, uuid, geography, timestamp with time zone)',
    'public.get_trip(uuid)',
    'public.get_merged_batch_inherited_statistics(uuid)',
    'public.calculate_quality_test_statistics(uuid)'
  ];
BEGIN
  FOREACH sig IN ARRAY sigs LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', sig);
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE 'skipping missing function %', sig;
    END;
  END LOOP;
END $$;

-- Group 4: revoke anon SELECT on public schema. NASTI requires authentication;
-- anon should never reach application data via PostgREST/GraphQL.
REVOKE SELECT ON ALL TABLES IN SCHEMA public FROM anon;

-- Prevent future tables from re-granting SELECT to anon by default.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE SELECT ON TABLES FROM anon;

-- Group 6: revoke anon EXECUTE on SECURITY DEFINER batch operations and
-- internal helpers. These all require an authenticated user context.
-- get_invitation_by_token is intentionally left accessible — it powers the
-- pre-login invite acceptance flow.
DO $$
DECLARE
  sig text;
  sigs text[] := ARRAY[
    'public.fn_clean_batch(uuid, text, text, text, boolean, text, jsonb)',
    'public.fn_clean_sub_batch(uuid, text, text, text, boolean, text, jsonb)',
    'public.fn_create_origin_batch_for_collection()',
    'public.fn_create_quality_test(uuid, uuid, jsonb, uuid)',
    'public.fn_merge_batches(uuid[], text)',
    'public.fn_merge_sub_batches(uuid[], text)',
    'public.fn_mix_batches(uuid[], text)',
    'public.fn_split_batch(uuid, integer, text)',
    'public.fn_split_sub_batch(uuid, jsonb)',
    'public.fn_treat_batch(uuid, integer, jsonb, public.batch_quality, integer, text)',
    'public.get_organisation_users()',
    'public.get_user_organisation_id()'
  ];
BEGIN
  FOREACH sig IN ARRAY sigs LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', sig);
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE 'skipping missing function %', sig;
    END;
  END LOOP;
END $$;
