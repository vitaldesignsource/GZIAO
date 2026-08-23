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

## 3. Create the Vault table

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
