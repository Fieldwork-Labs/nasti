-- Function to auto-create origin batch when a collection is created
CREATE OR REPLACE FUNCTION fn_create_origin_batch_for_collection()
RETURNS TRIGGER AS $$
DECLARE
  v_collection_code text;
  v_increment integer;
  v_new_batch_id uuid;
  v_batch_code text;
BEGIN

-- Get collection code
  SELECT code INTO v_collection_code
  FROM "collection"
  WHERE id = NEW.id;

  IF v_collection_code IS NULL THEN
    RAISE EXCEPTION 'Collection not found or has no code';
  END IF;

  -- Generate batch code: collection_code-quality-increment
  -- Get next increment for this collection code and quality
  SELECT COALESCE(MAX(
    CASE
      WHEN code ~ ('^' || v_collection_code || '-' || 'ORG' || '-[0-9]+$')
      THEN CAST(SUBSTRING(code FROM '[0-9]+$') AS INTEGER)
      ELSE 0
    END
  ), 0) + 1
  INTO v_increment
  FROM batches
  WHERE collection_id = NEW.id;

  v_batch_code := v_collection_code || '-' || 'ORG' || '-' || v_increment::text;

  INSERT INTO batches (code, collection_id, organisation_id)
  VALUES (v_batch_code, NEW.id, NEW.organisation_id)
  RETURNING id INTO v_new_batch_id;

  INSERT INTO batch_custody (batch_id, organisation_id, notes)
  VALUES (v_new_batch_id, NEW.organisation_id, 'Batch created from collection');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create origin batch after collection insert
CREATE TRIGGER trg_create_origin_batch_for_collection
  AFTER INSERT ON "collection"
  FOR EACH ROW
  EXECUTE FUNCTION fn_create_origin_batch_for_collection();
