-- ---------------------------------------------------------------------------
-- A test's type is fixed once recorded
--
-- tests_consumed_weight_immutable only fired on UPDATE OF result while the row
-- was a quality test, so a caller could switch a quality test to germination,
-- edit its replicate weights with the guard off, then switch it back. The
-- consumption adjustment written at creation would then disagree with the
-- result. Nothing in the app changes a test's type, so the type is now fixed,
-- and the guard fires on any update that touches type or result.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_guard_quality_test_consumed_weight()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.type IS DISTINCT FROM OLD.type THEN
    RAISE EXCEPTION 'A test''s type cannot be changed once recorded'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.type = 'quality'
     AND public.fn_quality_test_consumed_weight(NEW.result)
       IS DISTINCT FROM public.fn_quality_test_consumed_weight(OLD.result) THEN
    RAISE EXCEPTION 'The seed a test consumed cannot be changed: keep its type and replicate weights'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$function$
;

DROP TRIGGER IF EXISTS tests_consumed_weight_immutable ON public.tests;

CREATE TRIGGER tests_consumed_weight_immutable
  BEFORE UPDATE OF type, result ON public.tests
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_guard_quality_test_consumed_weight();
