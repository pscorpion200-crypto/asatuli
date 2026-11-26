begin;

-- Give linked driver accounts a dedicated role that cannot inherit manager/viewer module permissions.
alter table public.members
  drop constraint if exists members_role_check;

alter table public.members
  add constraint members_role_check
  check (role = any (array['owner'::text, 'manager'::text, 'viewer'::text, 'driver'::text]));

-- Remove any module grants from accounts that are linked to a driver record.
delete from public.member_permissions mp
using public.drivers d
where mp.company_id = d.company_id
  and mp.user_id = d.user_id;

-- Convert existing linked driver accounts from the generic viewer role.
update public.members m
set role = 'driver'
from public.drivers d
where d.company_id = m.company_id
  and d.user_id = m.user_id
  and m.role = 'viewer';

-- Driver invoice uploads are allowed only for a dedicated driver account
-- and only under that driver's assigned vehicle and own user folder.
drop policy if exists trip_invoice_upload_assigned_driver on storage.objects;

create policy trip_invoice_upload_assigned_driver
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'trip-invoices'
  and (storage.foldername(name))[1] in (
    select m.company_id::text
    from public.members m
    where m.user_id = auth.uid()
      and m.role = 'driver'
  )
  and (storage.foldername(name))[2] = auth.uid()::text
  and (storage.foldername(name))[3] is not null
  and public.employee_assigned_vehicle(
    ((storage.foldername(name))[1])::uuid,
    ((storage.foldername(name))[3])::uuid
  )
  and exists (
    select 1
    from public.drivers d
    where d.company_id = ((storage.foldername(name))[1])::uuid
      and d.user_id = auth.uid()
  )
);

commit;
