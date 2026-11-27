-- Evaluate the authenticated user once per query instead of once per candidate row.
-- This preserves the original owner / assigned-driver / manager access conditions.
ALTER POLICY module_read ON public.trips
USING (
  is_company_owner(company_id)
  OR (
    employee_assigned_vehicle(company_id, vehicle_id)
    AND (
      NOT EXISTS (
        SELECT 1 FROM public.members m
        WHERE m.company_id = trips.company_id
          AND m.user_id = (SELECT auth.uid())
          AND m.role = 'driver'
      )
      OR EXISTS (
        SELECT 1 FROM public.drivers d
        WHERE d.company_id = trips.company_id
          AND d.user_id = (SELECT auth.uid())
          AND d.id = trips.driver_id
      )
    )
  )
  OR (
    EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.company_id = trips.company_id
        AND m.user_id = (SELECT auth.uid())
        AND m.role = 'manager'
    )
    AND has_module_permission(company_id, 'trips', 'view')
  )
);
