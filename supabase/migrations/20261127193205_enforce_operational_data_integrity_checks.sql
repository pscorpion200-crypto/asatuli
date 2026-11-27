
-- Enforce the same operational data rules at the database boundary.
-- Existing production rows were checked before applying this migration.
ALTER TABLE public.fuel
  DROP CONSTRAINT IF EXISTS fuel_liters_check;
ALTER TABLE public.fuel
  ADD CONSTRAINT fuel_liters_check CHECK (liters > 0);

ALTER TABLE public.trips
  ADD CONSTRAINT trips_km_positive_check CHECK (km > 0),
  ADD CONSTRAINT trips_loaded_meters_nonnegative_check CHECK (loaded_meters >= 0),
  ADD CONSTRAINT trips_revenue_nonnegative_check CHECK (revenue >= 0),
  ADD CONSTRAINT trips_other_cost_nonnegative_check CHECK (other_cost >= 0);

ALTER TABLE public.maintenance
  ADD CONSTRAINT maintenance_cost_nonnegative_check CHECK (cost >= 0);

ALTER TABLE public.vehicles
  ADD CONSTRAINT vehicles_plate_not_blank_check CHECK (char_length(btrim(plate)) > 0);

ALTER TABLE public.drivers
  ADD CONSTRAINT drivers_name_not_blank_check CHECK (char_length(btrim(name)) > 0);
