-- Remove inherited PUBLIC grants as well as any explicit anon grants.
-- Keep the policy helper functions callable by authenticated users.
REVOKE EXECUTE ON FUNCTION public.employee_assigned_vehicle(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.employee_request_join(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.employee_submit_join_request(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.owner_set_member_permissions(uuid, uuid, jsonb) FROM PUBLIC, anon;

-- This function is attached to INSERT triggers only; no API role needs direct execution.
REVOKE EXECUTE ON FUNCTION public.log_employee_operational_entry() FROM PUBLIC, anon, authenticated;

-- Cover the user/actor/vehicle foreign keys used by driver and assignment lookups.
CREATE INDEX IF NOT EXISTS drivers_user_id_idx
  ON public.drivers(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS employee_join_requests_user_id_idx
  ON public.employee_join_requests(user_id);
CREATE INDEX IF NOT EXISTS employee_vehicle_assignments_user_id_idx
  ON public.employee_vehicle_assignments(user_id);
CREATE INDEX IF NOT EXISTS employee_vehicle_assignments_vehicle_id_idx
  ON public.employee_vehicle_assignments(vehicle_id);
CREATE INDEX IF NOT EXISTS employee_vehicle_assignments_assigned_by_idx
  ON public.employee_vehicle_assignments(assigned_by) WHERE assigned_by IS NOT NULL;
