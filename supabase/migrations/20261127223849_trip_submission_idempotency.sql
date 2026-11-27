-- Preserve backward compatibility for existing trip rows and protect new client submissions.
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS submission_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS trips_company_driver_submission_unique
  ON public.trips (company_id, driver_id, submission_id)
  WHERE submission_id IS NOT NULL;

COMMENT ON COLUMN public.trips.submission_id IS
  'Client-generated idempotency key for a single driver trip submission; null for legacy records.';