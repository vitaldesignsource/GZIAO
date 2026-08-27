-- ============================================================
-- GZ IAO · Migration 006 — seal the bank token, and stop senders
--                          approving their own offers
--
-- Two defects, both mine, both found by review rather than by anything
-- going wrong. Safe to re-run.
--
-- 1. 004_plaid.sql claims the Plaid access token "never reaches the
--    browser". The Edge Function is careful never to return it, but the
--    table policy is `for all using (owner_id = auth.uid())`, and a
--    table-level SELECT grant covers every column. Any signed-in session
--    could read the token from the browser console. The comment was true
--    of the function and false of the database.
--
-- 2. 003_units.sql gives the sender `for all` on their own rows, which
--    includes UPDATE — so a sender could set status = 'accepted' on their
--    own invitation or offer. The whole point of the model is that the
--    recipient decides.
-- ============================================================

-- ---- 1. the access token stops being a readable column ----
--
-- Column-level privileges cannot subtract from a table-level grant, so the
-- table grant is withdrawn and every column EXCEPT access_token is granted
-- back. RLS still governs which rows; this governs which columns.
revoke select on public.plaid_items from authenticated, anon;

grant select (
  id, owner_id, item_id, institution_id, institution_name,
  accounts, cursor, status, last_synced_at, created_at
) on public.plaid_items to authenticated;

-- writes to this table happen only inside the Edge Function, which now
-- holds the service role for exactly that purpose
revoke insert, update, delete on public.plaid_items from authenticated, anon;

-- ---- 2. the sender may offer and withdraw, but never accept ----

drop policy if exists "shares sender" on public.record_shares;

drop policy if exists "shares sender read" on public.record_shares;
create policy "shares sender read" on public.record_shares
  for select to authenticated
  using (from_user = auth.uid());

drop policy if exists "shares sender offer" on public.record_shares;
create policy "shares sender offer" on public.record_shares
  for insert to authenticated
  with check (
    from_user = auth.uid()
    and status = 'pending'
    and exists (select 1 from public.records r where r.id = record_id and r.owner_id = auth.uid())
  );

-- withdrawing an offer is deletion, which the sender may always do
drop policy if exists "shares sender withdraw" on public.record_shares;
create policy "shares sender withdraw" on public.record_shares
  for delete to authenticated
  using (from_user = auth.uid());

-- no UPDATE policy for the sender: only "shares recipient respond" from
-- migration 003 can move a share out of 'pending'

-- ---- the same hole existed on invitations ----

drop policy if exists "links sender" on public.unit_links;

drop policy if exists "links sender read" on public.unit_links;
create policy "links sender read" on public.unit_links
  for select to authenticated
  using (from_user = auth.uid());

drop policy if exists "links sender invite" on public.unit_links;
create policy "links sender invite" on public.unit_links
  for insert to authenticated
  with check (
    from_user = auth.uid()
    and status = 'pending'
    and to_user is null
  );

drop policy if exists "links sender withdraw" on public.unit_links;
create policy "links sender withdraw" on public.unit_links
  for delete to authenticated
  using (from_user = auth.uid());

-- no UPDATE policy for the sender: a link becomes 'accepted' only through
-- "links recipient respond", whose check pins to_user to the responder
