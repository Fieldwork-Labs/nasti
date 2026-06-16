-- Step 1: Drop plants_sampled_estimate
ALTER TABLE public.collection
  DROP COLUMN plants_sampled_estimate;

-- Step 2: Add new columns (note: numeric, not number)
ALTER TABLE public.collection
  ADD COLUMN amount_units text null,
  ADD COLUMN amount_quantity numeric null;

-- Step 3: Migrate data from amount_description
UPDATE public.collection
SET
  amount_quantity = CASE
    WHEN
      array_length(string_to_array(trim(amount_description), ' '), 1) >= 2
      AND trim(split_part(trim(amount_description), ' ', 1)) ~ '^\d+(\.\d+)?$'
    THEN trim(split_part(trim(amount_description), ' ', 1))::numeric
    ELSE null
  END,
  amount_units = CASE
    WHEN
      array_length(string_to_array(trim(amount_description), ' '), 1) >= 2
      AND trim(split_part(trim(amount_description), ' ', 1)) ~ '^\d+(\.\d+)?$'
    THEN trim(split_part(trim(amount_description), ' ', 2))
    ELSE null
  END
WHERE amount_description IS NOT NULL;

-- Step 4: Drop amount_description
ALTER TABLE public.collection
  DROP COLUMN amount_description;