create table if not exists public.cloud_snapshots (
  entity text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.cloud_snapshots to anon, authenticated;

alter table public.cloud_snapshots enable row level security;

-- Phase A (sin login): permite que el cliente use la publishable key.
-- Importante: esta policy es temporal hasta activar auth + tenant/roles.
drop policy if exists "cloud_snapshots_anon_all" on public.cloud_snapshots;
create policy "cloud_snapshots_anon_all"
on public.cloud_snapshots
for all
to anon, authenticated
using (true)
with check (true);
