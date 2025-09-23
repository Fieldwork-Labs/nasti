-- Add the created_at column with default value and precision
ALTER TABLE public.batch_storage 
ADD COLUMN created_at timestamp(6) with time zone NOT NULL DEFAULT now();

-- Create an index on created_at for better sorting performance
CREATE INDEX idx_batch_storage_created_at ON public.batch_storage (created_at DESC);
