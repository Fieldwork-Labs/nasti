-- Add code field to collection table and create auto-population trigger

-- Add the code column to the collection table
ALTER TABLE public.collection
ADD COLUMN code TEXT;

-- Function to generate organization abbreviation
CREATE OR REPLACE FUNCTION generate_org_abbreviation(org_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    words TEXT[];
    word TEXT;
    abbreviation TEXT := '';
BEGIN
    -- Handle null or empty names
    IF org_name IS NULL OR trim(org_name) = '' THEN
        RETURN 'UNK';
    END IF;

    -- Split the organization name into words
    words := string_to_array(trim(org_name), ' ');

    -- If single word, take first 3 characters
    IF array_length(words, 1) = 1 THEN
        RETURN upper(left(words[1], 3));
    END IF;

    -- If multiple words, take first letter of each word
    FOREACH word IN ARRAY words
    LOOP
        -- Only include non-empty words and skip common articles/prepositions
        IF length(trim(word)) > 0 AND lower(word) NOT IN ('the', 'of', 'and', 'for', 'in', 'on', 'at', 'to', 'a', 'an') THEN
            abbreviation := abbreviation || upper(left(trim(word), 1));
        END IF;
    END LOOP;

    -- Ensure we have at least something
    IF abbreviation = '' THEN
        RETURN upper(left(org_name, 3));
    END IF;

    RETURN abbreviation;
END;
$$;

-- Function to generate three-letter species code abbreviation
-- Takes first 3 letters from each component of the species name
-- Example: "Acacia acuminata" -> "ACAACU"
-- Example: "Lambertia orbifolia subsp. orbifolia" -> "LAMORBORB"
-- Phrase names (informal species names) are handled specially:
-- Example: "Scholtzia sp. Geraldton (F.Lullfitz L 3216) WA Herbarium" -> "SCHSPGER"
-- Example: "Ptilotus sp. Mt Narryer (A.S.George 17484)" -> "PTISPMTN"
CREATE OR REPLACE FUNCTION generate_species_abbreviation(species_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    words TEXT[];
    word TEXT;
    abbreviation TEXT := '';
    is_phrase_name BOOLEAN := false;
    phrase_location TEXT;
BEGIN
    -- Handle null or empty names
    IF species_name IS NULL OR trim(species_name) = '' THEN
        RETURN 'UNK';
    END IF;

    -- Split the species name into words
    words := string_to_array(trim(species_name), ' ');

    -- Check if this is a phrase name by checking if the second word is exactly 'sp.' or 'sp'
    IF array_length(words, 1) >= 2 AND lower(words[2]) IN ('sp.', 'sp') THEN
        is_phrase_name := true;

        -- Phrase name pattern: "Genus sp. Location (Citation...)"
        -- Generate: Genus (3 letters) + SP + Location (3 letters)

        -- Get the genus (first word)
        abbreviation := upper(left(trim(words[1]), 3));

        -- Add 'SP' for phrase name indicator
        abbreviation := abbreviation || 'SP';

        -- Extract the location text between 'sp.' and the first '('
        -- Use regex to capture everything after 'sp.' or 'sp' and before '('
        phrase_location := regexp_replace(species_name, '^[^\s]+\s+sp\.?\s+([^(]+).*$', '\1', 'i');

        -- Remove all spaces from the location
        phrase_location := regexp_replace(phrase_location, '\s+', '', 'g');

        -- Remove any punctuation
        phrase_location := regexp_replace(phrase_location, '[^a-zA-Z]', '', 'g');

        -- Take first 3 letters of the location
        IF length(phrase_location) > 0 THEN
            abbreviation := abbreviation || upper(left(phrase_location, 3));
        END IF;

        RETURN abbreviation;
    END IF;

    -- Standard species name handling (not a phrase name)
    -- Take first 3 letters from each word, skipping common rank indicators
    FOREACH word IN ARRAY words
    LOOP
        -- Skip rank indicators like 'subsp.', 'var.', 'f.', etc.
        IF length(trim(word)) > 0 AND
           lower(word) NOT IN ('subsp.', 'var.', 'f.', 'subsp', 'var', 'ssp.', 'ssp') THEN
            -- Take first 3 letters (or less if word is shorter)
            abbreviation := abbreviation || upper(left(trim(word), 3));
        END IF;
    END LOOP;

    -- Ensure we have at least something
    IF abbreviation = '' THEN
        RETURN 'UNK';
    END IF;

    RETURN abbreviation;
END;
$$;

-- Function to get IBRA region code from geometry
CREATE OR REPLACE FUNCTION get_ibra_code_from_location(location_geom geography)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    ibra_code TEXT;
BEGIN
    -- Handle null location
    IF location_geom IS NULL THEN
        RETURN 'UNK';
    END IF;

    -- Find intersecting IBRA region using geom_high for precision
    SELECT code INTO ibra_code
    FROM ibra_regions
    WHERE ST_Intersects(geom_high, location_geom::geometry)
    LIMIT 1;

    -- Return the code or 'UNK' if no intersection found
    RETURN COALESCE(ibra_code, 'UNK');
END;
$$;

-- Function to get the next sequence number for a collection code
-- Ensures uniqueness per organization by incrementing the suffix
CREATE OR REPLACE FUNCTION get_next_code_sequence(
    base_code TEXT,
    p_organisation_id UUID,
    p_collection_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    max_sequence INTEGER;
BEGIN
    -- Find the highest sequence number for this base code in this organization
    -- Exclude the current collection if we're updating
    SELECT COALESCE(MAX(
        CAST(
            substring(code from '-(\d+)$')
            AS INTEGER
        )
    ), 0) INTO max_sequence
    FROM collection
    WHERE organisation_id = p_organisation_id
        AND code ~ ('^' || regexp_replace(base_code, '[.*+?^${}()|[\]\\]', '\\\&', 'g') || '-\d+$')
        AND (p_collection_id IS NULL OR id != p_collection_id);

    -- Return the next sequence number
    RETURN COALESCE(max_sequence, 0) + 1;
END;
$$;

-- Main function to generate collection code
CREATE OR REPLACE FUNCTION generate_collection_code(
    p_collection_id UUID,
    p_species_id UUID,
    p_field_name TEXT,
    p_organisation_id UUID,
    p_location geography,
    p_created_at timestamptz
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    species_name TEXT;
    species_abbrev TEXT;
    org_name TEXT;
    org_abbrev TEXT;
    ibra_code TEXT;
    year_yy TEXT;
    base_code TEXT;
    sequence_num INTEGER;
    final_code TEXT;
BEGIN
    -- Get species name or use field_name or 'Unknown'
    IF p_species_id IS NOT NULL THEN
        SELECT name INTO species_name FROM species WHERE id = p_species_id;
    END IF;

    IF species_name IS NULL OR trim(species_name) = '' THEN
        species_name := COALESCE(nullif(trim(p_field_name), ''), 'Unknown');
    END IF;

    -- Generate species abbreviation
    species_abbrev := generate_species_abbreviation(species_name);

    -- Get organization name and generate abbreviation
    IF p_organisation_id IS NOT NULL THEN
        SELECT name INTO org_name FROM organisation WHERE id = p_organisation_id;
        org_abbrev := generate_org_abbreviation(org_name);
    ELSE
        org_abbrev := 'UNK';
    END IF;

    -- Get IBRA region code
    ibra_code := get_ibra_code_from_location(p_location);

    -- Format year as YY
    year_yy := to_char(COALESCE(p_created_at, now()), 'YY');

    -- Construct the base code (without sequence number)
    base_code := species_abbrev || '-' || org_abbrev || '.' || ibra_code || '.' || year_yy;

    -- Get the next sequence number for this combination within the organization
    sequence_num := get_next_code_sequence(base_code, p_organisation_id, p_collection_id);

    -- Construct the final code with sequence number
    final_code := base_code || '-' || sequence_num::TEXT;

    RETURN final_code;
END;
$$;

-- Trigger function to auto-populate code field
CREATE OR REPLACE FUNCTION auto_populate_collection_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Generate code for new records
    IF TG_OP = 'INSERT' THEN
        NEW.code := generate_collection_code(
            NEW.id,
            NEW.species_id,
            NEW.field_name,
            NEW.organisation_id,
            NEW.location,
            NEW.created_at
        );
        RETURN NEW;
    END IF;

    -- Update code if relevant fields change
    IF TG_OP = 'UPDATE' THEN
        -- Check if any of the fields that affect the code have changed
        IF (OLD.species_id IS DISTINCT FROM NEW.species_id) OR
           (OLD.field_name IS DISTINCT FROM NEW.field_name) OR
           (OLD.organisation_id IS DISTINCT FROM NEW.organisation_id) OR
           (OLD.location IS DISTINCT FROM NEW.location) THEN
            NEW.code := generate_collection_code(
                NEW.id,
                NEW.species_id,
                NEW.field_name,
                NEW.organisation_id,
                NEW.location,
                NEW.created_at
            );
        END IF;
        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$$;

-- Create the trigger
CREATE TRIGGER collection_code_trigger
    BEFORE INSERT OR UPDATE ON collection
    FOR EACH ROW
    EXECUTE FUNCTION auto_populate_collection_code();

-- Add unique constraint for codes within an organization
CREATE UNIQUE INDEX collection_code_org_unique_idx
    ON collection(code, organisation_id)
    WHERE code IS NOT NULL;

-- Update existing records to populate the code field
UPDATE collection
SET code = generate_collection_code(
    id,
    species_id,
    field_name,
    organisation_id,
    location,
    created_at
)
WHERE code IS NULL;
