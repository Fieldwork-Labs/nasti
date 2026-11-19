-- Ownership transfer: enum changes only.
--
-- PostgreSQL will not let a value added with ALTER TYPE ... ADD VALUE be used
-- until the adding transaction commits, so nothing in this file uses the new
-- values. Constraints, tables and functions that do live in
-- 20261118000002_transfer_schema.sql and later.

ALTER TYPE public.seed_transfer_event_kind
  ADD VALUE IF NOT EXISTS 'ownership_transfer';

ALTER TYPE public.batch_weight_adjustment_kind
  ADD VALUE IF NOT EXISTS 'transfer_out';

ALTER TYPE public.sub_batch_lineage_operation_kind
  ADD VALUE IF NOT EXISTS 'transfer';

CREATE TYPE public.organisation_link_kind AS ENUM ('testing', 'transfer');
