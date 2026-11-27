-- Restrict the assigned-vehicle trip read exception to the linked driver only.
-- Owners and explicitly permitted managers/viewers continue to use module permissions.
drop policy if exists module_read on public.trips;

create policy module_read
on public.trips
for select
to authenticated
using (
  public.is_company_owner(company_id)
  or (
    exists (
      select 1
      from public.members m
      where m.company_id = trips.company_id
        and m.user_id = (select auth.uid())
        and m.role = 'driver'
    )
    and public.employee_assigned_vehicle(company_id, vehicle_id)
    and exists (
      select 1
      from public.drivers d
      where d.company_id = trips.company_id
        and d.user_id = (select auth.uid())
        and d.id = trips.driver_id
    )
  )
  or public.has_module_permission(company_id, 'trips', 'view')
);
