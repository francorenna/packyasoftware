-- HOTFIX: cloud_snapshots RLS allowlist (incluye daily_panel_entries)
-- Uso: ejecutar completo en SQL Editor del proyecto PROD.

begin;

alter table public.cloud_snapshots enable row level security;

drop policy if exists "cloud_snapshots_read_all" on public.cloud_snapshots;
drop policy if exists "cloud_snapshots_insert_allowlist" on public.cloud_snapshots;
drop policy if exists "cloud_snapshots_update_allowlist" on public.cloud_snapshots;

create policy "cloud_snapshots_read_all"
on public.cloud_snapshots
for select
to anon, authenticated
using (true);

create policy "cloud_snapshots_insert_allowlist"
on public.cloud_snapshots
for insert
to anon, authenticated
with check (
  entity in (
    'orders',
    'clients',
    'quotes',
    'purchases',
    'manual_purchase_lists',
    'products',
    'suppliers',
    'expenses',
    'daily_panel_entries'
  )
);

create policy "cloud_snapshots_update_allowlist"
on public.cloud_snapshots
for update
to anon, authenticated
using (
  entity in (
    'orders',
    'clients',
    'quotes',
    'purchases',
    'manual_purchase_lists',
    'products',
    'suppliers',
    'expenses',
    'daily_panel_entries'
  )
)
with check (
  entity in (
    'orders',
    'clients',
    'quotes',
    'purchases',
    'manual_purchase_lists',
    'products',
    'suppliers',
    'expenses',
    'daily_panel_entries'
  )
);

commit;

-- Verificacion recomendada:
-- select policyname, permissive, roles, cmd, qual, with_check
-- from pg_policies
-- where schemaname = 'public'
--   and tablename = 'cloud_snapshots'
-- order by policyname;
