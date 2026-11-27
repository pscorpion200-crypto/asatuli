-- Remove the redundant linked-driver unique index.
-- Keep the pre-existing equivalent index drivers_company_user_unique.
BEGIN;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'drivers_company_user_unique'
      AND indexdef LIKE 'CREATE UNIQUE INDEX% (company_id, user_id) WHERE (user_id IS NOT NULL)'
  ) THEN
    RAISE EXCEPTION 'Expected unique index public.drivers_company_user_unique is missing; refusing to remove the newer index';
  END IF;
END
$migration$;

DROP INDEX IF EXISTS public.drivers_company_user_id_unique;

COMMIT;
