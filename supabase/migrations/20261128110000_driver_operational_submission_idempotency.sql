-- Idempotency for driver fuel, maintenance and oil submissions.
-- Existing rows remain valid because legacy submission_id values are NULL.
ALTER TABLE public.fuel
  ADD COLUMN IF NOT EXISTS submission_id uuid;

ALTER TABLE public.maintenance
  ADD COLUMN IF NOT EXISTS submission_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS fuel_company_vehicle_submission_unique
  ON public.fuel (company_id, vehicle_id, submission_id)
  WHERE submission_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS maintenance_company_vehicle_submission_unique
  ON public.maintenance (company_id, vehicle_id, submission_id)
  WHERE submission_id IS NOT NULL;

COMMENT ON COLUMN public.fuel.submission_id IS
  'Client-generated idempotency key for a driver fuel submission; NULL for legacy records.';

COMMENT ON COLUMN public.maintenance.submission_id IS
  'Client-generated idempotency key for a driver maintenance or oil submission; NULL for legacy records.';
