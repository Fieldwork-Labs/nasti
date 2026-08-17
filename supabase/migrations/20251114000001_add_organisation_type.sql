-- Testing is an additive capability. A provider remains an ordinary
-- organisation that may own seed, collect it, and request another provider.
ALTER TABLE public.organisation
ADD COLUMN is_testing_provider boolean DEFAULT false NOT NULL;

CREATE INDEX idx_organisation_is_testing_provider
  ON public.organisation (is_testing_provider)
  WHERE is_testing_provider;

COMMENT ON COLUMN public.organisation.is_testing_provider IS
  'Whether this ordinary seed-owning organisation offers testing services.';
