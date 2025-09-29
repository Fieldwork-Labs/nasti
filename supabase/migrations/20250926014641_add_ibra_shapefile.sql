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

create extension http with schema extensions;

CREATE OR REPLACE FUNCTION load_ibra7_regions_paginated()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    base_url TEXT := 'https://gis.environment.gov.au/gispubmap/rest/services/ogc_services/IBRA7_Regions/FeatureServer/0/query';
    base_params TEXT := '?where=1%3D1&objectIds=&time=&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&distance=&units=esriSRUnit_Foot&relationParam=&outFields=*&returnGeometry=true&maxAllowableOffset=&geometryPrecision=&outSR=&havingClause=&gdbVersion=&historicMoment=&returnDistinctValues=false&returnIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&orderByFields=&groupByFieldsForStatistics=&outStatistics=&returnZ=false&returnM=false&multipatchOption=xyFootprint&returnTrueCurves=false&returnExceededLimitFeatures=false&quantizationParameters=&returnCentroid=false&timeReferenceUnknownClient=false&sqlFormat=none&resultType=&featureEncoding=esriDefault&datumTransformation=&f=geojson';
    
    current_offset INT := 0;
    chunk_size INT := 5;
    response http_response;
    geojson_data JSONB;
    features_array JSONB;
    feature_count INT;
    total_loaded INT := 0;
    query_url TEXT;
BEGIN
    -- Check if already loaded
    IF EXISTS (SELECT 1 FROM ibra_regions LIMIT 1) THEN
        RAISE NOTICE 'IBRA7 regions already loaded';
        RETURN;
    END IF;


    -- Create temporary table to store original data
    CREATE TEMP TABLE temp_ibra_original (
        geom GEOMETRY,
        properties JSONB,
        name TEXT,
        source_id BIGINT,
        reg_code TEXT
    );

    RAISE NOTICE 'Starting to load IBRA7 regions in chunks of %', chunk_size;

    LOOP
        -- Build paginated query URL
        query_url := base_url || base_params || 
            '&resultOffset=' || current_offset ||
            '&resultRecordCount=' || chunk_size;

        RAISE NOTICE 'Fetching chunk: offset=%, size=%', current_offset, chunk_size;
        RAISE NOTICE 'Query URL: %', query_url;

        SELECT * INTO response FROM http_get(query_url);

        IF response.status != 200 THEN
            RAISE WARNING 'Failed to fetch chunk at offset %: HTTP %', current_offset, response.status;
            EXIT;
        END IF;

        geojson_data := response.content::JSONB;

        -- Validate response
        IF geojson_data IS NULL OR geojson_data->>'type' != 'FeatureCollection' THEN
            RAISE WARNING 'Invalid GeoJSON response at offset %', current_offset;
            EXIT;
        END IF;

        features_array := geojson_data->'features';
        feature_count := jsonb_array_length(features_array);

        RAISE NOTICE 'Received % features in this chunk', feature_count;

        -- Exit if no more features
        IF feature_count = 0 THEN
            RAISE NOTICE 'No more features found at offset %', current_offset;
            EXIT;
        END IF;

        -- Insert this chunk's features
        INSERT INTO temp_ibra_original (geom, properties, name, source_id, reg_code)
        SELECT 
            ST_GeomFromGeoJSON(feature->>'geometry'),  -- Original geometry
            feature->'properties',
            feature->'properties'->>'REG_NAME_7',
            (feature->'properties'->>'OBJECTID')::BIGINT,
            feature->'properties'->>'REG_CODE_7'
        FROM jsonb_array_elements(features_array) AS feature
        WHERE feature->>'geometry' IS NOT NULL;
    
        GET DIAGNOSTICS feature_count = ROW_COUNT;
        total_loaded := total_loaded + feature_count;
        current_offset := current_offset + chunk_size;

        RAISE NOTICE 'Inserted % features with geometry (% total so far)', feature_count, total_loaded;

        -- Small delay to be respectful to the service
        PERFORM pg_sleep(0.2);

        -- Safety check to prevent infinite loops
        IF current_offset > 1000 THEN
            RAISE WARNING 'Safety limit reached at % features', total_loaded;
            EXIT;
        END IF;
    END LOOP;

    RAISE NOTICE 'Completed loading % IBRA7 regions', total_loaded;
    
    -- Step 3: Now simplify all geometries together and insert into final table
    RAISE NOTICE 'Simplifying % regions while preserving topology...', 
        (SELECT COUNT(*) FROM temp_ibra_original);

    INSERT INTO ibra_regions (geom_high, geom_medium, geom_low, properties, name, code)
    SELECT 
        ST_SimplifyPreserveTopology(geom, 0.001) as geom_high,
        ST_SimplifyPreserveTopology(geom, 0.005) as geom_medium,
        ST_SimplifyPreserveTopology(geom, 0.02) as geom_low,
        properties,
        name,
        reg_code
    FROM temp_ibra_original;
END $$;

-- Execute the function
SELECT load_ibra7_regions_paginated();


-- RPC: Get IBRA regions by detail level
CREATE OR REPLACE FUNCTION get_ibra_regions(
  min_lng NUMERIC DEFAULT NULL,
  min_lat NUMERIC DEFAULT NULL,
  max_lng NUMERIC DEFAULT NULL,
  max_lat NUMERIC DEFAULT NULL,
  detail_level TEXT DEFAULT 'low'
)
RETURNS TABLE (
  id BIGINT,
  name TEXT,
  code TEXT,
  properties JSONB,
  geometry GEOMETRY
)
LANGUAGE plpgsql
AS $$
DECLARE
  geom_column TEXT;
  use_bounds BOOLEAN;
BEGIN
  -- Select appropriate geometry column based on detail level
  CASE detail_level
    WHEN 'high' THEN geom_column := 'geom_high';
    WHEN 'medium' THEN geom_column := 'geom_medium';
    WHEN 'low' THEN geom_column := 'geom_low';
    ELSE geom_column := 'geom_high';
  END CASE;

  -- Check if bounds are provided (all four values must be non-null)
  use_bounds := (min_lng IS NOT NULL AND min_lat IS NOT NULL AND 
                 max_lng IS NOT NULL AND max_lat IS NOT NULL);

  -- Execute query with or without bounds filtering
  IF use_bounds THEN
    -- Query with bounds filtering
    RETURN QUERY EXECUTE format('
      SELECT 
        r.id,
        r.name,
        r.code,
        r.properties,
        r.%I as geometry
      FROM ibra_regions r
      WHERE ST_Intersects(
        r.%I,
        ST_MakeEnvelope($1, $2, $3, $4, 4326)
      )', geom_column, geom_column)
    USING min_lng, min_lat, max_lng, max_lat;
  ELSE
    -- Query without bounds filtering (return all regions)
    RETURN QUERY EXECUTE format('
      SELECT 
        r.id,
        r.name,
        r.code,
        r.properties,
        r.%I as geometry
      FROM ibra_regions r', geom_column);
  END IF;
END $$;