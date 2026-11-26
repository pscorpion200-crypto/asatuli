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

commit;
