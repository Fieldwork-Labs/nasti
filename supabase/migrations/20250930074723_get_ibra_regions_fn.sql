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