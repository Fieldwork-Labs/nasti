-- Legacy migration-history marker.
--
-- This version was previously applied to deployed databases. Its batch
-- treatment function was replaced by the later sub-batch inventory workflow.
-- Keep the version as a no-op so existing Supabase preview histories remain
-- reconcilable without restoring obsolete function definitions.

