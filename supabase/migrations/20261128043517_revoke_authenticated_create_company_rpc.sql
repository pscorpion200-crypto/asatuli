-- Company provisioning is not part of the active client or authentication flow.
-- Keep the SECURITY DEFINER routine for trusted maintenance/migration use,
-- but prevent signed-in clients from creating arbitrary tenant records through PostgREST.
REVOKE ALL ON FUNCTION public.create_company(text) FROM PUBLIC, anon, authenticated;
