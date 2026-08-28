# GZ IAO — Independent auth setup (Supabase)

The site no longer depends on ChatGPT login. Auth and data run on your own
free Supabase project. One-time setup, about 5 minutes:

## 1. Create the project

1. Go to [supabase.com](https://supabase.com) and sign up (free).
2. Create a new project (any name, e.g. `gziao`). Pick a strong database
   password and save it somewhere safe — you won't need it for the site,
   only for database administration.

## 2. Connect the site

1. In the Supabase dashboard open **Project Settings → API** (or **Data API**).
2. Copy the **Project URL** and the **anon / publishable key**.
3. Paste both into [`config.js`](config.js):

```js
window.GZ_CONFIG = {
  SUPABASE_URL: "https://YOURPROJECT.supabase.co",
  SUPABASE_ANON_KEY: "YOUR-ANON-KEY",
};
```

The anon key is designed to be public; privacy comes from row-level
security (next step), not from hiding the key.

## 3. Schema

Run every file in `schema/` in numerical order in the **SQL Editor**. All of
them are written to be safe to re-run, so applying them again on an existing
project is harmless.

| file | what it adds |
|---|---|
| `001_foundation.sql` | households, profiles, records, people — the base tables and their RLS |
| `002_documents.sql` | the private `vault` storage bucket and its access policies |
| `003_units.sql` | `unit_links` and `record_shares` — two identities linking, and offering single records to each other |
| `004_plaid.sql` | `plaid_items`, one row per linked bank |
| `006_seal_tokens.sql` | withdraws browser SELECT on the Plaid access token, and stops a sender approving their own offer |
| `007_share_scope.sql` | narrows a recipient's UPDATE to the status column, and stops a record claiming a file it does not own |

There is no `005`. It was reserved for the field index (full-text and
semantic retrieval) and that work is not finished; the number is left free
rather than reused, so a later 005 can land where it belongs.

**006 and 007 are not optional.** Each closes a hole that the migration
before it opened, and 004's own comment now says so. A project running
001–004 without them lets any signed-in session read its own bank access
token and lets a share recipient reach records never offered to them.

`001_foundation.sql` creates:

- `households` — the shared relationship field
- `profiles` — one per identity, auto-created on signup, linked to a household
- `records` — all private-field content, typed by `kind` (record, journal, dream,
  draft) with `grade`, `occurred_at`, `meta` jsonb, and a `visibility` of
  `private` or `shared`
- `people` — person profiles carrying real birth data for chart calculation

**Sharing model.** Row-level security grants read access to your own rows always,
plus any row marked `shared` belonging to your household. Writes and deletes stay
owner-only — sharing an entry never grants anyone else the right to edit it, and
you can return any entry to private at any time.

The original `vault_records` table is left in place and its contents copied into
`records`; nothing was deleted.

### Legacy: the original vault table

In the dashboard open **SQL Editor**, paste this, and run it:

```sql
create table public.vault_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  body text,
  created_at timestamptz not null default now()
);

alter table public.vault_records enable row level security;

create policy "Users manage only their own records"
  on public.vault_records
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

Row-level security means each signed-in identity can only ever see and
touch its own records — even though the site itself is public static files.

## 4. Membership is invite-only

Public sign-up is disabled. The master identity is `3magipress@gmail.com`;
every other member joins only by invitation:

1. In the Supabase dashboard open **Authentication → Users → Add user →
   Invite user** (or use "Send invitation").
2. Enter the person's email. They receive an email whose link lands on the
   site's claim page (`welcome.html`), where they set their own passphrase.
3. Their vault is private to them automatically — row-level security keeps
   every identity's records isolated, including from the master account.

Lost passphrases are self-service: the identity gate has a
"Forgot passphrase?" link that emails a recovery link to the same claim page.

Keep **Authentication → Sign In / Up → "Allow new users to sign up"** turned
**off** — invitations still work with it off, and nobody can join uninvited.
