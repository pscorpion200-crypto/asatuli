-- A driver assigned to a vehicle may only submit trips under their own
-- linked drivers.id. Owners/managers retain their existing module permissions.
DROP POLICY IF EXISTS module_insert ON public.trips;
CREATE POLICY module_insert ON public.trips
FOR INSERT TO authenticated
WITH CHECK (
  (
    employee_assigned_vehicle(company_id, vehicle_id)
    AND EXISTS (
      SELECT 1
      FROM public.drivers d
      WHERE d.company_id = trips.company_id
        AND d.user_id = (SELECT auth.uid())
        AND d.id = trips.driver_id
    )
  )
  OR is_company_owner(company_id)
  OR EXISTS (
    SELECT 1
    FROM public.members m
    WHERE m.company_id = trips.company_id
      AND m.user_id = (SELECT auth.uid())
      AND m.role = 'manager'
      AND has_module_permission(trips.company_id, 'trips', 'add')
  )
);
