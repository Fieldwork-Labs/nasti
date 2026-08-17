\set ON_ERROR_STOP on

-- Local UAT identities for the testing-provider workflow.
--
-- This script is intentionally local-only. It creates deterministic records so
-- it can be rerun after partial setup without producing duplicate users.
-- Every login uses the password: UatPassword123!

begin;

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'a1000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'uat-a-admin@example.com',
    extensions.crypt('UatPassword123!', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"UAT A Admin"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a1000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'uat-a-member@example.com',
    extensions.crypt('UatPassword123!', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"UAT A Inventory Member"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'b1000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'uat-b-admin@example.com',
    extensions.crypt('UatPassword123!', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"UAT B Admin"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'c1000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'uat-c-admin@example.com',
    extensions.crypt('UatPassword123!', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"UAT C Admin"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'd1000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'uat-d-admin@example.com',
    extensions.crypt('UatPassword123!', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"UAT D Admin"}'::jsonb,
    now(),
    now()
  )
on conflict (id) do update set
  email = excluded.email,
  encrypted_password = excluded.encrypted_password,
  email_confirmed_at = excluded.email_confirmed_at,
  raw_app_meta_data = excluded.raw_app_meta_data,
  raw_user_meta_data = excluded.raw_user_meta_data,
  updated_at = now(),
  deleted_at = null,
  banned_until = null;

-- GoTrue scans these legacy token columns as strings during password login.
-- The auth table permits NULL, but the local Auth service does not.
update auth.users
set
  confirmation_token = coalesce(confirmation_token, ''),
  recovery_token = coalesce(recovery_token, ''),
  email_change_token_new = coalesce(email_change_token_new, ''),
  email_change = coalesce(email_change, ''),
  phone_change = coalesce(phone_change, ''),
  phone_change_token = coalesce(phone_change_token, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  reauthentication_token = coalesce(reauthentication_token, '')
where id in (
  'a1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000002',
  'b1000000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000001'
);

insert into auth.identities (
  id,
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
values
  (
    'a3000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    '{"sub":"a1000000-0000-0000-0000-000000000001","email":"uat-a-admin@example.com","email_verified":true,"phone_verified":false}'::jsonb,
    'email',
    now(),
    now(),
    now()
  ),
  (
    'a3000000-0000-0000-0000-000000000002',
    'a1000000-0000-0000-0000-000000000002',
    'a1000000-0000-0000-0000-000000000002',
    '{"sub":"a1000000-0000-0000-0000-000000000002","email":"uat-a-member@example.com","email_verified":true,"phone_verified":false}'::jsonb,
    'email',
    now(),
    now(),
    now()
  ),
  (
    'b3000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000001',
    '{"sub":"b1000000-0000-0000-0000-000000000001","email":"uat-b-admin@example.com","email_verified":true,"phone_verified":false}'::jsonb,
    'email',
    now(),
    now(),
    now()
  ),
  (
    'c3000000-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000001',
    '{"sub":"c1000000-0000-0000-0000-000000000001","email":"uat-c-admin@example.com","email_verified":true,"phone_verified":false}'::jsonb,
    'email',
    now(),
    now(),
    now()
  ),
  (
    'd3000000-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-000000000001',
    '{"sub":"d1000000-0000-0000-0000-000000000001","email":"uat-d-admin@example.com","email_verified":true,"phone_verified":false}'::jsonb,
    'email',
    now(),
    now(),
    now()
  )
on conflict (id) do update set
  provider_id = excluded.provider_id,
  user_id = excluded.user_id,
  identity_data = excluded.identity_data,
  updated_at = now();

insert into public.organisation (
  id,
  name,
  owner_id,
  contact_name,
  contact_email,
  is_testing_provider
)
values
  (
    'a2000000-0000-0000-0000-000000000001',
    'UAT A - Seed Owner',
    'a1000000-0000-0000-0000-000000000001',
    'UAT A Admin',
    'uat-a-admin@example.com',
    false
  ),
  (
    'b2000000-0000-0000-0000-000000000001',
    'UAT B - Testing Provider',
    'b1000000-0000-0000-0000-000000000001',
    'UAT B Admin',
    'uat-b-admin@example.com',
    true
  ),
  (
    'c2000000-0000-0000-0000-000000000001',
    'UAT C - Testing Provider',
    'c1000000-0000-0000-0000-000000000001',
    'UAT C Admin',
    'uat-c-admin@example.com',
    true
  ),
  (
    'd2000000-0000-0000-0000-000000000001',
    'UAT D - Non-provider',
    'd1000000-0000-0000-0000-000000000001',
    'UAT D Admin',
    'uat-d-admin@example.com',
    false
  )
on conflict (id) do update set
  name = excluded.name,
  owner_id = excluded.owner_id,
  contact_name = excluded.contact_name,
  contact_email = excluded.contact_email,
  is_testing_provider = excluded.is_testing_provider;

insert into public.org_user (
  id,
  organisation_id,
  user_id,
  role,
  is_active,
  permissions
)
values
  (
    'a4000000-0000-0000-0000-000000000001',
    'a2000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    'Admin',
    true,
    '{}'::public.org_permission[]
  ),
  (
    'a4000000-0000-0000-0000-000000000002',
    'a2000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000002',
    'Member',
    true,
    array['inventory']::public.org_permission[]
  ),
  (
    'b4000000-0000-0000-0000-000000000001',
    'b2000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000001',
    'Admin',
    true,
    '{}'::public.org_permission[]
  ),
  (
    'c4000000-0000-0000-0000-000000000001',
    'c2000000-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000001',
    'Admin',
    true,
    '{}'::public.org_permission[]
  ),
  (
    'd4000000-0000-0000-0000-000000000001',
    'd2000000-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-000000000001',
    'Admin',
    true,
    '{}'::public.org_permission[]
  )
on conflict (user_id) do update set
  organisation_id = excluded.organisation_id,
  role = excluded.role,
  is_active = excluded.is_active,
  permissions = excluded.permissions;

commit;

\echo ''
\echo 'UAT organisations are ready. All accounts use: UatPassword123!'
\echo ''

select
  organisation.name as organisation,
  organisation.is_testing_provider as provider,
  users.email,
  membership.role,
  membership.permissions
from public.org_user membership
inner join public.organisation organisation
  on organisation.id = membership.organisation_id
inner join auth.users users on users.id = membership.user_id
where organisation.id in (
  'a2000000-0000-0000-0000-000000000001',
  'b2000000-0000-0000-0000-000000000001',
  'c2000000-0000-0000-0000-000000000001',
  'd2000000-0000-0000-0000-000000000001'
)
order by organisation.name, users.email;
