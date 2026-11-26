-- The generic log_fleet_change trigger already records INSERT/UPDATE/DELETE
-- for fuel, maintenance and trips. Remove the additional insert-only triggers
-- to prevent duplicate audit rows and duplicate constraint failures.
DROP TRIGGER IF EXISTS employee_fuel_audit ON public.fuel;
DROP TRIGGER IF EXISTS employee_maintenance_audit ON public.maintenance;
DROP TRIGGER IF EXISTS employee_trip_audit ON public.trips;

-- No remaining trigger uses this employee-only audit function.
DROP FUNCTION IF EXISTS public.log_employee_operational_entry();
