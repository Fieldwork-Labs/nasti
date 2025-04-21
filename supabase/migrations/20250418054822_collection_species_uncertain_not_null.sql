-- First set any NULL values to false
UPDATE public.collection
SET species_uncertain = false
WHERE species_uncertain IS NULL;

-- Then add the NOT NULL constraint
ALTER TABLE public.collection
ALTER COLUMN species_uncertain SET NOT NULL;