ALTER TABLE public.collection
ADD COLUMN duration interval;

COMMENT ON COLUMN public.collection.duration IS 'How long the collection took, recorded as a duration for planning and budgeting.';
