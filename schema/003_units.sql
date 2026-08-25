-- ============================================================
-- GZ IAO · Migration 003 — units and per-member sharing
--
-- A "unit" is the set of users you have linked with, one accepted
-- invitation at a time. Linked members can offer individual records
-- to each other; the recipient approves or declines, and only an
-- accepted share makes the record (and its stored file) readable.
-- Safe to re-run.
-- ============================================================

-- ---- invitations that link two users ----
create table if not exists public.unit_links (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users(id) on delete cascade,
  from_email text not null,
  to_email text not null,
  to_user uuid references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now()
);
alter table public.unit_links enable row level security;

drop policy if exists "links sender" on public.unit_links;
create policy "links sender" on public.unit_links
  for all to authenticated
  using (from_user = auth.uid())
  with check (from_user = auth.uid());

drop policy if exists "links recipient read" on public.unit_links;
create policy "links recipient read" on public.unit_links
  for select to authenticated
  using (lower(to_email) = lower(auth.jwt() ->> 'email') or to_user = auth.uid());

drop policy if exists "links recipient respond" on public.unit_links;
create policy "links recipient respond" on public.unit_links
  for update to authenticated
  using (lower(to_email) = lower(auth.jwt() ->> 'email') or to_user = auth.uid())
  with check (to_user = auth.uid());

-- ---- one record offered to one linked member ----
create table if not exists public.record_shares (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.records(id) on delete cascade,
  from_user uuid not null references auth.users(id) on delete cascade,
  from_email text not null,
  to_user uuid not null references auth.users(id) on delete cascade,
  to_email text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now()
);
alter table public.record_shares enable row level security;

drop policy if exists "shares sender" on public.record_shares;
create policy "shares sender" on public.record_shares
  for all to authenticated
  using (from_user = auth.uid())
  with check (
    from_user = auth.uid()
    and exists (select 1 from public.records r where r.id = record_id and r.owner_id = auth.uid())
  );

drop policy if exists "shares recipient read" on public.record_shares;
create policy "shares recipient read" on public.record_shares
  for select to authenticated
  using (to_user = auth.uid());

drop policy if exists "shares recipient respond" on public.record_shares;
create policy "shares recipient respond" on public.record_shares
  for update to authenticated
  using (to_user = auth.uid())
  with check (to_user = auth.uid());

-- ---- an accepted share makes the record readable ----
drop policy if exists "records shared to me" on public.records;
create policy "records shared to me" on public.records
  for select to authenticated
  using (exists (
    select 1 from public.record_shares s
    where s.record_id = records.id
      and s.to_user = auth.uid()
      and s.status = 'accepted'
  ));

-- ---- and its stored file downloadable (read only, never write) ----
drop policy if exists "vault read unit shared" on storage.objects;
create policy "vault read unit shared" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'vault'
    and exists (
      select 1
      from public.records r
      join public.record_shares s on s.record_id = r.id
      where r.meta ->> 'path' = storage.objects.name
        and s.to_user = auth.uid()
        and s.status = 'accepted'
    )
  );
