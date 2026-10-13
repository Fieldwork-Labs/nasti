-- Supabase has logical replication enabled by default.
-- Create the PowerSync role manually with a secure password, then run this
-- migration to grant read access and create the replication publication:
--
-- CREATE ROLE powersync_role WITH REPLICATION BYPASSRLS LOGIN PASSWORD '<secure-password>';

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
