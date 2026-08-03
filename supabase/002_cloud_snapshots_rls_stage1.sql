-- Stage 1 hardening for cloud_snapshots.
-- Goal: keep read access for diagnostics, restrict writes to allowlist,
-- and block delete operations from anon/authenticated clients.

alter table public.cloud_snapshots enable row level security;

-- Cleanup previous permissive and transitional policies.
drop policy if exists "cloud_snapshots_anon_all" on public.cloud_snapshots;
drop policy if exists "cloud_snapshots_read_all" on public.cloud_snapshots;
drop policy if exists "cloud_snapshots_insert_allowlist" on public.cloud_snapshots;
drop policy if exists "cloud_snapshots_update_allowlist" on public.cloud_snapshots;

-- Read is still open for app diagnostics (phase 1 without auth/tenant).
create policy "cloud_snapshots_read_all"
on public.cloud_snapshots
for select
to anon, authenticated
using (true);

-- Writes are restricted to the operational allowlist.
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

-- No DELETE policy for anon/authenticated on purpose.
-- Without a policy, delete is denied by default under RLS.