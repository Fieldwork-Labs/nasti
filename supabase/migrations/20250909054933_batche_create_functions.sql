CREATE OR REPLACE FUNCTION fn_create_batch_from_collection(
  p_collection_id uuid,
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_org uuid; v_batch_id uuid;
BEGIN
  -- The batch must be created by the organisation that owns the collection
  SELECT organisation_id INTO v_org
  FROM "public.collection" WHERE id = p_collection_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Collection not found';
  END IF;

  IF NOT is_org_member(auth.uid(), v_org) THEN
    RAISE EXCEPTION 'Permission denied: not a member of collection organisation';
  END IF;

  INSERT INTO batches (id, collection_id, organisation_id, notes)
  VALUES (gen_random_uuid(), p_collection_id, v_org, p_notes)
  RETURNING id INTO v_batch_id;

  -- Establish initial custody
  INSERT INTO batch_custody (batch_id, organisation_id, notes)
  VALUES (v_batch_id, v_org, 'Initial custody from collection');

  RETURN v_batch_id;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_create_batch_from_collection(uuid, text) TO authenticated;


CREATE OR REPLACE FUNCTION fn_split_batch(
  p_parent_batch_id uuid,
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_org uuid; v_collection uuid; v_child_id uuid;
BEGIN
  -- Caller must be current custodian of the parent
  v_org := current_custodian_org_id(p_parent_batch_id);
  IF v_org IS NULL OR NOT is_org_member(auth.uid(), v_org) THEN
    RAISE EXCEPTION 'Permission denied: not current custodian of parent batch';
  END IF;

  -- Carry forward collection_id if your schema keeps it on batches
  SELECT collection_id INTO v_collection FROM batches WHERE id = p_parent_batch_id;

  INSERT INTO batches (id, collection_id, organisation_id, notes)
  VALUES (gen_random_uuid(), v_collection, v_org, p_notes)
  RETURNING id INTO v_child_id;

  INSERT INTO batch_splits (parent_batch_id, child_batch_id) VALUES (p_parent_batch_id, v_child_id);

  INSERT INTO batch_custody (batch_id, organisation_id, notes)
  VALUES (v_child_id, v_org, 'Custody inherited on split');

  RETURN v_child_id;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_split_batch(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION fn_merge_batches(
  p_source_batch_ids uuid[],
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_org uuid; v_collection uuid; v_new_id uuid; v_same bool;
BEGIN
  IF array_length(p_source_batch_ids, 1) IS NULL OR array_length(p_source_batch_ids, 1) < 2 THEN
    RAISE EXCEPTION 'Provide at least two source batches to merge';
  END IF;

  -- All sources must share the same current custodian
  v_org := assert_same_custodian(p_source_batch_ids);
  IF NOT is_org_member(auth.uid(), v_org) THEN
    RAISE EXCEPTION 'Permission denied: not a member of the custodian organisation';
  END IF;

  -- If your schema requires batches.collection_id NOT NULL, enforce same collection
  SELECT bool_and(collection_id = (SELECT collection_id FROM batches WHERE id = p_source_batch_ids[1]))
  INTO v_same
  FROM batches
  WHERE id = ANY (p_source_batch_ids);

  IF NOT v_same THEN
    RAISE EXCEPTION 'Source batches must share the same collection_id (or migrate to batch_origins for multi-collection merges)';
  END IF;

  SELECT collection_id INTO v_collection FROM batches WHERE id = p_source_batch_ids[1];

  INSERT INTO batches (id, collection_id, organisation_id, notes)
  VALUES (gen_random_uuid(), v_collection, v_org, p_notes)
  RETURNING id INTO v_new_id;

  INSERT INTO batch_custody (batch_id, organisation_id, notes)
  VALUES (v_new_id, v_org, 'Custody on merge');

  INSERT INTO batch_merges (merged_batch_id, source_batch_id)
  SELECT v_new_id, unnest(p_source_batch_ids);

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_merge_batches(uuid[], text) TO authenticated;
