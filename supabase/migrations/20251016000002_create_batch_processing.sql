-- Create enums
CREATE TYPE batch_process_type AS ENUM ('clean', 'sort', 'coat', 'treat', 'other');
CREATE TYPE batch_quality AS ENUM ('ORG', 'HQ', 'MQ', 'LQ');

-- Create validation function for process array
CREATE OR REPLACE FUNCTION validate_process_array(processes JSONB)
RETURNS BOOLEAN AS $$
DECLARE
  valid_processes TEXT[] := ARRAY['clean', 'sort', 'coat', 'treat', 'other'];
  process_value TEXT;
BEGIN
  -- Check if processes is an array
  IF jsonb_typeof(processes) != 'array' THEN
    RETURN FALSE;
  END IF;

  -- Check if array is not empty
  IF jsonb_array_length(processes) = 0 THEN
    RETURN FALSE;
  END IF;

  -- Check each element in the array
  FOR process_value IN SELECT jsonb_array_elements_text(processes)
  LOOP
    IF NOT (process_value = ANY(valid_processes)) THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create batch_processing table
CREATE TABLE batch_processing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  input_batch_id UUID REFERENCES batches(id) ON DELETE RESTRICT,
  output_batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE RESTRICT,
  process JSONB NOT NULL CHECK (validate_process_array(process)),
  quality_assessment batch_quality NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  organisation_id UUID NOT NULL REFERENCES organisation(id)
);

-- Create indexes
CREATE INDEX idx_batch_processing_input_batch ON batch_processing(input_batch_id);
CREATE INDEX idx_batch_processing_output_batch ON batch_processing(output_batch_id);

-- Enable RLS
ALTER TABLE batch_processing ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY batch_processing_select_policy ON batch_processing
  FOR SELECT USING (organisation_id IN (
    SELECT organisation_id FROM org_user WHERE user_id = auth.uid()
  ));

CREATE POLICY batch_processing_insert_policy ON batch_processing
  FOR INSERT WITH CHECK (organisation_id IN (
    SELECT organisation_id FROM org_user WHERE user_id = auth.uid()
  ));
