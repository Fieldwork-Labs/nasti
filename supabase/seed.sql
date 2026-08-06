SET session_replication_role = replica;

--
-- PostgreSQL database dump
--

-- Dumped from database version 15.6
-- Dumped by pg_dump version 15.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: flow_state; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."users" ("instance_id", "id", "aud", "role", "email", "encrypted_password", "email_confirmed_at", "invited_at", "confirmation_token", "confirmation_sent_at", "recovery_token", "recovery_sent_at", "email_change_token_new", "email_change", "email_change_sent_at", "last_sign_in_at", "raw_app_meta_data", "raw_user_meta_data", "is_super_admin", "created_at", "updated_at", "phone", "phone_confirmed_at", "phone_change", "phone_change_token", "phone_change_sent_at", "email_change_token_current", "email_change_confirm_status", "banned_until", "reauthentication_token", "reauthentication_sent_at", "is_sso_user", "deleted_at", "is_anonymous") VALUES
	('00000000-0000-0000-0000-000000000000', 'e18b3927-87a9-4dcc-8d59-148461504a02', 'authenticated', 'authenticated', 'chid@test.com', '$2a$10$.a23q31I.z5itRlBfPnfU.3ID9jyHESc8ZJ2rPoz5Olz.U99rw3A6', '2025-09-29 08:41:05.849984+00', '2025-09-29 08:39:40.031407+00', '', NULL, '', NULL, '', '', NULL, '2026-08-06 04:43:44.798192+00', '{"provider": "email", "providers": ["email"]}', '{"name": "Chid Gilovitz"}', NULL, '2025-09-29 08:39:39.934336+00', '2026-08-06 08:36:25.480846+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false),
	('00000000-0000-0000-0000-000000000000', 'b422f046-5d63-4afd-b56a-b89a12971951', 'authenticated', 'authenticated', 'chid.inventory@test.com', '$2a$10$4KhD23dqo7P.ULy43iSUPOj5zoOr/qPj662cY/YNzx6AHeDn0YCnS', '2026-08-06 04:25:42.280997+00', NULL, '', NULL, '', NULL, '', '', NULL, '2026-08-06 04:44:44.263449+00', '{"provider": "email", "providers": ["email"]}', '{"email_verified": true}', NULL, '2026-08-06 04:25:42.267027+00', '2026-08-06 08:37:24.85054+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false);


--
-- Data for Name: identities; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--


INSERT INTO "auth"."identities" ("provider_id", "user_id", "identity_data", "provider", "last_sign_in_at", "created_at", "updated_at", "id") VALUES
	('e18b3927-87a9-4dcc-8d59-148461504a02', 'e18b3927-87a9-4dcc-8d59-148461504a02', '{"sub": "e18b3927-87a9-4dcc-8d59-148461504a02", "email": "chid@test.com", "email_verified": false, "phone_verified": false}', 'email', '2025-09-29 08:39:40.011186+00', '2025-09-29 08:39:40.011254+00', '2025-09-29 08:39:40.011254+00', '291d419d-f139-4667-bacc-694d2b366ce3'),
	('b422f046-5d63-4afd-b56a-b89a12971951', 'b422f046-5d63-4afd-b56a-b89a12971951', '{"sub": "b422f046-5d63-4afd-b56a-b89a12971951", "email": "chid.inventory@test.com", "email_verified": false, "phone_verified": false}', 'email', '2026-08-06 04:25:42.271534+00', '2026-08-06 04:25:42.271619+00', '2026-08-06 04:25:42.271619+00', '0395bc0a-f8fc-43de-8e19-885de3ea2ef8');


--
-- Data for Name: organisation; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."organisation" ("id", "name", "owner_id", "created_at", "contact_name", "contact_email", "contact_phone", "contact_address") VALUES
	('02aba5b9-6c46-406d-831a-4f51851599f2', 'Chid''s Org', 'e18b3927-87a9-4dcc-8d59-148461504a02', '2025-09-29 08:40:04+00', NULL, NULL, NULL, NULL);



--
-- Data for Name: organisation_link; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."organisation_link" ("id", "general_org_id", "testing_org_id", "created_by", "created_at") VALUES
	('b07d43a6-4b14-4483-b533-793c1ebdab41', '02aba5b9-6c46-406d-831a-4f51851599f2', '2fd8367a-22b3-47a8-9803-7eb3a10e0be4', 'b422f046-5d63-4afd-b56a-b89a12971951', '2026-08-06 04:44:58.838918+00');


--
-- Data for Name: organisation_link_request; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."organisation_link_request" ("id", "general_org_id", "testing_org_id", "created_by", "created_at", "accepted_by", "accepted_at") VALUES
	('35fbd4b6-172f-4a58-95a5-7f74b2031386', '02aba5b9-6c46-406d-831a-4f51851599f2', '2fd8367a-22b3-47a8-9803-7eb3a10e0be4', 'e18b3927-87a9-4dcc-8d59-148461504a02', '2026-08-06 04:44:22.766003+00', 'b422f046-5d63-4afd-b56a-b89a12971951', '2026-08-06 04:44:58.854+00');



--
-- Data for Name: species; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."species" ("id", "name", "description", "created_at", "ala_guid", "indigenous_name", "organisation_id") VALUES
	('d2b02f1c-905e-46d0-a3e0-4b253d2a1349', 'Chamelaucium uncinatum', NULL, '2025-09-29 08:44:35.039785+00', 'https://id.biodiversity.org.au/node/apni/2914702', NULL, '02aba5b9-6c46-406d-831a-4f51851599f2'),
	('bbe4a97f-c05d-4cb6-b07b-560c1cbf305f', 'Diplolaena geraldtonensis', NULL, '2025-09-29 08:44:35.039785+00', 'https://id.biodiversity.org.au/node/apni/2901472', NULL, '02aba5b9-6c46-406d-831a-4f51851599f2'),
	('9c5d25d7-a230-4591-8861-7e9d3a590f04', 'Alyogyne sp. Geraldton (R.Davis 3487)', NULL, '2025-09-29 08:44:35.039785+00', 'https://id.biodiversity.org.au/node/apni/2896168', NULL, '02aba5b9-6c46-406d-831a-4f51851599f2'),
	('e296cc37-c5cc-4dd5-b48d-faa3e4baf88c', 'Scholtzia sp. Geraldton (F.Lullfitz L 3216)', NULL, '2025-09-29 08:44:35.039785+00', 'https://id.biodiversity.org.au/node/apni/2901007', NULL, '02aba5b9-6c46-406d-831a-4f51851599f2'),
	('ddb09373-400f-4050-9b40-4ad8a3092ff8', 'Tricoryne sp. Geraldton (G.J.Keighery 10461)', NULL, '2025-09-29 08:44:35.039785+00', 'https://id.biodiversity.org.au/node/apni/2898714', NULL, '02aba5b9-6c46-406d-831a-4f51851599f2');


--
-- Data for Name: trip; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."trip" ("id", "organisation_id", "name", "metadata", "start_date", "end_date", "created_at", "created_by", "location_coordinate", "location_name") VALUES
	('a2a3535f-1f84-4e65-957c-cdc544948d94', '02aba5b9-6c46-406d-831a-4f51851599f2', 'Geraldton Trip', NULL, '2025-09-07', '2025-09-09', '2025-09-29 08:41:40.598447+00', 'e18b3927-87a9-4dcc-8d59-148461504a02', '0101000020E6100000BBF2599E07A75C40BF49D3A068C63CC0', 'Geraldton');


--
-- Data for Name: collection; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."person" ("id", "organisation_id", "source_type", "user_id", "display_name", "email", "is_active", "created_at", "updated_at") VALUES
	('b52fb44d-8cab-4e52-9962-80fc41de6804', '02aba5b9-6c46-406d-831a-4f51851599f2', 'user', 'e18b3927-87a9-4dcc-8d59-148461504a02', 'Chid Gilovitz', 'chid@test.com', true, '2025-09-29 08:40:26.888428+00', '2025-09-29 08:40:26.888428+00');

INSERT INTO "public"."collection" ("id", "species_id", "species_uncertain", "field_name", "specimen_collected", "organisation_id", "location", "created_by", "created_at", "trip_id", "description", "code", "collected_on", "collected_by", "person_ids") VALUES
	('50d59d29-0eed-4f79-acd6-2a62c995bc45', 'd2b02f1c-905e-46d0-a3e0-4b253d2a1349', false, '', false, '02aba5b9-6c46-406d-831a-4f51851599f2', '0101000020E6100000508D976E12635E40D50968226CA83FC0', 'e18b3927-87a9-4dcc-8d59-148461504a02', '2025-09-29 08:47:18.690457+00', 'a2a3535f-1f84-4e65-957c-cdc544948d94', '', 'CHAUNC-CO.COO.25', '2025-09-29', 'e18b3927-87a9-4dcc-8d59-148461504a02', ARRAY['b52fb44d-8cab-4e52-9962-80fc41de6804']::uuid[]),
	('f9c2b54c-58cc-434b-aae4-3e79e17f3b31', '9c5d25d7-a230-4591-8861-7e9d3a590f04', false, '', false, '02aba5b9-6c46-406d-831a-4f51851599f2', '0101000020E61000006DE7FBA9F1A25D4085EB51B81E1540C0', 'e18b3927-87a9-4dcc-8d59-148461504a02', '2025-09-29 09:40:55.681459+00', 'a2a3535f-1f84-4e65-957c-cdc544948d94', '', 'ALOSPGER (R.Davis 3487)-CO.MAL.25', '2025-09-29', 'e18b3927-87a9-4dcc-8d59-148461504a02', ARRAY['b52fb44d-8cab-4e52-9962-80fc41de6804']::uuid[]),
	('7bf4d772-d79b-4b6d-8608-4b80a9cf314a', 'bbe4a97f-c05d-4cb6-b07b-560c1cbf305f', false, '', false, '02aba5b9-6c46-406d-831a-4f51851599f2', '0101000020E6100000051C967762A95C40CA08D12760CB3CC0', 'e18b3927-87a9-4dcc-8d59-148461504a02', '2025-09-29 09:39:18.702834+00', 'a2a3535f-1f84-4e65-957c-cdc544948d94', '-28.794435967000744, 114.64663495692373', 'DIPGER-CO.GES.25', '2025-09-29', 'e18b3927-87a9-4dcc-8d59-148461504a02', ARRAY['b52fb44d-8cab-4e52-9962-80fc41de6804']::uuid[]);


--
-- Data for Name: containers; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."containers" ("id", "organisation_id", "name", "purpose", "active") VALUES
	('4f5e5b9e-3a2f-4f0c-9c3d-9f4b1a7c1001', '02aba5b9-6c46-406d-831a-4f51851599f2', 'Bag', 'collection', true),
	('4f5e5b9e-3a2f-4f0c-9c3d-9f4b1a7c1002', '02aba5b9-6c46-406d-831a-4f51851599f2', 'Large bucket', 'collection', true),
	('4f5e5b9e-3a2f-4f0c-9c3d-9f4b1a7c1003', '02aba5b9-6c46-406d-831a-4f51851599f2', 'Paper envelope', 'storage', true);


--
-- Data for Name: org_user; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."org_user" ("id", "organisation_id", "user_id", "role", "joined_at", "is_active") VALUES
	('c5062662-c316-4720-9339-6961e2fe7e7e', '02aba5b9-6c46-406d-831a-4f51851599f2', 'e18b3927-87a9-4dcc-8d59-148461504a02', 'Admin', '2025-09-29 08:40:26.888428+00', true),
	('2975d2d0-d6bb-4736-ab3c-1b105839afa5', '2fd8367a-22b3-47a8-9803-7eb3a10e0be4', 'b422f046-5d63-4afd-b56a-b89a12971951', 'Admin', '2026-08-06 04:26:51.16579+00', true);


--
-- Data for Name: spatial_ref_sys; Type: TABLE DATA; Schema: public; Owner: supabase_admin
--



--
-- Data for Name: trip_member; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."trip_member" ("id", "trip_id", "user_id", "role", "joined_at") VALUES
	('1a81ad45-f21e-4096-a866-1cc9e4972744', 'a2a3535f-1f84-4e65-957c-cdc544948d94', 'e18b3927-87a9-4dcc-8d59-148461504a02', 'Member', '2025-09-29 08:41:59+00');


--
-- Data for Name: trip_species; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."trip_species" ("id", "trip_id", "species_id") VALUES
	('e809aa59-6e34-43fc-bca3-7d4beb73f19d', 'a2a3535f-1f84-4e65-957c-cdc544948d94', 'd2b02f1c-905e-46d0-a3e0-4b253d2a1349'),
	('ca0205e8-ea4a-4514-addd-dd5a79c7bae9', 'a2a3535f-1f84-4e65-957c-cdc544948d94', 'bbe4a97f-c05d-4cb6-b07b-560c1cbf305f'),
	('ba730f9a-b0d8-480a-a563-27959ac54fe4', 'a2a3535f-1f84-4e65-957c-cdc544948d94', '9c5d25d7-a230-4591-8861-7e9d3a590f04'),
	('ecd0f898-9230-49a1-a88f-b362ae2067b0', 'a2a3535f-1f84-4e65-957c-cdc544948d94', 'e296cc37-c5cc-4dd5-b48d-faa3e4baf88c'),
	('7bf2e49b-175f-4c68-8705-7566d491bd10', 'a2a3535f-1f84-4e65-957c-cdc544948d94', 'ddb09373-400f-4050-9b40-4ad8a3092ff8');


--
-- Data for Name: buckets; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type") VALUES
	('collection-photos', 'collection-photos', NULL, '2025-09-29 08:48:08.507473+00', '2025-09-29 08:48:08.507473+00', false, false, NULL, NULL, NULL, 'STANDARD');



--
-- Data for Name: tests; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."tests" ("id", "batch_id", "type", "result", "tested_at", "tested_by", "statistics", "performed_by_organisation_id", "sub_batch_id") VALUES
	('d4590abd-00dc-453a-ac82-057af45bfa32', '064c2fa9-fd79-4ac5-bf08-0e574be558f0', 'quality', '{"notes": "", "repeats": [{"weight_grams": 10, "dead_seed_count": 52, "viable_seed_count": 100}, {"weight_grams": 12, "dead_seed_count": 12, "viable_seed_count": 99}], "psu_grams": 244, "test_type": "x-ray", "inert_seed_weight_grams": 10, "other_species_seeds_grams": 1, "relative_humidity_percent": 0}', '2026-07-29 06:35:23.105934+00', 'e18b3927-87a9-4dcc-8d59-148461504a02', '{"pls": 0.741467, "psu": 0.956863, "vsu": 0.774893, "tpsu": 0.086949, "plsCount": 3002, "psuCount": 3874, "standardError": 0.116999}', '02aba5b9-6c46-406d-831a-4f51851599f2', 'afab1076-7db5-474e-b2c0-c7edb1026dab'),
	('c11ff7ac-e3d8-455d-8209-7f164e199100', '064c2fa9-fd79-4ac5-bf08-0e574be558f0', 'quality', '{"notes": "", "repeats": [{"weight_grams": 10, "dead_seed_count": 2, "viable_seed_count": 50}], "psu_grams": 112, "test_type": "x-ray", "inert_seed_weight_grams": 2, "other_species_seeds_grams": 0, "relative_humidity_percent": 0}', '2026-07-29 06:36:30.56592+00', 'e18b3927-87a9-4dcc-8d59-148461504a02', '{"pls": 0.944669, "psu": 0.982456, "vsu": 0.961538, "tpsu": 0.192308, "plsCount": 1621, "psuCount": 1686, "standardError": null}', '02aba5b9-6c46-406d-831a-4f51851599f2', '68f5ffc4-b1b4-4fb1-bb5e-882538a4fdad'),
	('633e1b0f-d273-47a2-9376-035ae7b35a4e', 'adedaba3-ffe6-460e-babd-2439793fe8f9', 'quality', '{"notes": "", "repeats": [{"weight_grams": 5, "dead_seed_count": 1, "viable_seed_count": 100}], "psu_grams": 10, "test_type": "germination", "inert_seed_weight_grams": 1, "other_species_seeds_grams": 0, "relative_humidity_percent": 0}', '2026-07-29 07:14:17.913223+00', 'e18b3927-87a9-4dcc-8d59-148461504a02', '{"pls": 0.900090, "psu": 0.909091, "vsu": 0.990099, "tpsu": 0.049505, "plsCount": 9091, "psuCount": 9182, "standardError": null}', '02aba5b9-6c46-406d-831a-4f51851599f2', 'efe5355a-37b1-4581-8c6d-36f979afe128');


--
-- Data for Name: batches; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."batches" ("id", "collection_id", "organisation_id", "created_at", "weight_grams", "notes", "code") VALUES
	('a93057b9-b2aa-42c7-9fac-4c4bfbf88ab7', '683acb6d-41ff-4a17-9f8b-dad822ce4f36', '02aba5b9-6c46-406d-831a-4f51851599f2', '2026-07-29 04:12:58.004795+00', NULL, NULL, 'DIPGER-CO.GES.26-1'),
	('064c2fa9-fd79-4ac5-bf08-0e574be558f0', '683acb6d-41ff-4a17-9f8b-dad822ce4f36', '02aba5b9-6c46-406d-831a-4f51851599f2', '2026-07-29 04:13:33.22348+00', 352, NULL, 'DIPGER-CO.GES.26-1-HQ-1'),
	('0192919f-d8d1-4792-b04b-2268d3771972', '9ea3cc1c-d812-4044-b099-fe519736e3cb', '02aba5b9-6c46-406d-831a-4f51851599f2', '2026-07-29 07:06:53.276788+00', NULL, NULL, 'CHAUNC-CO.SWA.26-1'),
	('82d7cd1d-2ed4-4164-a1f3-ea9656379db8', '468a2b6d-bf7f-47fd-bf17-47f793bf3055', '02aba5b9-6c46-406d-831a-4f51851599f2', '2026-07-29 07:09:46.094775+00', NULL, NULL, 'DIPGER-CO.GES.26-2'),
	('adedaba3-ffe6-460e-babd-2439793fe8f9', '9ea3cc1c-d812-4044-b099-fe519736e3cb', '02aba5b9-6c46-406d-831a-4f51851599f2', '2026-07-29 07:12:05.522484+00', 500, NULL, 'CHAUNC-CO.SWA.26-1-HQ-1');


--
-- Data for Name: sub_batches; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."sub_batches" ("id", "batch_id", "weight_grams", "notes", "created_at", "container_id") VALUES
	('a8ecda6e-bef9-4079-b335-423a7736e218', '064c2fa9-fd79-4ac5-bf08-0e574be558f0', 25, NULL, '2026-07-29 06:55:30.720029+00', '4f5e5b9e-3a2f-4f0c-9c3d-9f4b1a7c1003'),
	('022171a3-939e-44f0-8ddd-6c652d2e0ae6', 'adedaba3-ffe6-460e-babd-2439793fe8f9', 100, 'Bagged after cleaning', '2026-07-29 07:12:45.114382+00', '4f5e5b9e-3a2f-4f0c-9c3d-9f4b1a7c1003'),
	('c86cd19c-dc65-4652-a570-eb4631a0eac3', 'adedaba3-ffe6-460e-babd-2439793fe8f9', 100, 'Bagged after cleaning', '2026-07-29 07:12:45.114382+00', '4f5e5b9e-3a2f-4f0c-9c3d-9f4b1a7c1003'),
	('57f69c40-b680-458e-94e0-4bd8b70f497c', 'adedaba3-ffe6-460e-babd-2439793fe8f9', 100, 'Bagged after cleaning', '2026-07-29 07:12:45.114382+00', '4f5e5b9e-3a2f-4f0c-9c3d-9f4b1a7c1003'),
	('aca05843-e4b7-4ed1-96bb-0f7245ae0bc6', 'adedaba3-ffe6-460e-babd-2439793fe8f9', 100, 'Bagged after cleaning', '2026-07-29 07:12:45.114382+00', '4f5e5b9e-3a2f-4f0c-9c3d-9f4b1a7c1003'),
	('09f76b2b-82e7-4cd4-9fd4-8ae5402b2688', 'adedaba3-ffe6-460e-babd-2439793fe8f9', 100, 'Bagged after cleaning', '2026-07-29 07:12:45.114382+00', '4f5e5b9e-3a2f-4f0c-9c3d-9f4b1a7c1003'),
	('39d5512f-eff1-4fb7-a503-bbf6dcd6f742', 'adedaba3-ffe6-460e-babd-2439793fe8f9', 200, NULL, '2026-07-29 07:13:34.248353+00', '4f5e5b9e-3a2f-4f0c-9c3d-9f4b1a7c1003'),
	('efe5355a-37b1-4581-8c6d-36f979afe128', 'adedaba3-ffe6-460e-babd-2439793fe8f9', 50, NULL, '2026-07-29 07:13:50.481925+00', '4f5e5b9e-3a2f-4f0c-9c3d-9f4b1a7c1003'),
	('c4288126-e154-4474-aaed-7ad90210da33', '064c2fa9-fd79-4ac5-bf08-0e574be558f0', 252, 'Bagged after cleaning', '2026-07-29 04:13:55.98707+00', '4f5e5b9e-3a2f-4f0c-9c3d-9f4b1a7c1003'),
	('68f5ffc4-b1b4-4fb1-bb5e-882538a4fdad', '064c2fa9-fd79-4ac5-bf08-0e574be558f0', 100, 'Bagged after cleaning', '2026-07-29 04:13:55.98707+00', '4f5e5b9e-3a2f-4f0c-9c3d-9f4b1a7c1003'),
	('38bc9fb4-62a6-495e-b517-31c81a9036ef', '064c2fa9-fd79-4ac5-bf08-0e574be558f0', 10, NULL, '2026-07-29 04:14:32.608633+00', '4f5e5b9e-3a2f-4f0c-9c3d-9f4b1a7c1003'),
	('de76ead5-b96d-4ec7-aca1-a78a089e9cc0', '064c2fa9-fd79-4ac5-bf08-0e574be558f0', 12, NULL, '2026-07-29 04:14:49.24628+00', '4f5e5b9e-3a2f-4f0c-9c3d-9f4b1a7c1003'),
	('afab1076-7db5-474e-b2c0-c7edb1026dab', '064c2fa9-fd79-4ac5-bf08-0e574be558f0', 22, NULL, '2026-07-29 04:14:59.472145+00', '4f5e5b9e-3a2f-4f0c-9c3d-9f4b1a7c1003');


--
-- Data for Name: batch_cleaning; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."batch_cleaning" ("id", "input_batch_id", "input_sub_batch_id", "material_type", "material_subtype", "material_notes", "is_cleaned", "cleaning_notes", "created_at", "created_by", "organisation_id", "worker_ids", "duration") VALUES
	('3252d806-ef3a-4c9d-ae90-2a6ca3d2aa62', 'a93057b9-b2aa-42c7-9fac-4c4bfbf88ab7', NULL, 'seed', 'achene', NULL, true, NULL, '2026-07-29 04:13:33.22348+00', 'e18b3927-87a9-4dcc-8d59-148461504a02', '02aba5b9-6c46-406d-831a-4f51851599f2', '{b52fb44d-8cab-4e52-9962-80fc41de6804}', '02:04:00'),
	('a4e3a277-6c37-406d-9cbc-2d4cf278bc01', '0192919f-d8d1-4792-b04b-2268d3771972', NULL, 'covering_structure', 'capsule', NULL, true, NULL, '2026-07-29 07:12:05.522484+00', 'e18b3927-87a9-4dcc-8d59-148461504a02', '02aba5b9-6c46-406d-831a-4f51851599f2', '{b52fb44d-8cab-4e52-9962-80fc41de6804,4672c7d8-c371-42d1-82af-f972b00df32f}', '01:13:00');


--
-- Data for Name: batch_cleaning_output; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."batch_cleaning_output" ("id", "cleaning_id", "output_batch_id", "quality", "material_type", "weight_grams") VALUES
	('1c92d489-31fe-4cec-aea7-4e82caefdf59', '3252d806-ef3a-4c9d-ae90-2a6ca3d2aa62', '064c2fa9-fd79-4ac5-bf08-0e574be558f0', 'HQ', 'seed', 352),
	('96af21f1-f1cc-4565-abee-3163793996bd', 'a4e3a277-6c37-406d-9cbc-2d4cf278bc01', 'adedaba3-ffe6-460e-babd-2439793fe8f9', 'HQ', 'seed', 500);


--
-- Data for Name: batch_cleaning_photo; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."batch_cleaning_photo" ("id", "cleaning_id", "stage", "url", "caption", "uploaded_at", "uploaded_by", "organisation_id") VALUES
	('872c0198-da76-4109-afe8-c6d9c9c1f58f', '3252d806-ef3a-4c9d-ae90-2a6ca3d2aa62', 'before', '02aba5b9-6c46-406d-831a-4f51851599f2/cleaning/3252d806-ef3a-4c9d-ae90-2a6ca3d2aa62/872c0198-da76-4109-afe8-c6d9c9c1f58f.jpg', NULL, '2026-07-29 04:13:35.080917+00', NULL, '02aba5b9-6c46-406d-831a-4f51851599f2'),
	('9727d428-773a-4ed9-8154-e384c20449e7', '3252d806-ef3a-4c9d-ae90-2a6ca3d2aa62', 'after', '02aba5b9-6c46-406d-831a-4f51851599f2/cleaning/3252d806-ef3a-4c9d-ae90-2a6ca3d2aa62/9727d428-773a-4ed9-8154-e384c20449e7.jpg', NULL, '2026-07-29 04:13:35.080917+00', NULL, '02aba5b9-6c46-406d-831a-4f51851599f2'),
	('f671508b-dce4-49c3-9e57-880bc4ad1352', 'a4e3a277-6c37-406d-9cbc-2d4cf278bc01', 'before', '02aba5b9-6c46-406d-831a-4f51851599f2/cleaning/a4e3a277-6c37-406d-9cbc-2d4cf278bc01/f671508b-dce4-49c3-9e57-880bc4ad1352.jpg', NULL, '2026-07-29 07:12:07.553327+00', NULL, '02aba5b9-6c46-406d-831a-4f51851599f2'),
	('d6dc8185-9a70-4d69-aaa5-e7abf3c60203', 'a4e3a277-6c37-406d-9cbc-2d4cf278bc01', 'after', '02aba5b9-6c46-406d-831a-4f51851599f2/cleaning/a4e3a277-6c37-406d-9cbc-2d4cf278bc01/d6dc8185-9a70-4d69-aaa5-e7abf3c60203.jpg', NULL, '2026-07-29 07:12:07.553327+00', NULL, '02aba5b9-6c46-406d-831a-4f51851599f2');


--
-- Data for Name: batch_custody; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."batch_custody" ("id", "batch_id", "organisation_id", "received_at", "transferred_by", "previous_organisation_id", "notes") VALUES
	('bcbfd2d3-69dc-490e-8b80-61cc71b4e6d9', 'a93057b9-b2aa-42c7-9fac-4c4bfbf88ab7', '02aba5b9-6c46-406d-831a-4f51851599f2', '2026-07-29 04:12:58.004795+00', NULL, NULL, 'Batch created from collection'),
	('e1dfd5c5-a218-4e2b-8190-548aacfb9b7c', '064c2fa9-fd79-4ac5-bf08-0e574be558f0', '02aba5b9-6c46-406d-831a-4f51851599f2', '2026-07-29 04:13:33.22348+00', NULL, NULL, 'Batch created via cleaning'),
	('baa512c2-7872-4c8d-ae9a-0810d9e317ac', '0192919f-d8d1-4792-b04b-2268d3771972', '02aba5b9-6c46-406d-831a-4f51851599f2', '2026-07-29 07:06:53.276788+00', NULL, NULL, 'Batch created from collection'),
	('cd9f60b0-c8ac-401e-8350-b5a56e7381df', '82d7cd1d-2ed4-4164-a1f3-ea9656379db8', '02aba5b9-6c46-406d-831a-4f51851599f2', '2026-07-29 07:09:46.094775+00', NULL, NULL, 'Batch created from collection'),
	('cd4bda99-37af-4a24-b2f9-a976d01aabd0', 'adedaba3-ffe6-460e-babd-2439793fe8f9', '02aba5b9-6c46-406d-831a-4f51851599f2', '2026-07-29 07:12:05.522484+00', NULL, NULL, 'Batch created via cleaning');




--
-- Data for Name: storage_locations; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."storage_locations" ("id", "organisation_id", "name", "description", "created_at", "active") VALUES
	('7dcaba95-fc12-40e2-a108-76e7ccf6b5b5', '02aba5b9-6c46-406d-831a-4f51851599f2', 'backroom', '
', '2026-07-29 06:06:02.371092+00', true),
	('712562f5-d4e9-44ec-a519-f82c19f8fd59', '02aba5b9-6c46-406d-831a-4f51851599f2', 'Warehouse', NULL, '2026-07-29 06:06:06.691152+00', true);


--
-- Data for Name: batch_storage; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."batch_storage" ("id", "batch_id", "location_id", "stored_at", "moved_out_at", "notes", "created_at", "sub_batch_id") VALUES
	('f53cc6c7-7fcb-4fb4-a3d9-f18677249019', '064c2fa9-fd79-4ac5-bf08-0e574be558f0', '7dcaba95-fc12-40e2-a108-76e7ccf6b5b5', '2026-07-29 06:55:30.720029+00', '2026-07-30 06:55:00+00', NULL, '2026-07-29 06:55:30.720029+00', 'a8ecda6e-bef9-4079-b335-423a7736e218'),
	('c6b552af-5d8d-4877-8e38-3174188f7db4', '064c2fa9-fd79-4ac5-bf08-0e574be558f0', '712562f5-d4e9-44ec-a519-f82c19f8fd59', '2026-07-30 06:55:00+00', NULL, NULL, '2026-07-29 06:56:27.365195+00', 'a8ecda6e-bef9-4079-b335-423a7736e218'),
	('4e6d619e-4331-4f78-871f-f609fc22bd58', 'adedaba3-ffe6-460e-babd-2439793fe8f9', '7dcaba95-fc12-40e2-a108-76e7ccf6b5b5', '2026-07-29 07:12:45.114382+00', NULL, 'Initial storage after cleaning', '2026-07-29 07:12:45.114382+00', '022171a3-939e-44f0-8ddd-6c652d2e0ae6'),
	('c5e015aa-9d88-4b07-ba25-1b4a5de73afe', 'adedaba3-ffe6-460e-babd-2439793fe8f9', '7dcaba95-fc12-40e2-a108-76e7ccf6b5b5', '2026-07-29 07:12:45.114382+00', NULL, 'Initial storage after cleaning', '2026-07-29 07:12:45.114382+00', 'c86cd19c-dc65-4652-a570-eb4631a0eac3'),
	('fcaf3cea-25df-4971-b88b-b36251920088', 'adedaba3-ffe6-460e-babd-2439793fe8f9', '7dcaba95-fc12-40e2-a108-76e7ccf6b5b5', '2026-07-29 07:12:45.114382+00', NULL, 'Initial storage after cleaning', '2026-07-29 07:12:45.114382+00', '57f69c40-b680-458e-94e0-4bd8b70f497c'),
	('79d73855-67a1-43d1-a50e-509a7a94178b', 'adedaba3-ffe6-460e-babd-2439793fe8f9', '7dcaba95-fc12-40e2-a108-76e7ccf6b5b5', '2026-07-29 07:12:45.114382+00', '2026-07-29 07:13:34.248353+00', 'Initial storage after cleaning', '2026-07-29 07:12:45.114382+00', '09f76b2b-82e7-4cd4-9fd4-8ae5402b2688'),
	('9785f1be-4d30-4b3e-9667-8eb05c07bb59', 'adedaba3-ffe6-460e-babd-2439793fe8f9', '7dcaba95-fc12-40e2-a108-76e7ccf6b5b5', '2026-07-29 07:12:45.114382+00', '2026-07-29 07:13:34.248353+00', 'Initial storage after cleaning', '2026-07-29 07:12:45.114382+00', 'aca05843-e4b7-4ed1-96bb-0f7245ae0bc6'),
	('d0f39513-b6a9-460b-b404-115803ee15d0', 'adedaba3-ffe6-460e-babd-2439793fe8f9', '7dcaba95-fc12-40e2-a108-76e7ccf6b5b5', '2026-07-29 07:13:34.248353+00', NULL, 'Storage after sub-batch merge', '2026-07-29 07:13:34.248353+00', '39d5512f-eff1-4fb7-a503-bbf6dcd6f742'),
	('57a2b8bc-6d07-47ae-ac28-bb062ac1fed7', 'adedaba3-ffe6-460e-babd-2439793fe8f9', '7dcaba95-fc12-40e2-a108-76e7ccf6b5b5', '2026-07-29 07:13:50.481925+00', NULL, NULL, '2026-07-29 07:13:50.481925+00', 'efe5355a-37b1-4581-8c6d-36f979afe128');


--
-- Data for Name: batch_testing_assignment; Type: TABLE DATA; Schema: public; Owner: postgres
--

-- An assignment is now one bag, not one batch. This row is the 50g bag split
-- off CHAUNC-CO.SWA.26-1-HQ-1 and sent as a sample — the same bag the seeded
-- quality test above was recorded against. It is closed, so it needs an
-- outcome to satisfy the closed_at/outcome coupling constraint.
INSERT INTO "public"."batch_testing_assignment" ("id", "batch_id", "sub_batch_id", "assigned_to_org_id", "assigned_by_org_id", "assigned_at", "completed_at", "closed_at", "outcome") VALUES
	('c49869fd-adaf-4811-87d1-52ec900a8059', 'adedaba3-ffe6-460e-babd-2439793fe8f9', 'efe5355a-37b1-4581-8c6d-36f979afe128', '2fd8367a-22b3-47a8-9803-7eb3a10e0be4', '02aba5b9-6c46-406d-831a-4f51851599f2', '2026-08-06 04:46:49.651367+00', '2026-08-06 04:47:17.406406+00', '2026-08-06 04:47:17.406406+00', 'returned');


--
-- Data for Name: batch_weight_adjustments; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."batch_weight_adjustments" ("id", "sub_batch_id", "weight_grams", "reason", "created_at", "created_by") VALUES
	('d3f55a8b-d878-47a2-a50d-ff49465cd0be', 'c4288126-e154-4474-aaed-7ad90210da33', -10, 'Split into 1 new sub-batch(es)', '2026-07-29 04:14:32.608633+00', 'e18b3927-87a9-4dcc-8d59-148461504a02'),
	('07fb9c26-3e42-4a6b-aaa1-02107cc310ca', 'c4288126-e154-4474-aaed-7ad90210da33', -12, 'Split into 1 new sub-batch(es)', '2026-07-29 04:14:49.24628+00', 'e18b3927-87a9-4dcc-8d59-148461504a02'),
	('6369d9eb-7df4-4f11-8fdd-bca3664aaf90', '38bc9fb4-62a6-495e-b517-31c81a9036ef', -10, 'Merged into sub-batch afab1076-7db5-474e-b2c0-c7edb1026dab', '2026-07-29 04:14:59.472145+00', 'e18b3927-87a9-4dcc-8d59-148461504a02'),
	('7c10c613-470a-49a1-8cc0-2e4dcc016f2e', 'de76ead5-b96d-4ec7-aca1-a78a089e9cc0', -12, 'Merged into sub-batch afab1076-7db5-474e-b2c0-c7edb1026dab', '2026-07-29 04:14:59.472145+00', 'e18b3927-87a9-4dcc-8d59-148461504a02'),
	('d2dc57bc-3500-4a53-a460-650dd46ae35b', 'afab1076-7db5-474e-b2c0-c7edb1026dab', -22, 'Seeds consumed in quality test (test_id: d4590abd-00dc-453a-ac82-057af45bfa32)', '2026-07-29 06:35:23.105934+00', 'e18b3927-87a9-4dcc-8d59-148461504a02'),
	('e973a279-0725-47de-8e92-b1a85d5d4ca3', '68f5ffc4-b1b4-4fb1-bb5e-882538a4fdad', -10, 'Seeds consumed in quality test (test_id: c11ff7ac-e3d8-455d-8209-7f164e199100)', '2026-07-29 06:36:30.56592+00', 'e18b3927-87a9-4dcc-8d59-148461504a02'),
	('f668610a-e2f4-40c3-a6fd-b2164c9c46f8', 'c4288126-e154-4474-aaed-7ad90210da33', -25, 'Split into 1 new sub-batch(es)', '2026-07-29 06:55:30.720029+00', 'e18b3927-87a9-4dcc-8d59-148461504a02'),
	('9055e0f3-af54-469e-ab49-0d58919c327d', 'aca05843-e4b7-4ed1-96bb-0f7245ae0bc6', -100, 'Merged into sub-batch 39d5512f-eff1-4fb7-a503-bbf6dcd6f742', '2026-07-29 07:13:34.248353+00', 'e18b3927-87a9-4dcc-8d59-148461504a02'),
	('c7769f0f-622d-4484-a969-593cceddade0', '09f76b2b-82e7-4cd4-9fd4-8ae5402b2688', -100, 'Merged into sub-batch 39d5512f-eff1-4fb7-a503-bbf6dcd6f742', '2026-07-29 07:13:34.248353+00', 'e18b3927-87a9-4dcc-8d59-148461504a02'),
	('730e7bc9-b18e-4ee4-a6cf-864af2683fce', '39d5512f-eff1-4fb7-a503-bbf6dcd6f742', -50, 'Split into 1 new sub-batch(es)', '2026-07-29 07:13:50.481925+00', 'e18b3927-87a9-4dcc-8d59-148461504a02'),
	('81ac9e50-7b8d-49e3-8de8-b8b073c35c96', 'efe5355a-37b1-4581-8c6d-36f979afe128', -5, 'Seeds consumed in quality test (test_id: 633e1b0f-d273-47a2-9376-035ae7b35a4e)', '2026-07-29 07:14:17.913223+00', 'e18b3927-87a9-4dcc-8d59-148461504a02');


--
-- Data for Name: collection_audio; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE SET; Schema: auth; Owner: supabase_auth_admin
--

SELECT pg_catalog.setval('"auth"."refresh_tokens_id_seq"', 7, true);


--
-- Name: ibra_regions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"public"."ibra_regions_id_seq"', 89, true);


--
-- Name: hooks_id_seq; Type: SEQUENCE SET; Schema: supabase_functions; Owner: supabase_functions_admin
--

SELECT pg_catalog.setval('"supabase_functions"."hooks_id_seq"', 1, false);


--
-- PostgreSQL database dump complete
--

RESET ALL;


-- automatically run the load ibra regions function
SELECT load_ibra7_regions_paginated();
