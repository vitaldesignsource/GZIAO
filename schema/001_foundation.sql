-- ============================================================
-- GZ IAO · Migration 001 — identity foundation and shared field
--
-- Establishes: profiles, households (the shared relationship space),
-- a generalized records table with per-entry visibility, and people
-- profiles carrying real birth data for later chart calculation.
--
-- Non-destructive: vault_records is left intact and copied forward.
-- Safe to re-run.
-- ============================================================

-- ---------- extensions ----------
create extension if not exists pgcrypto;

-- ---------- visibility ----------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'gz_visibility') then
    create type public.gz_visibility as enum ('private', 'shared');
  end if;
end $$;

-- ---------- households (the shared field) ----------
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Shared field',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- profiles (one per authenticated identity) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  household_id uuid references public.households (id) on delete set null,
  created_at timestamptz not null default now()
);

-- current user's household, used by every sharing policy
create or replace function public.my_household()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from public.profiles where id = auth.uid()
$$;

-- new identities get a profile automatically
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- backfill profiles for identities that already exist
insert into public.profiles (id, display_name)
select id, split_part(email, '@', 1) from auth.users
on conflict (id) do nothing;

-- ---------- records (generalized private field) ----------
create table if not exists public.records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  household_id uuid references public.households (id) on delete set null,
  kind text not null default 'record',
  visibility public.gz_visibility not null default 'private',
  title text not null,
  body text,
  grade text,
  occurred_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists records_owner_idx on public.records (owner_id, created_at desc);
create index if not exists records_kind_idx on public.records (kind);
create index if not exists records_shared_idx on public.records (household_id) where visibility = 'shared';

-- ---------- people (profiles of people in the field) ----------
create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  household_id uuid references public.households (id) on delete set null,
  visibility public.gz_visibility not null default 'private',
  display_name text not null,
  relation text,
  birth_date date,
  birth_time time,
  birth_time_known boolean not null default false,
  birth_place text,
  birth_lat numeric,
  birth_lon numeric,
  birth_tz_offset numeric,
  notes text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists people_owner_idx on public.people (owner_id, display_name);

-- ---------- row level security ----------
alter table public.households enable row level security;
alter table public.profiles   enable row level security;
alter table public.records    enable row level security;
alter table public.people     enable row level security;

-- households: visible to members; any authenticated identity may create one
drop policy if exists "household members read" on public.households;
create policy "household members read" on public.households
  for select using (id = public.my_household() or created_by = auth.uid());

drop policy if exists "household create" on public.households;
create policy "household create" on public.households
  for insert with check (created_by = auth.uid());

drop policy if exists "household members update" on public.households;
create policy "household members update" on public.households
  for update using (id = public.my_household()) with check (id = public.my_household());

-- profiles: read own and household members; write only own
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles
  for select using (
    id = auth.uid()
    or (household_id is not null and household_id = public.my_household())
  );

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own" on public.profiles
  for insert with check (id = auth.uid());

-- records: own always; shared entries visible to the household. Only the
-- owner may ever write or delete — sharing never grants edit rights.
drop policy if exists "records read" on public.records;
create policy "records read" on public.records
  for select using (
    owner_id = auth.uid()
    or (
      visibility = 'shared'
      and household_id is not null
      and household_id = public.my_household()
    )
  );

drop policy if exists "records insert own" on public.records;
create policy "records insert own" on public.records
  for insert with check (owner_id = auth.uid());

drop policy if exists "records update own" on public.records;
create policy "records update own" on public.records
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "records delete own" on public.records;
create policy "records delete own" on public.records
  for delete using (owner_id = auth.uid());

-- people: same shape as records
drop policy if exists "people read" on public.people;
create policy "people read" on public.people
  for select using (
    owner_id = auth.uid()
    or (
      visibility = 'shared'
      and household_id is not null
      and household_id = public.my_household()
    )
  );

drop policy if exists "people insert own" on public.people;
create policy "people insert own" on public.people
  for insert with check (owner_id = auth.uid());

drop policy if exists "people update own" on public.people;
create policy "people update own" on public.people
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "people delete own" on public.people;
create policy "people delete own" on public.people
  for delete using (owner_id = auth.uid());

-- ---------- keep updated_at honest ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists records_touch on public.records;
create trigger records_touch before update on public.records
  for each row execute function public.touch_updated_at();

-- ---------- migrate vault_records forward ----------
-- Decodes the title-prefix stopgap into real kind/grade columns.
insert into public.records (id, owner_id, kind, visibility, title, body, grade, created_at)
select
  v.id,
  v.user_id,
  case
    when v.title like 'Dream · %'   then 'dream'
    when v.title like 'Journal · %' then 'journal'
    when v.title like 'Draft: %'    then 'draft'
    else 'record'
  end,
  'private',
  case
    when v.title like 'Dream · %'   then substring(v.title from 9)
    when v.title like 'Journal · %' then btrim(substring(v.title from position(':' in v.title) + 1))
    when v.title like 'Draft: %'    then substring(v.title from 8)
    else v.title
  end,
  v.body,
  case
    when v.title like 'Journal · %'
      then btrim(substring(v.title from 11 for position(':' in v.title) - 11))
    else null
  end,
  v.created_at
from public.vault_records v
on conflict (id) do nothing;
