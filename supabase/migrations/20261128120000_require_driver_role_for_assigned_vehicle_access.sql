-- Assigned-vehicle access is a driver capability, not a shortcut around
-- manager/viewer module permissions. Keep this invariant in the database.
CREATE OR REPLACE FUNCTION public.employee_assigned_vehicle(
  p_company_id uuid,
  p_vehicle_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.employee_vehicle_assignments AS a
    JOIN public.members AS m
      ON m.company_id = a.company_id
     AND m.user_id = a.user_id
    WHERE a.company_id = p_company_id
      AND a.vehicle_id = p_vehicle_id
      AND a.user_id = (SELECT auth.uid())
      AND m.role = 'driver'
  );
$function$;
