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

## 4. Create your identity

1. Open the site, click **Sign in to enter**, then **Create your identity**.
2. Use your email and a passphrase (8+ characters).
3. By default Supabase sends a confirmation email — click the link, then
   sign in. (You can turn confirmation off under
   **Authentication → Sign In / Up → Email** if you prefer.)

## 5. Lock the door (recommended)

Once your own account exists, make the system private:

- **Authentication → Sign In / Up** → turn **off** "Allow new users to sign up".

Now the site is a true single-operator system: no one else can create an
identity, and no ChatGPT/OpenAI dependency remains anywhere.
