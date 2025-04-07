SET session_replication_role = replica;

--
-- PostgreSQL database dump
--

-- Dumped from database version 15.6
-- Dumped by pg_dump version 15.8

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
	('00000000-0000-0000-0000-000000000000', 'db47a359-4510-47db-8f0e-1a6cb8919af2', 'authenticated', 'authenticated', 'chid@test.com', '$2a$10$GFdquD6KDwdz76bHrpaOleRGl.iUGhUB/iJvp5jXKwqR3n9/2Oqm2', '2025-01-13 03:47:14.582268+00', NULL, '', NULL, '', NULL, '', '', NULL, '2025-03-24 07:59:17.235226+00', '{"provider": "email", "providers": ["email"]}', '{}', NULL, '2025-01-13 03:47:14.561101+00', '2025-04-03 06:13:43.653978+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false),
	('00000000-0000-0000-0000-000000000000', '94765611-1f91-4164-8b61-9a5bcce7b4c1', 'authenticated', 'authenticated', 'chid@fieldworklabs.xyz', '$2a$10$lQuhpa7BXxiKsgRjboKyruIDMcoHrr0x2t1px5SCrYrglcs.9aNwW', '2025-01-28 06:04:11.895335+00', NULL, '', NULL, 'bf13a5ae4222458ee9b0617d7915725082104a546e1faef71ff7040a', '2025-02-20 12:01:46.55976+00', '', '', NULL, '2025-02-24 02:23:52.713947+00', '{"provider": "email", "providers": ["email"]}', '{"name": "Chid FWL"}', NULL, '2025-01-28 06:04:11.878151+00', '2025-03-05 07:01:46.375946+00', NULL, NULL, '', '', NULL, '', 0, '2125-02-09 07:01:46.375727+00', '', NULL, false, NULL, false);


--
-- Data for Name: identities; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."identities" ("provider_id", "user_id", "identity_data", "provider", "last_sign_in_at", "created_at", "updated_at", "id") VALUES
	('db47a359-4510-47db-8f0e-1a6cb8919af2', 'db47a359-4510-47db-8f0e-1a6cb8919af2', '{"sub": "db47a359-4510-47db-8f0e-1a6cb8919af2", "email": "chid@test.com", "email_verified": false, "phone_verified": false}', 'email', '2025-01-13 03:47:14.568946+00', '2025-01-13 03:47:14.568997+00', '2025-01-13 03:47:14.568997+00', 'e97334dd-6b23-4e2a-a940-6da36559a88a'),
	('94765611-1f91-4164-8b61-9a5bcce7b4c1', '94765611-1f91-4164-8b61-9a5bcce7b4c1', '{"sub": "94765611-1f91-4164-8b61-9a5bcce7b4c1", "email": "chid@fieldworklabs.xyz", "email_verified": false, "phone_verified": false}', 'email', '2025-01-28 06:04:11.89273+00', '2025-01-28 06:04:11.892793+00', '2025-01-28 06:04:11.892793+00', 'b9d8649c-d27b-4ff3-a18d-31bdf1528e28');


--
-- Data for Name: instances; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--


--
-- Data for Name: collection_photo; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."collection_photo" ("id", "collection_id", "url", "caption", "uploaded_at") VALUES
	('4a5bcca7-c790-4265-b9f7-ae2877381e09', 'bb366983-33bb-4371-afa9-94a83b4f1890', '33db6b9c-2920-4a36-b970-0d399d1f3a66/collections/bb366983-33bb-4371-afa9-94a83b4f1890/4a5bcca7-c790-4265-b9f7-ae2877381e09.jpg', NULL, '2025-04-01 09:13:10.615219+00'),
	('23976f93-7a0c-4b9e-800b-974b7b25fcdf', 'bb366983-33bb-4371-afa9-94a83b4f1890', '33db6b9c-2920-4a36-b970-0d399d1f3a66/collections/bb366983-33bb-4371-afa9-94a83b4f1890/23976f93-7a0c-4b9e-800b-974b7b25fcdf.jpg', NULL, '2025-04-01 09:13:10.618236+00');


--
-- Data for Name: invitation; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."invitation" ("id", "email", "organisation_id", "invited_by", "token", "created_at", "expires_at", "accepted_at", "name", "organisation_name") VALUES
	('912b34b8-0750-4717-86c9-a2d4c67d6ef4', 'chid@fieldworklabs.xyz', '33db6b9c-2920-4a36-b970-0d399d1f3a66', 'db47a359-4510-47db-8f0e-1a6cb8919af2', 'fd610430-4593-45e2-b841-0f9d250cafb5', '2025-01-28 00:59:12.37+00', '2025-02-04 00:59:12.358+00', '2025-01-28 06:04:11.919+00', 'Chid FWL', NULL),
	('de5f7645-d1f5-4021-9421-0263b16be81f', 'simone.pedrini@curtin.edu.au', '33db6b9c-2920-4a36-b970-0d399d1f3a66', 'db47a359-4510-47db-8f0e-1a6cb8919af2', '9f18f110-c737-4a00-af2e-190570843108', '2025-02-20 13:56:25.208+00', '2025-02-27 13:56:25.18+00', NULL, 'Simone Pedrini', NULL),
	('a15f6e52-e7e0-4df3-9c8e-d5f97a3056eb', 'chid@talisman.xyz', '33db6b9c-2920-4a36-b970-0d399d1f3a66', 'db47a359-4510-47db-8f0e-1a6cb8919af2', '0a59fba2-404a-410d-a4fd-c930e1323b35', '2025-02-20 14:08:55.305+00', '2025-02-27 14:08:55.252+00', NULL, 'Chid talisman', NULL);


--
-- Data for Name: org_user; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."org_user" ("id", "organisation_id", "user_id", "role", "joined_at", "is_active") VALUES
	('249b2f85-aa46-4b2b-a088-cce7df86413c', '33db6b9c-2920-4a36-b970-0d399d1f3a66', 'db47a359-4510-47db-8f0e-1a6cb8919af2', 'Admin', '2025-01-13 03:49:07.868709+00', true),
	('dc2aa209-a569-45bd-badc-7142397a9509', '33db6b9c-2920-4a36-b970-0d399d1f3a66', '94765611-1f91-4164-8b61-9a5bcce7b4c1', 'Member', '2025-01-28 06:04:11.909341+00', false);


--
-- Data for Name: spatial_ref_sys; Type: TABLE DATA; Schema: public; Owner: supabase_admin
--



--
-- Data for Name: trip_member; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."trip_member" ("id", "trip_id", "user_id", "role", "joined_at") VALUES
	('543519f3-1bf2-46d4-aede-79ec4cc7d29b', '0b7edd50-dbf6-40ab-9871-49c85f2d7ed8', 'db47a359-4510-47db-8f0e-1a6cb8919af2', 'Member', '2025-01-22 13:24:18+00'),
	('16bd784b-4eae-4c3e-9cd3-ac7643abff3d', 'cd9aa864-3bae-43d9-af5a-2e635a5bd640', '94765611-1f91-4164-8b61-9a5bcce7b4c1', 'Member', '2025-01-28 08:46:19+00'),
	('8a70a2b4-ed97-4258-ba77-88ee883f9063', 'cd9aa864-3bae-43d9-af5a-2e635a5bd640', 'db47a359-4510-47db-8f0e-1a6cb8919af2', 'Member', '2025-01-28 08:46:19+00'),
	('bf39076d-faa5-434f-8666-d47fb9f868fb', '8159c03a-ad97-417a-9921-eb3a407321f2', '94765611-1f91-4164-8b61-9a5bcce7b4c1', 'Member', '2025-01-28 08:48:40+00'),
	('ded7ad09-b851-4e10-9456-4b6e0d0e3e5e', '8159c03a-ad97-417a-9921-eb3a407321f2', 'db47a359-4510-47db-8f0e-1a6cb8919af2', 'Member', '2025-01-28 08:48:40+00'),
	('3f224036-a12f-49f8-9575-f7fe39ac32a9', '0b7edd50-dbf6-40ab-9871-49c85f2d7ed8', '94765611-1f91-4164-8b61-9a5bcce7b4c1', 'Member', '2025-02-20 14:06:12+00'),
	('05730a3e-822d-4c2a-a072-f896842906c3', '77df186f-3080-4a5e-94c9-62e613ae91bd', 'db47a359-4510-47db-8f0e-1a6cb8919af2', 'Member', '2025-03-19 07:07:59+00'),
	('2d57938d-cc21-447b-9390-8d38218d45d2', '54cc3230-b461-44fb-9d78-b6b8e907fc2c', 'db47a359-4510-47db-8f0e-1a6cb8919af2', 'Member', '2025-03-20 08:35:05+00');


--
-- Data for Name: trip_species; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."trip_species" ("id", "trip_id", "species_id") VALUES
	('672d7d55-4e61-42d4-836d-c1ddad2682eb', '8159c03a-ad97-417a-9921-eb3a407321f2', 'b19ef229-97e8-444d-9447-b4313dc22505'),
	('96d4c2d0-f24b-40f6-b7b7-4d1488ad32b6', '8159c03a-ad97-417a-9921-eb3a407321f2', '3aab857b-5ce5-454e-a126-e56d575eb8ff'),
	('392b6120-f0a4-4149-9505-19de66899b8b', '8159c03a-ad97-417a-9921-eb3a407321f2', '04e1ecec-91e4-4f89-91b5-3c9e7a0a1dc1'),
	('b26d5bdc-d679-4391-aaec-467bd49d2e16', '0b7edd50-dbf6-40ab-9871-49c85f2d7ed8', '3aab857b-5ce5-454e-a126-e56d575eb8ff'),
	('f0e2b797-d183-4b01-bf2b-a2be1d52993e', '0b7edd50-dbf6-40ab-9871-49c85f2d7ed8', '876e3644-116b-4e43-8645-30259da124b3'),
	('b28daf5e-721a-4b39-91e2-78a388374d55', '0b7edd50-dbf6-40ab-9871-49c85f2d7ed8', '1023431b-f9cb-4ebd-afe1-e9debe873564'),
	('568e7be4-5f3f-4d4c-b120-274ad3ef20c9', '0b7edd50-dbf6-40ab-9871-49c85f2d7ed8', '597fea82-a8cd-4e0d-98ef-f3ae6126e669'),
	('208078bd-37ad-45a4-a880-39b02f268732', '0b7edd50-dbf6-40ab-9871-49c85f2d7ed8', '7e28de75-d850-4957-8ed0-91662e03f074'),
	('5ed9b593-216c-4419-be38-0dec94f1c060', '0b7edd50-dbf6-40ab-9871-49c85f2d7ed8', '96418526-e942-4280-9774-4b7749cdb40c'),
	('807331e3-2955-4a02-8a68-0b022be6ea07', 'cd9aa864-3bae-43d9-af5a-2e635a5bd640', '3ef49a8c-c020-4418-b3ef-9efbc9a80d57'),
	('7880cc25-e407-4309-baf0-3bc4e44cee39', 'cd9aa864-3bae-43d9-af5a-2e635a5bd640', '1b31f525-3397-434f-82e6-73ad2e6b9ac3'),
	('4f7bd4cf-10a3-4404-bc4b-aeb756e91b52', 'cd9aa864-3bae-43d9-af5a-2e635a5bd640', 'a1f7381f-efed-4c9e-ac8a-84f29f1a61ea'),
	('26362364-714e-4c10-957b-c34c93c8f00f', '8159c03a-ad97-417a-9921-eb3a407321f2', '6cc28dea-810a-4985-887c-bcae978c9a8f'),
	('4d3952b6-3c7a-4f76-92b6-53cee55977a3', '8159c03a-ad97-417a-9921-eb3a407321f2', '174e3e28-2882-476f-9c1c-7ac2336a5694'),
	('5b76fcb9-a1ea-4623-89b1-d5fcadea7db0', '0b7edd50-dbf6-40ab-9871-49c85f2d7ed8', '989b7e32-a3ec-4d47-97df-211080562770'),
	('f8c64a7b-cc97-4c97-9e02-8d49549551fd', '0b7edd50-dbf6-40ab-9871-49c85f2d7ed8', 'dc55a5a2-bed9-4c83-b208-d357761072fb'),
	('d570ebf1-a7e4-4eff-b3c4-93b518544917', '0b7edd50-dbf6-40ab-9871-49c85f2d7ed8', '55f40b7a-4d5e-4c7b-8e62-fcfc365a7e82'),
	('598859cd-e6c9-4bc9-b2f2-1b06d3426858', '77df186f-3080-4a5e-94c9-62e613ae91bd', 'a6868b31-61ba-4be1-832b-986801223d75'),
	('9d5ba3c7-6c2f-4b7a-91a3-c9e141a6863f', '0dca894e-c256-4bbd-8687-e341a71eec77', 'a6868b31-61ba-4be1-832b-986801223d75'),
	('c3e8ac41-2ccd-4ca0-8776-3e24acdd8870', '8159c03a-ad97-417a-9921-eb3a407321f2', '5b877d8f-1626-43a6-aa47-956abf1cfbb5');


--
-- Data for Name: buckets; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id") VALUES
	('collection-photos', 'collection-photos', NULL, '2025-02-26 05:30:06.068868+00', '2025-02-26 05:30:06.068868+00', false, false, 20971520, '{image/*}', NULL);


--
-- Data for Name: objects; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

INSERT INTO "storage"."objects" ("id", "bucket_id", "name", "owner", "created_at", "updated_at", "last_accessed_at", "metadata", "version", "owner_id", "user_metadata") VALUES
	('0e787f0e-303a-4eeb-a88a-000c61a7f2f0', 'collection-photos', '33db6b9c-2920-4a36-b970-0d399d1f3a66/collections/33cb5e75-ab01-4be7-832a-846c5e1833c3/b26aea95-8c48-4178-99c3-30c561290179.jpg', 'db47a359-4510-47db-8f0e-1a6cb8919af2', '2025-02-26 06:32:12.740914+00', '2025-02-26 06:32:12.740914+00', '2025-02-26 06:32:12.740914+00', '{"eTag": "\"7c8a3b166a6a1a716c4d87aae9306e04\"", "size": 462451, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2025-02-26T06:32:12.707Z", "contentLength": 462451, "httpStatusCode": 200}', '319ca85d-472a-4b70-9bd7-f53ea8ec3d43', 'db47a359-4510-47db-8f0e-1a6cb8919af2', '{}'),
	('d3ba09c2-99e5-4ec8-8d81-4fe339f0ee13', 'collection-photos', '33db6b9c-2920-4a36-b970-0d399d1f3a66/collections/bb366983-33bb-4371-afa9-94a83b4f1890/23976f93-7a0c-4b9e-800b-974b7b25fcdf.jpg', 'db47a359-4510-47db-8f0e-1a6cb8919af2', '2025-04-01 09:13:10.570811+00', '2025-04-01 09:13:10.570811+00', '2025-04-01 09:13:10.570811+00', '{"eTag": "\"60bae5d37d7211421b7bf1c4529e15f0\"", "size": 443269, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2025-04-01T09:13:10.560Z", "contentLength": 443269, "httpStatusCode": 200}', '938b245c-5125-4649-8a39-be1592487fed', 'db47a359-4510-47db-8f0e-1a6cb8919af2', '{"photoId": "23976f93-7a0c-4b9e-800b-974b7b25fcdf", "collectionId": "bb366983-33bb-4371-afa9-94a83b4f1890"}'),
	('3adc3936-a486-416c-b27f-9cc55e6d18de', 'collection-photos', '33db6b9c-2920-4a36-b970-0d399d1f3a66/collections/bb366983-33bb-4371-afa9-94a83b4f1890/4a5bcca7-c790-4265-b9f7-ae2877381e09.jpg', 'db47a359-4510-47db-8f0e-1a6cb8919af2', '2025-04-01 09:13:10.570431+00', '2025-04-01 09:13:10.570431+00', '2025-04-01 09:13:10.570431+00', '{"eTag": "\"ca9f17f2ac4dcb6a3ca4791dd61264d5\"", "size": 408963, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2025-04-01T09:13:10.560Z", "contentLength": 408963, "httpStatusCode": 200}', '99d6ae31-fb2f-4d69-b42e-a5a4d4db82ac', 'db47a359-4510-47db-8f0e-1a6cb8919af2', '{"photoId": "4a5bcca7-c790-4265-b9f7-ae2877381e09", "collectionId": "bb366983-33bb-4371-afa9-94a83b4f1890"}'),
	('28c23d1f-8696-404c-9ae1-285e2c6693fd', 'collection-photos', '33db6b9c-2920-4a36-b970-0d399d1f3a66/collections/37f819a2-2af5-4b6e-b285-fbf28bb56b3b/abace436-8a7f-47ed-a0be-70ba984e6264.jpg', 'db47a359-4510-47db-8f0e-1a6cb8919af2', '2025-02-26 13:21:15.672199+00', '2025-02-26 13:21:15.672199+00', '2025-02-26 13:21:15.672199+00', '{"eTag": "\"79e53b8a750755e926e764b0bea4e259\"", "size": 14508536, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2025-02-26T13:21:15.284Z", "contentLength": 14508536, "httpStatusCode": 200}', 'c94e3ce2-6fce-49be-9b83-a4908da5aaee', 'db47a359-4510-47db-8f0e-1a6cb8919af2', '{}'),
	('e15dbddd-4f8c-4c64-865f-7c3b812522cc', 'collection-photos', '33db6b9c-2920-4a36-b970-0d399d1f3a66/collections/37f819a2-2af5-4b6e-b285-fbf28bb56b3b/63796edc-62e1-4443-a92b-929b9afa984e.jpg', 'db47a359-4510-47db-8f0e-1a6cb8919af2', '2025-02-26 13:21:15.706908+00', '2025-02-26 13:21:15.706908+00', '2025-02-26 13:21:15.706908+00', '{"eTag": "\"c66fbe0e920272fd21dac55cb37c0176\"", "size": 16328259, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2025-02-26T13:21:15.284Z", "contentLength": 16328259, "httpStatusCode": 200}', '9484c7e3-55ab-4f0b-a606-6b226bcbf776', 'db47a359-4510-47db-8f0e-1a6cb8919af2', '{}'),
	('88bf00d6-0ca5-4984-8e9b-cec31e0a0610', 'collection-photos', '33db6b9c-2920-4a36-b970-0d399d1f3a66/collections/37f819a2-2af5-4b6e-b285-fbf28bb56b3b/ac84241a-b3b4-4630-a792-ae6ebb016438.jpg', 'db47a359-4510-47db-8f0e-1a6cb8919af2', '2025-02-26 13:21:15.729864+00', '2025-02-26 13:21:15.729864+00', '2025-02-26 13:21:15.729864+00', '{"eTag": "\"c2e8eaaf2919b019d7213c2c637fbb99\"", "size": 16779995, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2025-02-26T13:21:15.284Z", "contentLength": 16779995, "httpStatusCode": 200}', '057b4545-1e16-4392-bf34-854f7e9fb12f', 'db47a359-4510-47db-8f0e-1a6cb8919af2', '{}'),
	('13077d66-7ea6-49d2-bfbc-2191eb34b979', 'collection-photos', '33db6b9c-2920-4a36-b970-0d399d1f3a66/collections/37f819a2-2af5-4b6e-b285-fbf28bb56b3b/74264419-b3d3-4200-97ce-f2fd7e876dcf.jpg', 'db47a359-4510-47db-8f0e-1a6cb8919af2', '2025-02-26 13:21:15.760109+00', '2025-02-26 13:21:15.760109+00', '2025-02-26 13:21:15.760109+00', '{"eTag": "\"cc571325203671ffc68f01686fe4bd51\"", "size": 18024653, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2025-02-26T13:21:15.284Z", "contentLength": 18024653, "httpStatusCode": 200}', 'bf1ba490-b47e-44fa-813f-05f08a679317', 'db47a359-4510-47db-8f0e-1a6cb8919af2', '{}'),
	('54d68d8f-eacc-45b5-a150-3636cfacd571', 'collection-photos', '33db6b9c-2920-4a36-b970-0d399d1f3a66/collections/37f819a2-2af5-4b6e-b285-fbf28bb56b3b/5d577932-9941-468b-b550-573c3962cdf3.jpg', 'db47a359-4510-47db-8f0e-1a6cb8919af2', '2025-02-26 13:21:15.77456+00', '2025-02-26 13:21:15.77456+00', '2025-02-26 13:21:15.77456+00', '{"eTag": "\"465ba60ff967225d10d090c04241245f\"", "size": 18669622, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2025-02-26T13:21:15.284Z", "contentLength": 18669622, "httpStatusCode": 200}', '6e1c869a-7dee-413b-a018-62212dccee88', 'db47a359-4510-47db-8f0e-1a6cb8919af2', '{}');


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
-- Data for Name: secrets; Type: TABLE DATA; Schema: vault; Owner: supabase_admin
--



--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE SET; Schema: auth; Owner: supabase_auth_admin
--

SELECT pg_catalog.setval('"auth"."refresh_tokens_id_seq"', 558148, true);


--
-- Name: key_key_id_seq; Type: SEQUENCE SET; Schema: pgsodium; Owner: supabase_admin
--

SELECT pg_catalog.setval('"pgsodium"."key_key_id_seq"', 1, false);


--
-- Name: hooks_id_seq; Type: SEQUENCE SET; Schema: supabase_functions; Owner: supabase_functions_admin
--

SELECT pg_catalog.setval('"supabase_functions"."hooks_id_seq"', 1, false);


--
-- PostgreSQL database dump complete
--

RESET ALL;
