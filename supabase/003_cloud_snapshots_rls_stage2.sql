-- Stage 2 hardening for cloud_snapshots.
-- Goal: require authentication for all access (no more anon reads),
-- expand write allowlist to all operational entities.
-- Apply in Supabase Dashboard > SQL Editor.

-- Drop stage 1 policies.
drop policy if exists "cloud_snapshots_read_all" on public.cloud_snapshots;
drop policy if exists "cloud_snapshots_insert_allowlist" on public.cloud_snapshots;
drop policy if exists "cloud_snapshots_update_allowlist" on public.cloud_snapshots;

-- Read: authenticated users only (no anon).
create policy "cloud_snapshots_read_authenticated"
on public.cloud_snapshots
for select
to authenticated
using (true);

-- Write allowlist expanded to all operational entities.
create policy "cloud_snapshots_insert_allowlist_v2"
on public.cloud_snapshots
for insert
to authenticated
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

create policy "cloud_snapshots_update_allowlist_v2"
on public.cloud_snapshots
for update
to authenticated
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

-- No DELETE policy for authenticated on purpose.
-- Verify applied policies:
-- select policyname, cmd, roles from pg_policies where tablename = 'cloud_snapshots';
