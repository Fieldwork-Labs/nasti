-- Supabase has logical replication enabled by default.
-- Keep credentials outside migrations. Create a credential-free placeholder
-- so fresh databases can apply grants; deployment must enable LOGIN and set a
-- secure password through environment-managed provisioning.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'powersync_role') THEN
    CREATE ROLE powersync_role WITH REPLICATION BYPASSRLS NOLOGIN;
  END IF;
END
$$;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO powersync_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO powersync_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'powersync'
  ) THEN
    CREATE PUBLICATION powersync FOR ALL TABLES;
  END IF;
END
$$;
