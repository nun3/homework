create table if not exists public.family_state (
  family_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.family_state enable row level security;

create policy "Families can read own state"
on public.family_state
for select
to authenticated
using (auth.uid() = family_id);

create policy "Families can insert own state"
on public.family_state
for insert
to authenticated
with check (auth.uid() = family_id);

create policy "Families can update own state"
on public.family_state
for update
to authenticated
using (auth.uid() = family_id)
with check (auth.uid() = family_id);

create or replace function public.set_family_state_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists family_state_set_updated_at on public.family_state;

create trigger family_state_set_updated_at
before update on public.family_state
for each row
execute function public.set_family_state_updated_at();
