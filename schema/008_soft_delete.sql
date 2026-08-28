-- ============================================================
-- GZ IAO · Migration 008 — Destroy stops being permanent
--
-- Before this, "Destroy" on a record ran a real DELETE and, for a
-- document, removed the stored file too. There was no confirmation on
-- any of the five Destroy buttons, no trash, no undo, and no history.
-- A single misdirected tap on a phone permanently destroyed a preserved
-- legal document or a sealed journal entry, and nothing in the system
-- could get it back.
--
-- A record of legal matters and financial statements should not have a
-- one-click irreversible delete. Destroy now sets deleted_at; the record
-- leaves every view, stops being readable by anyone it was shared with,
-- and waits in Trash until it is either restored or purged deliberately.
--
-- Purge is still a real DELETE. That is the point: it is a separate,
-- confirmed act rather than the default one.
-- Safe to re-run.
-- ============================================================

alter table public.records
  add column if not exists deleted_at timestamptz;

-- every ordinary read is "the live field", so the index matches it
create index if not exists records_live_by_owner
  on public.records (owner_id, created_at desc)
  where deleted_at is null;

-- and Trash is a small, rare read
create index if not exists records_deleted_by_owner
  on public.records (owner_id, deleted_at desc)
  where deleted_at is not null;

-- ---- a destroyed record stops being visible to others immediately ----
--
-- The owner still sees it (that is what Trash is), but nobody it was
-- shared with should keep reading something its owner has destroyed.
-- Both read paths are restated here with that condition added.

drop policy if exists "records read" on public.records;
create policy "records read" on public.records
  for select using (
    owner_id = auth.uid()
    or (
      deleted_at is null
      and visibility = 'shared'
      and household_id is not null
      and household_id = public.my_household()
    )
  );

-- the per-record unit share from migration 003, likewise
drop policy if exists "records shared to me" on public.records;
create policy "records shared to me" on public.records
  for select to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from public.record_shares s
      where s.record_id = records.id
        and s.to_user = auth.uid()
        and s.status = 'accepted'
    )
  );

-- ---- and its stored file stops being downloadable by others ----
--
-- These two mirror the policies migration 007 fixed; the owner-binding
-- clause from 007 is preserved and the deleted_at check is added.

drop policy if exists "vault read shared" on storage.objects;
create policy "vault read shared" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'vault'
    and exists (
      select 1 from public.records r
      where r.meta->>'path' = storage.objects.name
        and r.owner_id::text = (storage.foldername(storage.objects.name))[1]
        and r.deleted_at is null
        and r.visibility = 'shared'
        and r.household_id is not null
        and r.household_id = public.my_household()
    )
  );

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
        and r.owner_id::text = (storage.foldername(storage.objects.name))[1]
        and r.deleted_at is null
        and s.to_user = auth.uid()
        and s.status = 'accepted'
    )
  );

-- ---- what this should look like afterwards ----
--
--   select count(*) from public.records where deleted_at is not null;
--   -- expect 0 on first run
--
--   select column_name from information_schema.columns
--    where table_name = 'records' and column_name = 'deleted_at';
--   -- expect one row
--
-- The client detects this column at load. Until this migration is run it
-- falls back to the old hard delete and says so in the Trash panel, so
-- applying it late is safe and never loses anything.
