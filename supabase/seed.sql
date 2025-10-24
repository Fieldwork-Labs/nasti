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
	('00000000-0000-0000-0000-000000000000', 'e18b3927-87a9-4dcc-8d59-148461504a02', 'authenticated', 'authenticated', 'chid@test.com', '$2a$10$.a23q31I.z5itRlBfPnfU.3ID9jyHESc8ZJ2rPoz5Olz.U99rw3A6', '2025-09-29 08:41:05.849984+00', '2025-09-29 08:39:40.031407+00', '', NULL, '', NULL, '', '', NULL, '2025-10-20 08:30:17.417131+00', '{"provider": "email", "providers": ["email"]}', '{"name": "Chid Gilovitz"}', NULL, '2025-09-29 08:39:39.934336+00', '2025-10-21 01:07:53.692784+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false);


--
-- Data for Name: identities; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."identities" ("provider_id", "user_id", "identity_data", "provider", "last_sign_in_at", "created_at", "updated_at", "id") VALUES
	('e18b3927-87a9-4dcc-8d59-148461504a02', 'e18b3927-87a9-4dcc-8d59-148461504a02', '{"sub": "e18b3927-87a9-4dcc-8d59-148461504a02", "email": "chid@test.com", "email_verified": false, "phone_verified": false}', 'email', '2025-09-29 08:39:40.011186+00', '2025-09-29 08:39:40.011254+00', '2025-09-29 08:39:40.011254+00', '291d419d-f139-4667-bacc-694d2b366ce3');



--
-- Data for Name: organisation; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."organisation" ("id", "name", "owner_id", "created_at", "contact_name", "contact_email", "contact_phone", "contact_address") VALUES
	('02aba5b9-6c46-406d-831a-4f51851599f2', 'Chid''s Org', 'e18b3927-87a9-4dcc-8d59-148461504a02', '2025-09-29 08:40:04+00', NULL, NULL, NULL, NULL);


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

INSERT INTO "public"."collection" ("id", "species_id", "species_uncertain", "field_name", "specimen_collected", "organisation_id", "location", "created_by", "created_at", "trip_id", "description", "weight_estimate_kg", "plants_sampled_estimate", "code") VALUES
	('f9c2b54c-58cc-434b-aae4-3e79e17f3b31', '9c5d25d7-a230-4591-8861-7e9d3a590f04', false, '', false, '02aba5b9-6c46-406d-831a-4f51851599f2', '0101000020E61000006DE7FBA9F1A25D4085EB51B81E1540C0', 'e18b3927-87a9-4dcc-8d59-148461504a02', '2025-09-29 09:40:55.681459+00', 'a2a3535f-1f84-4e65-957c-cdc544948d94', '', 1, 230, 'ALYSPGER-CO.MAL.25-1'),
	('7bf4d772-d79b-4b6d-8608-4b80a9cf314a', 'bbe4a97f-c05d-4cb6-b07b-560c1cbf305f', false, '', false, '02aba5b9-6c46-406d-831a-4f51851599f2', '0101000020E6100000031C967762A95C40CA08D12760CB3CC0', 'e18b3927-87a9-4dcc-8d59-148461504a02', '2025-09-29 09:39:18.702834+00', 'a2a3535f-1f84-4e65-957c-cdc544948d94', '-28.794435967000744, 114.64663495692373', 1, 10, 'DIPGER-CO.GES.25-1'),
	('50d59d29-0eed-4f79-acd6-2a62c995bc45', 'd2b02f1c-905e-46d0-a3e0-4b253d2a1349', false, '', false, '02aba5b9-6c46-406d-831a-4f51851599f2', '0101000020E610000002BC051214635E40D50968226CA83FC0', 'e18b3927-87a9-4dcc-8d59-148461504a02', '2025-09-29 08:47:18.690457+00', 'a2a3535f-1f84-4e65-957c-cdc544948d94', '', 1, 10, 'CHAUNC-CO.COO.25-1');



--
-- Data for Name: org_user; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."org_user" ("id", "organisation_id", "user_id", "role", "joined_at", "is_active") VALUES
	('c5062662-c316-4720-9339-6961e2fe7e7e', '02aba5b9-6c46-406d-831a-4f51851599f2', 'e18b3927-87a9-4dcc-8d59-148461504a02', 'Admin', '2025-09-29 08:40:26.888428+00', true);


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
-- Data for Name: buckets_analytics; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: iceberg_namespaces; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: iceberg_tables; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: objects; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: prefixes; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: s3_multipart_uploads; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: s3_multipart_uploads_parts; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: hooks; Type: TABLE DATA; Schema: supabase_functions; Owner: supabase_functions_admin
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
