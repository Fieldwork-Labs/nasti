-- Legacy migration-history marker.
--
-- This version was previously applied to deployed databases, then its schema
-- work was consolidated into later inventory migrations. Keep this no-op file
-- so Supabase preview databases can reconcile their existing history without
-- replaying the obsolete batch-processing schema on a fresh database.

