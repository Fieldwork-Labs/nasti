-- This is so that for merged batches, the collection_id can be null
-- and the batch_merges table and batch_lineage_to_collections view can be used to track the source batches and their collections
ALTER TABLE public.batches 
ALTER COLUMN collection_id DROP NOT NULL;