-- Add new columns to batches table
ALTER TABLE batches
  ADD COLUMN code TEXT;

-- Create indexes
CREATE INDEX idx_batches_code ON batches(code);
