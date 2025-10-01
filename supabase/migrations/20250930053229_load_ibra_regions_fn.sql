-- This is in a separate file because it has to be run in a separate transaction from the one where the http extension is installed
CREATE OR REPLACE FUNCTION load_ibra7_regions_paginated()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    base_url TEXT := 'https://gis.environment.gov.au/gispubmap/rest/services/ogc_services/IBRA7_Regions/FeatureServer/0/query';
    base_params TEXT := '?where=1%3D1&objectIds=&time=&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&distance=&units=esriSRUnit_Foot&relationParam=&outFields=*&returnGeometry=true&maxAllowableOffset=&geometryPrecision=&outSR=&havingClause=&gdbVersion=&historicMoment=&returnDistinctValues=false&returnIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&orderByFields=&groupByFieldsForStatistics=&outStatistics=&returnZ=false&returnM=false&multipatchOption=xyFootprint&returnTrueCurves=false&returnExceededLimitFeatures=false&quantizationParameters=&returnCentroid=false&timeReferenceUnknownClient=false&sqlFormat=none&resultType=&featureEncoding=esriDefault&datumTransformation=&f=geojson';
    
    current_offset INT := 0;
    chunk_size INT := 5;
    response RECORD;
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

        SELECT status, content INTO response FROM http_get(query_url);

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
-- SELECT load_ibra7_regions_paginated();


