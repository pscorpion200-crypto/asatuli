-- Add per-record versions so concurrent editors cannot silently overwrite each other.
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT clock_timestamp();
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT clock_timestamp();
ALTER TABLE public.fuel
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT clock_timestamp();
ALTER TABLE public.maintenance
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT clock_timestamp();
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT clock_timestamp();

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.set_updated_at() IS
  'Maintains optimistic-lock version timestamps for Asatuli fleet records.';

DO $migration$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['vehicles', 'drivers', 'fuel', 'maintenance', 'trips']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON public.%I', table_name);
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      table_name
    );
  END LOOP;
END;
$migration$;

COMMENT ON COLUMN public.vehicles.updated_at IS 'Optimistic-lock version timestamp; changed automatically on every row update.';
COMMENT ON COLUMN public.drivers.updated_at IS 'Optimistic-lock version timestamp; changed automatically on every row update.';
COMMENT ON COLUMN public.fuel.updated_at IS 'Optimistic-lock version timestamp; changed automatically on every row update.';
COMMENT ON COLUMN public.maintenance.updated_at IS 'Optimistic-lock version timestamp; changed automatically on every row update.';
COMMENT ON COLUMN public.trips.updated_at IS 'Optimistic-lock version timestamp; changed automatically on every row update.';
