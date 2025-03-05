alter table "public"."org_user" add column "is_active" boolean NOT NULL default true;

CREATE INDEX idx_org_user_is_active ON public.org_user (is_active);