create type public.person_source_type as enum ('user', 'personnel');

create table public.personnel (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisation(id) on delete cascade,
  name text not null,
  email text null,
  job_role text null,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint personnel_name_not_blank check (length(trim(name)) > 0)
);

create table public.person (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisation(id) on delete cascade,
  source_type public.person_source_type not null,
  user_id uuid null references auth.users(id) on delete set null,
  personnel_id uuid null references public.personnel(id) on delete set null,
  display_name text not null,
  email text null,
  job_role text null,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint person_one_source check (
    (source_type = 'user' and user_id is not null and personnel_id is null)
    or (source_type = 'personnel' and personnel_id is not null and user_id is null)
  ),
  constraint person_display_name_not_blank check (length(trim(display_name)) > 0)
);

create unique index person_user_source_unique
  on public.person (organisation_id, user_id)
  where source_type = 'user' and user_id is not null;

create unique index person_personnel_source_unique
  on public.person (organisation_id, personnel_id)
  where source_type = 'personnel' and personnel_id is not null;

create index personnel_organisation_id_idx on public.personnel (organisation_id);
create index person_organisation_id_idx on public.person (organisation_id);

grant select on public.personnel, public.person to powersync_role;

comment on table public.person is
  'Sync-friendly person projection. User rows mirror auth.users email/raw_user_meta_data.name and org_user.is_active; personnel rows mirror personnel name/email/job_role/is_active. Keep the org_user, auth.users, and personnel sync triggers updated when mirrored fields change.';

alter table public.collection
  add column person_ids uuid[] not null default '{}'::uuid[];

alter table public.scouting_notes
  add column person_ids uuid[] not null default '{}'::uuid[];

create index collection_person_ids_idx on public.collection using gin (person_ids);
create index scouting_notes_person_ids_idx on public.scouting_notes using gin (person_ids);

create or replace function public.is_org_admin(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.org_user
    where organisation_id = org_id
      and user_id = auth.uid()
      and role = 'Admin'
      and is_active = true
  );
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger personnel_touch_updated_at
before update on public.personnel
for each row execute function public.touch_updated_at();

create trigger person_touch_updated_at
before update on public.person
for each row execute function public.touch_updated_at();

create or replace function public.upsert_person_for_org_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  user_email text;
  user_name text;
begin
  select
    u.email,
    coalesce(nullif(trim(u.raw_user_meta_data->>'name'), ''), u.email, 'Unknown person')
  into user_email, user_name
  from auth.users u
  where u.id = new.user_id;

  insert into public.person (
    organisation_id,
    source_type,
    user_id,
    display_name,
    email,
    is_active
  )
  values (
    new.organisation_id,
    'user',
    new.user_id,
    coalesce(user_name, 'Unknown person'),
    user_email,
    new.is_active
  )
  on conflict (organisation_id, user_id)
    where source_type = 'user' and user_id is not null
  do update set
    display_name = excluded.display_name,
    email = excluded.email,
    is_active = excluded.is_active,
    updated_at = now();

  return new;
end;
$$;

create trigger org_user_upsert_person
after insert or update of organisation_id, user_id, is_active on public.org_user
for each row execute function public.upsert_person_for_org_user();

create or replace function public.refresh_person_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  update public.person
  set
    display_name = coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), new.email, display_name),
    email = new.email,
    updated_at = now()
  where source_type = 'user'
    and user_id = new.id;

  return new;
end;
$$;

create trigger auth_user_refresh_person
after update of email, raw_user_meta_data on auth.users
for each row execute function public.refresh_person_for_auth_user();

create or replace function public.upsert_person_for_personnel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.person (
    organisation_id,
    source_type,
    personnel_id,
    display_name,
    email,
    job_role,
    is_active
  )
  values (
    new.organisation_id,
    'personnel',
    new.id,
    new.name,
    new.email,
    new.job_role,
    new.is_active
  )
  on conflict (organisation_id, personnel_id)
    where source_type = 'personnel' and personnel_id is not null
  do update set
    display_name = excluded.display_name,
    email = excluded.email,
    job_role = excluded.job_role,
    is_active = excluded.is_active,
    updated_at = now();

  return new;
end;
$$;

create trigger personnel_upsert_person
after insert or update of organisation_id, name, email, job_role, is_active on public.personnel
for each row execute function public.upsert_person_for_personnel();

insert into public.person (
  organisation_id,
  source_type,
  user_id,
  display_name,
  email,
  is_active,
  created_at,
  updated_at
)
select
  ou.organisation_id,
  'user',
  ou.user_id,
  coalesce(nullif(trim(u.raw_user_meta_data->>'name'), ''), u.email, 'Unknown person'),
  u.email,
  ou.is_active,
  coalesce(ou.joined_at, now()),
  now()
from public.org_user ou
join auth.users u on u.id = ou.user_id
on conflict (organisation_id, user_id)
  where source_type = 'user' and user_id is not null
do update set
  display_name = excluded.display_name,
  email = excluded.email,
  is_active = excluded.is_active,
  updated_at = now();

update public.collection c
set person_ids = array[p.id]::uuid[]
from public.person p
where c.created_by is not null
  and p.source_type = 'user'
  and p.user_id = c.created_by
  and p.organisation_id = c.organisation_id;

update public.scouting_notes sn
set person_ids = array[p.id]::uuid[]
from public.person p
where sn.created_by is not null
  and p.source_type = 'user'
  and p.user_id = sn.created_by
  and p.organisation_id = sn.organisation_id;

create or replace function public.validate_record_person_ids()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  invalid_count integer;
begin
  new.person_ids = coalesce(new.person_ids, '{}'::uuid[]);

  if cardinality(new.person_ids) = 0 then
    return new;
  end if;

  select count(*)
  into invalid_count
  from unnest(new.person_ids) person_id
  left join public.person p
    on p.id = person_id
    and p.organisation_id = new.organisation_id
  where p.id is null;

  if invalid_count > 0 then
    raise exception 'person_ids must reference people in the same organisation'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger collection_validate_person_ids
before insert or update of person_ids, organisation_id on public.collection
for each row execute function public.validate_record_person_ids();

create trigger scouting_notes_validate_person_ids
before insert or update of person_ids, organisation_id on public.scouting_notes
for each row execute function public.validate_record_person_ids();

alter table public.personnel enable row level security;
alter table public.person enable row level security;

create policy "Allow org users to select organisation personnel"
on public.personnel
for select
to authenticated
using (
  exists (
    select 1
    from public.org_user ou
    where ou.organisation_id = personnel.organisation_id
      and ou.user_id = auth.uid()
      and ou.is_active = true
  )
);

create policy "Allow admins to insert organisation personnel"
on public.personnel
for insert
to authenticated
with check (public.is_org_admin(organisation_id));

create policy "Allow admins to update organisation personnel"
on public.personnel
for update
to authenticated
using (public.is_org_admin(organisation_id))
with check (public.is_org_admin(organisation_id));

create policy "Allow org users to select organisation people"
on public.person
for select
to authenticated
using (
  exists (
    select 1
    from public.org_user ou
    where ou.organisation_id = person.organisation_id
      and ou.user_id = auth.uid()
      and ou.is_active = true
  )
);
