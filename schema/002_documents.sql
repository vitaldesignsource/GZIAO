-- ============================================================
-- GZ IAO · Migration 002 — private document storage
--
-- Creates the private 'vault' storage bucket. Files live under a
-- folder named by the owner's user id; policies allow each identity
-- to manage only its own folder, plus read access to files whose
-- record row has been explicitly shared to the household.
-- Safe to re-run.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('vault', 'vault', false)
on conflict (id) do nothing;

drop policy if exists "vault upload own" on storage.objects;
create policy "vault upload own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'vault'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "vault read own" on storage.objects;
create policy "vault read own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'vault'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "vault delete own" on storage.objects;
create policy "vault delete own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'vault'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- a document whose record row is shared to the household is downloadable
-- by household members (read only — never write or delete)
drop policy if exists "vault read shared" on storage.objects;
create policy "vault read shared" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'vault'
    and exists (
      select 1 from public.records r
      where r.meta->>'path' = storage.objects.name
        and r.visibility = 'shared'
        and r.household_id is not null
        and r.household_id = public.my_household()
    )
  );
