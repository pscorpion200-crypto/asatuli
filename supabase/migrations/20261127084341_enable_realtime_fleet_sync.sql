-- Enable live updates for the fleet application.
-- All listed tables already have RLS enabled; Realtime applies those policies to Postgres Changes.
ALTER PUBLICATION supabase_realtime
  ADD TABLE
    public.vehicles,
    public.drivers,
    public.fuel,
    public.maintenance,
    public.trips,
    public.employee_join_requests,
    public.employee_vehicle_assignments,
    public.member_permissions,
    public.member_invites,
    public.members,
    public.fleet_audit_log;
