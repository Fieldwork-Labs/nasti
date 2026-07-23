-- Enable RLS on scouting_notes tables (policies were created in
-- 20251222035436_scouting_notes.sql but RLS was never enabled, leaving the
-- policies inert).
ALTER TABLE public.scouting_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scouting_notes_photos ENABLE ROW LEVEL SECURITY;

-- Switch views from SECURITY DEFINER (Postgres default) to SECURITY INVOKER so
-- that the querying user's RLS policies apply, not the view owner's.
ALTER VIEW public.obfuscated_collection_data SET (security_invoker = true);
ALTER VIEW public.active_batches SET (security_invoker = true);
ALTER VIEW public.active_sub_batches SET (security_invoker = true);
ALTER VIEW public.current_batch_custody SET (security_invoker = true);
ALTER VIEW public.batch_current_weight SET (security_invoker = true);
ALTER VIEW public.current_batch_storage SET (security_invoker = true);
ALTER VIEW public.sub_batch_current_weight SET (security_invoker = true);
ALTER VIEW public.batch_lineage_to_collections SET (security_invoker = true);
