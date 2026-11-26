-- Consolidate fleet RLS policies without broadening access.
-- All policies remain limited to authenticated requests.

-- Drivers: combine self-read and module-read rules.
DROP POLICY IF EXISTS drivers_self_read ON public.drivers;
DROP POLICY IF EXISTS module_read ON public.drivers;
CREATE POLICY module_read ON public.drivers
FOR SELECT TO authenticated
USING (
  (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.company_id = drivers.company_id
        AND m.user_id = (SELECT auth.uid())
    )
  )
  OR has_module_permission(company_id, 'drivers', 'view')
);

-- Fuel: combine assigned-vehicle access with owner/manager module access.
DROP POLICY IF EXISTS employee_fuel_read ON public.fuel;
DROP POLICY IF EXISTS module_read ON public.fuel;
CREATE POLICY module_read ON public.fuel
FOR SELECT TO authenticated
USING (
  employee_assigned_vehicle(company_id, vehicle_id)
  OR is_company_owner(company_id)
  OR EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.company_id = fuel.company_id
      AND m.user_id = (SELECT auth.uid())
      AND m.role = 'manager'
      AND has_module_permission(fuel.company_id, 'fuel', 'view')
  )
);

DROP POLICY IF EXISTS employee_fuel_add ON public.fuel;
DROP POLICY IF EXISTS module_insert ON public.fuel;
CREATE POLICY module_insert ON public.fuel
FOR INSERT TO authenticated
WITH CHECK (
  employee_assigned_vehicle(company_id, vehicle_id)
  OR is_company_owner(company_id)
  OR EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.company_id = fuel.company_id
      AND m.user_id = (SELECT auth.uid())
      AND m.role = 'manager'
      AND has_module_permission(fuel.company_id, 'fuel', 'add')
  )
);

DROP POLICY IF EXISTS module_update ON public.fuel;
CREATE POLICY module_update ON public.fuel
FOR UPDATE TO authenticated
USING (
  is_company_owner(company_id)
  OR EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.company_id = fuel.company_id
      AND m.user_id = (SELECT auth.uid())
      AND m.role = 'manager'
      AND has_module_permission(fuel.company_id, 'fuel', 'edit')
  )
)
WITH CHECK (
  is_company_owner(company_id)
  OR EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.company_id = fuel.company_id
      AND m.user_id = (SELECT auth.uid())
      AND m.role = 'manager'
      AND has_module_permission(fuel.company_id, 'fuel', 'edit')
  )
);

DROP POLICY IF EXISTS module_delete ON public.fuel;
CREATE POLICY module_delete ON public.fuel
FOR DELETE TO authenticated
USING (
  is_company_owner(company_id)
  OR EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.company_id = fuel.company_id
      AND m.user_id = (SELECT auth.uid())
      AND m.role = 'manager'
      AND has_module_permission(fuel.company_id, 'fuel', 'delete')
  )
);

-- Maintenance: combine assigned-vehicle access with owner/manager module access.
DROP POLICY IF EXISTS employee_maintenance_read ON public.maintenance;
DROP POLICY IF EXISTS module_read ON public.maintenance;
CREATE POLICY module_read ON public.maintenance
FOR SELECT TO authenticated
USING (
  employee_assigned_vehicle(company_id, vehicle_id)
  OR is_company_owner(company_id)
  OR EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.company_id = maintenance.company_id
      AND m.user_id = (SELECT auth.uid())
      AND m.role = 'manager'
      AND has_module_permission(maintenance.company_id, 'maintenance', 'view')
  )
);

DROP POLICY IF EXISTS employee_maintenance_add ON public.maintenance;
DROP POLICY IF EXISTS module_insert ON public.maintenance;
CREATE POLICY module_insert ON public.maintenance
FOR INSERT TO authenticated
WITH CHECK (
  employee_assigned_vehicle(company_id, vehicle_id)
  OR is_company_owner(company_id)
  OR EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.company_id = maintenance.company_id
      AND m.user_id = (SELECT auth.uid())
      AND m.role = 'manager'
      AND has_module_permission(maintenance.company_id, 'maintenance', 'add')
  )
);

DROP POLICY IF EXISTS module_update ON public.maintenance;
CREATE POLICY module_update ON public.maintenance
FOR UPDATE TO authenticated
USING (
  is_company_owner(company_id)
  OR EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.company_id = maintenance.company_id
      AND m.user_id = (SELECT auth.uid())
      AND m.role = 'manager'
      AND has_module_permission(maintenance.company_id, 'maintenance', 'edit')
  )
)
WITH CHECK (
  is_company_owner(company_id)
  OR EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.company_id = maintenance.company_id
      AND m.user_id = (SELECT auth.uid())
      AND m.role = 'manager'
      AND has_module_permission(maintenance.company_id, 'maintenance', 'edit')
  )
);

DROP POLICY IF EXISTS module_delete ON public.maintenance;
CREATE POLICY module_delete ON public.maintenance
FOR DELETE TO authenticated
USING (
  is_company_owner(company_id)
  OR EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.company_id = maintenance.company_id
      AND m.user_id = (SELECT auth.uid())
      AND m.role = 'manager'
      AND has_module_permission(maintenance.company_id, 'maintenance', 'delete')
  )
);

-- Trips: combine assigned-vehicle access with owner/manager module access.
DROP POLICY IF EXISTS employee_trips_read ON public.trips;
DROP POLICY IF EXISTS module_read ON public.trips;
CREATE POLICY module_read ON public.trips
FOR SELECT TO authenticated
USING (
  employee_assigned_vehicle(company_id, vehicle_id)
  OR is_company_owner(company_id)
  OR EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.company_id = trips.company_id
      AND m.user_id = (SELECT auth.uid())
      AND m.role = 'manager'
      AND has_module_permission(trips.company_id, 'trips', 'view')
  )
);

