
-- Harden SECURITY DEFINER name resolution.
-- Put pg_catalog first and pg_temp last so caller-created temporary relations
-- cannot shadow application tables used by privileged functions.
ALTER FUNCTION public.accept_member_invites()
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.create_company(text)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.employee_assigned_vehicle(uuid, uuid)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.has_module_permission(uuid, text, text)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.is_company_owner(uuid)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.my_companies()
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.owner_invite_member(uuid, text, text)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.owner_remove_member(uuid, uuid)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.owner_set_member_permissions(uuid, uuid, jsonb)
  SET search_path = pg_catalog, public, pg_temp;
