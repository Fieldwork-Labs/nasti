-- Add role column to invitation table
alter table "public"."invitation"
add column "role" "public"."org_user_types" not null default 'Member';
