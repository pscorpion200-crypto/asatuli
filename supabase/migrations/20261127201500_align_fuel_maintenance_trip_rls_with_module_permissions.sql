-- Align tenant RLS with the granular permission editor.
-- A member's module permissions are authoritative for manager and viewer roles.
begin;

drop policy if exists module_read on public.fuel;
create policy module_read
on public.fuel
for select
to authenticated
using (
  public.employee_assigned_vehicle(company_id, vehicle_id)
  or public.has_module_permission(company_id, 'fuel', 'view')
);

drop policy if exists module_insert on public.fuel;
create policy module_insert
on public.fuel
for insert
to authenticated
with check (
  public.employee_assigned_vehicle(company_id, vehicle_id)
  or public.has_module_permission(company_id, 'fuel', 'add')
);

drop policy if exists module_update on public.fuel;
create policy module_update
on public.fuel
for update
to authenticated
using (public.has_module_permission(company_id, 'fuel', 'edit'))
with check (public.has_module_permission(company_id, 'fuel', 'edit'));

drop policy if exists module_delete on public.fuel;
create policy module_delete
on public.fuel
for delete
to authenticated
using (public.has_module_permission(company_id, 'fuel', 'delete'));


drop policy if exists module_read on public.maintenance;
create policy module_read
on public.maintenance
for select
to authenticated
using (
  public.employee_assigned_vehicle(company_id, vehicle_id)
  or public.has_module_permission(company_id, 'maintenance', 'view')
);

drop policy if exists module_insert on public.maintenance;
create policy module_insert
on public.maintenance
for insert
to authenticated
with check (
  public.employee_assigned_vehicle(company_id, vehicle_id)
  or public.has_module_permission(company_id, 'maintenance', 'add')
);

drop policy if exists module_update on public.maintenance;
create policy module_update
on public.maintenance
for update
to authenticated
using (public.has_module_permission(company_id, 'maintenance', 'edit'))
with check (public.has_module_permission(company_id, 'maintenance', 'edit'));

drop policy if exists module_delete on public.maintenance;
create policy module_delete
on public.maintenance
for delete
to authenticated
using (public.has_module_permission(company_id, 'maintenance', 'delete'));


drop policy if exists module_read on public.trips;
create policy module_read
on public.trips
for select
to authenticated
using (
  public.is_company_owner(company_id)
  or (
    public.employee_assigned_vehicle(company_id, vehicle_id)
    and (
      not exists (
        select 1
        from public.members m
        where m.company_id = trips.company_id
          and m.user_id = (select auth.uid())
          and m.role = 'driver'
      )
      or exists (
        select 1
        from public.drivers d
        where d.company_id = trips.company_id
          and d.user_id = (select auth.uid())
          and d.id = trips.driver_id
      )
    )
  )
  or public.has_module_permission(company_id, 'trips', 'view')
);

drop policy if exists module_insert on public.trips;
create policy module_insert
on public.trips
for insert
to authenticated
with check (
  (
    public.employee_assigned_vehicle(company_id, vehicle_id)
    and exists (
      select 1
      from public.drivers d
      where d.company_id = trips.company_id
        and d.user_id = (select auth.uid())
        and d.id = trips.driver_id
    )
  )
  or public.has_module_permission(company_id, 'trips', 'add')
);

drop policy if exists module_update on public.trips;
create policy module_update
on public.trips
for update
to authenticated
using (public.has_module_permission(company_id, 'trips', 'edit'))
with check (public.has_module_permission(company_id, 'trips', 'edit'));

drop policy if exists module_delete on public.trips;
create policy module_delete
on public.trips
for delete
to authenticated
using (public.has_module_permission(company_id, 'trips', 'delete'));

commit;
