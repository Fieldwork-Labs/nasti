CREATE EXTENSION IF NOT EXISTS http;

CREATE TABLE ibra_regions (
    id BIGSERIAL PRIMARY KEY,
    name TEXT,
    code TEXT,

    -- Different levels of detail
    geom_high GEOMETRY,      -- tolerance: 0.001 (zoom 10+)
    geom_medium GEOMETRY,    -- tolerance: 0.005 (zoom 5-9)
    geom_low GEOMETRY,       -- tolerance: 0.02  (zoom 0-4)
    
    properties JSONB, -- Store shapefile attributes
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create spatial index for performance
CREATE INDEX idx_ibra_regions_geom_high ON ibra_regions USING GIST (geom_high);
CREATE INDEX idx_ibra_regions_geom_medium ON ibra_regions USING GIST (geom_medium);
CREATE INDEX idx_ibra_regions_geom_low ON ibra_regions USING GIST (geom_low);



-- Optional: Add RLS policies if needed
ALTER TABLE ibra_regions ENABLE ROW LEVEL SECURITY;

-- Policy 1: Allow all authenticated users to read the table
CREATE POLICY "Allow authenticated read access to ibra_regions" 
ON ibra_regions
FOR SELECT 
TO authenticated 
USING (true);

-- Policy 2: Explicitly deny all write operations (INSERT, UPDATE, DELETE)
-- This creates a comprehensive block on modifications
CREATE POLICY "Deny all write operations on ibra_regions" 
ON ibra_regions
FOR ALL 
TO authenticated 
USING (false) 
WITH CHECK (false);

-- Grant SELECT permission to authenticated role
-- (This works in conjunction with RLS policies)
GRANT SELECT ON ibra_regions TO authenticated;

-- Revoke all other permissions to ensure no modifications
REVOKE INSERT, UPDATE, DELETE ON ibra_regions FROM authenticated;
REVOKE ALL ON ibra_regions FROM anon;

-- Add helpful comment
COMMENT ON TABLE ibra_regions IS 'IBRA7 Regions - Read-only reference data for geospatial queries';
COMMENT ON POLICY "Allow authenticated read access to ibra_regions" ON ibra_regions IS 'Allows all authenticated users to read IBRA regions data';
COMMENT ON POLICY "Deny all write operations on ibra_regions" ON ibra_regions IS 'Prevents any modifications to the IBRA regions reference data';

BEGIN;
-- put this in a transaction so that the extension is installed for sure
create extension IF NOT EXISTS http with schema extensions;
COMMIT;
