-- Function to auto-create origin batch when a collection is created
CREATE OR REPLACE FUNCTION fn_create_origin_batch_for_collection()
RETURNS TRIGGER AS $$
DECLARE
  v_collection_code text;
  v_new_batch_id uuid;
BEGIN

-- Get collection code
  SELECT code INTO v_collection_code
  FROM "collection"
  WHERE id = NEW.id;

  IF v_collection_code IS NULL THEN
    RAISE EXCEPTION 'Collection not found or has no code';
  END IF;

  -- Origin batch code is the same as the collection code
  INSERT INTO batches (code, collection_id, organisation_id)
  VALUES (v_collection_code, NEW.id, NEW.organisation_id)
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
