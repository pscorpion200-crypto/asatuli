-- These legacy RPCs have no callers in the active application or RLS policies.
-- Keep their definitions for future reuse, but remove their exposed API execution grants.
REVOKE ALL ON FUNCTION public.can_manage_company(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.employee_request_join(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.employee_submit_join_request(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.owner_add_member(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.owner_approve_employee(uuid, uuid) FROM PUBLIC, anon, authenticated;
