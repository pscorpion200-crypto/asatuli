-- Reduce the callable surface of internal SECURITY DEFINER functions.
-- Authenticated access remains for RPCs used by RLS and employee self-service.
REVOKE EXECUTE ON FUNCTION public.employee_assigned_vehicle(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.employee_request_join(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.employee_submit_join_request(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.owner_set_member_permissions(uuid, uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_employee_operational_entry() FROM anon;
