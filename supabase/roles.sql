-- Local development only: the Supabase CLI runs this before migrations on
-- `supabase start` / `supabase db reset`. It is never applied by `db push`.
-- In hosted projects, create powersync_role by hand with a secure password
-- (see 20260602000000_powersync.sql).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'powersync_role') THEN
    CREATE ROLE powersync_role WITH REPLICATION BYPASSRLS LOGIN PASSWORD 'powersync';
  END IF;
END
$$;
