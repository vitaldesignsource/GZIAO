-- ============================================================
-- GZ IAO · Migration 004 — connected bank items (Plaid)
--
-- One row per linked institution. The access token is a bearer
-- credential for that bank connection: it never reaches the browser,
-- is never returned by any function, and is readable only by the
-- identity that created it. Safe to re-run.
-- ============================================================

create table if not exists public.plaid_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  access_token text not null,
  institution_id text,
  institution_name text,
  accounts jsonb not null default '[]'::jsonb,
  cursor text,
  status text not null default 'active' check (status in ('active', 'reauth', 'removed')),
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists plaid_items_owner_item
  on public.plaid_items (owner_id, item_id);

alter table public.plaid_items enable row level security;

-- the only policy: your own rows, nobody else's, ever
drop policy if exists "plaid items owner" on public.plaid_items;
create policy "plaid items owner" on public.plaid_items
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
