alter table public.trips
  add column if not exists loaded_meters numeric not null default 0;