DROP POLICY IF EXISTS employee_trips_add ON public.trips;
DROP POLICY IF EXISTS module_insert ON public.trips;
CREATE POLICY module_insert ON public.trips
FOR INSERT TO authenticated
WITH CHECK (
  employee_assigned_vehicle(company_id, vehicle_id)
  OR is_company_owner(company_id)
  OR EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.company_id = trips.company_id
      AND m.user_id = (SELECT auth.uid())
      AND m.role = 'manager'
      AND has_module_permission(trips.company_id, 'trips', 'add')
  )
);

DROP POLICY IF EXISTS module_update ON public.trips;
CREATE POLICY module_update ON public.trips
FOR UPDATE TO authenticated
USING (
  is_company_owner(company_id)
  OR EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.company_id = trips.company_id
      AND m.user_id = (SELECT auth.uid())
      AND m.role = 'manager'
      AND has_module_permission(trips.company_id, 'trips', 'edit')
  )
)
WITH CHECK (
  is_company_owner(company_id)
  OR EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.company_id = trips.company_id
      AND m.user_id = (SELECT auth.uid())
      AND m.role = 'manager'
      AND has_module_permission(trips.company_id, 'trips', 'edit')
  )
);

DROP POLICY IF EXISTS module_delete ON public.trips;
CREATE POLICY module_delete ON public.trips
FOR DELETE TO authenticated
USING (
  is_company_owner(company_id)
  OR EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.company_id = trips.company_id
      AND m.user_id = (SELECT auth.uid())
      AND m.role = 'manager'
      AND has_module_permission(trips.company_id, 'trips', 'delete')
  )
);

-- Vehicles: combine assigned-vehicle and module access for SELECT.
DROP POLICY IF EXISTS employee_vehicle_read ON public.vehicles;
DROP POLICY IF EXISTS module_read ON public.vehicles;
CREATE POLICY module_read ON public.vehicles
FOR SELECT TO authenticated
USING (
  employee_assigned_vehicle(company_id, id)
  OR has_module_permission(company_id, 'vehicles', 'view')
);

-- Member directory: owners can see their company; every user can see their own membership.
DROP POLICY IF EXISTS own_membership ON public.members;
DROP POLICY IF EXISTS owner_view_members ON public.members;
CREATE POLICY own_membership ON public.members
FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR is_company_owner(company_id)
);

-- Join requests: remove duplicate read/update policies and cache auth.uid().
DROP POLICY IF EXISTS employee_requests_self_read ON public.employee_join_requests;
DROP POLICY IF EXISTS employee_request_self_read ON public.employee_join_requests;
CREATE POLICY employee_request_self_read ON public.employee_join_requests
FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR is_company_owner(company_id)
);

DROP POLICY IF EXISTS employee_requests_owner_manage ON public.employee_join_requests;
DROP POLICY IF EXISTS employee_request_owner_update ON public.employee_join_requests;
CREATE POLICY employee_request_owner_update ON public.employee_join_requests
FOR UPDATE TO authenticated
USING (is_company_owner(company_id))
WITH CHECK (is_company_owner(company_id));

DROP POLICY IF EXISTS employee_request_self_insert ON public.employee_join_requests;
CREATE POLICY employee_request_self_insert ON public.employee_join_requests
FOR INSERT TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND company_id = 'eae155e0-144f-4828-be57-27ab5d17041b'::uuid
  AND status = 'pending'
);

-- Assignments: separate owner write policies from self/owner read policy.
DROP POLICY IF EXISTS assignments_owner_manage ON public.employee_vehicle_assignments;
DROP POLICY IF EXISTS assignments_self_or_owner_read ON public.employee_vehicle_assignments;
CREATE POLICY assignments_self_or_owner_read ON public.employee_vehicle_assignments
FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR is_company_owner(company_id)
);
CREATE POLICY assignments_owner_insert ON public.employee_vehicle_assignments
FOR INSERT TO authenticated
WITH CHECK (is_company_owner(company_id));
CREATE POLICY assignments_owner_update ON public.employee_vehicle_assignments
FOR UPDATE TO authenticated
USING (is_company_owner(company_id))
WITH CHECK (is_company_owner(company_id));
CREATE POLICY assignments_owner_delete ON public.employee_vehicle_assignments
FOR DELETE TO authenticated
USING (is_company_owner(company_id));

-- Permission administration and audit logs are authenticated-only, not PUBLIC.
DROP POLICY IF EXISTS permissions_read ON public.member_permissions;
CREATE POLICY permissions_read ON public.member_permissions
FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR is_company_owner(company_id)
);

DROP POLICY IF EXISTS permissions_insert ON public.member_permissions;
CREATE POLICY permissions_insert ON public.member_permissions
FOR INSERT TO authenticated
WITH CHECK (is_company_owner(company_id));

DROP POLICY IF EXISTS permissions_update ON public.member_permissions;
CREATE POLICY permissions_update ON public.member_permissions
FOR UPDATE TO authenticated
USING (is_company_owner(company_id))
WITH CHECK (is_company_owner(company_id));

DROP POLICY IF EXISTS permissions_delete ON public.member_permissions;
CREATE POLICY permissions_delete ON public.member_permissions
FOR DELETE TO authenticated
USING (is_company_owner(company_id));

DROP POLICY IF EXISTS audit_read_owner ON public.fleet_audit_log;
CREATE POLICY audit_read_owner ON public.fleet_audit_log
FOR SELECT TO authenticated
USING (is_company_owner(company_id));
