-- ============================================================
-- GZ IAO · Migration 007 — a recipient may answer, not redirect;
--                          and a record may not claim someone
--                          else's file
--
-- Two more holes of the same family as 006: a policy that was written
-- to permit one narrow act, expressed in a form that permits many.
-- Both found by review. Safe to re-run.
--
-- 1. "shares recipient respond" (003) is `for update using (to_user =
--    auth.uid())`. It was meant to let the recipient move status from
--    'pending' to 'accepted' or 'declined'. But an UPDATE policy governs
--    which ROWS may be written, never which COLUMNS — so the recipient
--    of one legitimate offer could repoint record_id at any record whose
--    UUID they knew, set status = 'accepted', and the "records shared to
--    me" policy would then hand them that record. One share received
--    became read access to anything. The same shape applies to
--    unit_links.
--
-- 2. Both vault read policies match a record to a file on
--    `r.meta->>'path' = storage.objects.name` and never check that the
--    record's owner is the file's owner. Vault paths begin with the
--    owner's uuid, so the file itself states who it belongs to — and
--    nothing compared the two. A user could insert a record whose
--    meta.path named another identity's file, share it (to an accomplice,
--    or to themselves), accept it, and read that file. The record was
--    trusted about a fact it was in no position to assert.
-- ============================================================

-- ---- 1. the answer is 'accepted' or 'declined', and nothing else ----
--
-- Postgres has no "update only these columns" clause for RLS, but it does
-- have column-level UPDATE privileges, which are checked alongside RLS.
-- The table-level grant is withdrawn and only the answerable columns are
-- granted back, exactly as 006 did for plaid_items.access_token. An
-- attempt to write record_id now fails on privilege before RLS is
-- consulted at all.

revoke update on public.record_shares from authenticated, anon;
grant update (status) on public.record_shares to authenticated;

-- a link's recipient also stamps their own id when they accept, so that
-- column is answerable too; to_user is pinned to the responder by the
-- existing "links recipient respond" with-check
revoke update on public.unit_links from authenticated, anon;
grant update (status, to_user) on public.unit_links to authenticated;

-- ---- 2. a record may only vouch for a file it actually owns ----
--
-- storage.foldername(name))[1] is the first path segment, which the app
-- always writes as the uploader's uuid. Requiring the claiming record's
-- owner_id to equal it means a record can only ever point at its own
-- owner's file.

drop policy if exists "vault read shared" on storage.objects;
create policy "vault read shared" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'vault'
    and exists (
      select 1 from public.records r
      where r.meta->>'path' = storage.objects.name
        and r.owner_id::text = (storage.foldername(storage.objects.name))[1]
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
        and s.to_user = auth.uid()
        and s.status = 'accepted'
    )
  );

-- ---- what this should look like afterwards ----
--
--   select column_name, privilege_type
--     from information_schema.column_privileges
--    where table_name = 'record_shares' and grantee = 'authenticated'
--      and privilege_type = 'UPDATE';
--   -- expect exactly one row: status
--
--   select count(*) from information_schema.table_privileges
--    where table_name = 'record_shares' and grantee = 'authenticated'
--      and privilege_type = 'UPDATE';
--   -- expect 0
