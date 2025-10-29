-- Create enums
CREATE TYPE batch_process_type AS ENUM ('clean', 'sort', 'coat', 'treat', 'other');
CREATE TYPE batch_quality AS ENUM ('ORG', 'HQ', 'MQ', 'LQ');

-- Create batch_processing table
CREATE TABLE batch_processing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  input_batch_id UUID REFERENCES batches(id) ON DELETE RESTRICT,
  output_batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE RESTRICT,
  process batch_process_type NOT NULL,
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
