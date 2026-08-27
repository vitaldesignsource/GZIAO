// GZ IAO · plaid — the bank connection's server side.
//
// Holds the Plaid client_id and secret, which must never reach a browser.
// Everything it does is scoped to the calling identity, which is read from
// the caller's verified JWT and never from the request body.
//
// Access tokens are stored, used, and deleted here and are never returned
// to the client. Since migration 006 no browser session can read the token
// column at all, so the rows carrying it are reached with the service role;
// every such query is filtered by the verified owner id, because the
// service role bypasses row-level security and must be given the boundary
// explicitly.
//
// Secrets required (Edge Functions → Secrets in the Supabase dashboard):
//   PLAID_CLIENT_ID   your Plaid client_id
//   PLAID_SECRET      the secret for the environment you are using
//   PLAID_ENV         sandbox | production   (defaults to sandbox)
//
// Deploy with JWT verification ON, so only signed-in identities reach it.

import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://gziao.com",
  "https://www.gziao.com",
  "http://localhost:4173",
];

const PLAID_HOSTS: Record<string, string> = {
  sandbox: "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production: "https://production.plaid.com",
};

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function reply(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

const env = () => (Deno.env.get("PLAID_ENV") ?? "sandbox").toLowerCase();

async function plaid(path: string, payload: Record<string, unknown>) {
  const host = PLAID_HOSTS[env()] ?? PLAID_HOSTS.sandbox;
  const response = await fetch(host + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: Deno.env.get("PLAID_CLIENT_ID"),
      secret: Deno.env.get("PLAID_SECRET"),
      ...payload,
    }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    /* Plaid's own error text is the most useful thing we can pass back,
       and it never contains our secret */
    throw new Error(
      (json.error_message as string) || (json.error_code as string) ||
      "Plaid returned " + response.status,
    );
  }
  return json;
}

/* Plaid signs money leaving the account as POSITIVE; bank statements and this
   ledger sign it negative. Normalising here means one convention downstream. */
function normalisedAmount(amount: number): number {
  return -amount;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (req.method !== "POST") return reply(req, 405, { ok: false, reason: "POST only" });

  if (!Deno.env.get("PLAID_CLIENT_ID") || !Deno.env.get("PLAID_SECRET")) {
    return reply(req, 503, {
      ok: false,
      reason: "This function has no Plaid credentials yet. Set PLAID_CLIENT_ID and " +
        "PLAID_SECRET in the Supabase dashboard under Edge Functions → Secrets.",
    });
  }

  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization) return reply(req, 401, { ok: false, reason: "not signed in" });

  /* the caller's own JWT talks to the database, so RLS does the guarding */
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authorization } } },
  );
  const { data: userData, error: userError } = await db.auth.getUser();
  if (userError || !userData?.user) return reply(req, 401, { ok: false, reason: "not signed in" });
  const user = userData.user;

  /* Access tokens are no longer readable by any browser session (migration
     006 withdrew the column grant), so the rows that carry them are reached
     with the elevated key instead. RLS does not apply to it, so every query
     through it is filtered by the id we just verified from the caller's JWT
     — never by anything the request body claimed.

     Projects created before and after Supabase's key rename inject that key
     under different names, so take whichever exists rather than assuming. */
  const SERVICE_KEY_NAMES = [
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SECRET_KEY",
    "SB_SECRET_KEY",
    "SERVICE_ROLE_KEY",
  ];
  const serviceKeyName = SERVICE_KEY_NAMES.find((name) => Deno.env.get(name));
  const serviceKey = serviceKeyName ? Deno.env.get(serviceKeyName)! : "";

  const vault = serviceKey
    ? createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, { auth: { persistSession: false } })
    : db;

  let action = "";
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
    action = String(body.action ?? "");
  } catch {
    return reply(req, 400, { ok: false, reason: "body must be JSON" });
  }

  try {
    /* ---- 1. a token that lets the browser open Plaid Link ---- */
    if (action === "link_token") {
      const result = await plaid("/link/token/create", {
        user: { client_user_id: user.id },
        client_name: "GZ IAO",
        products: ["transactions"],
        country_codes: ["US"],
        language: "en",
        redirect_uri: body.redirect_uri || undefined,
      });
      return reply(req, 200, { ok: true, link_token: result.link_token, env: env() });
    }

    /* ---- 2. trade the browser's public_token for a stored access token ---- */
    if (action === "exchange") {
      const publicToken = String(body.public_token ?? "");
      if (!publicToken) return reply(req, 400, { ok: false, reason: "no public_token" });
      const exchanged = await plaid("/item/public_token/exchange", { public_token: publicToken });
      const accessToken = String(exchanged.access_token);
      const itemId = String(exchanged.item_id);

      let institutionName: string | null = null;
      let institutionId: string | null = null;
      let accounts: unknown[] = [];
      try {
        const got = await plaid("/accounts/get", { access_token: accessToken });
        accounts = (got.accounts as unknown[]) ?? [];
        institutionId = (got.item as Record<string, string>)?.institution_id ?? null;
        if (institutionId) {
          const inst = await plaid("/institutions/get_by_id", {
            institution_id: institutionId,
            country_codes: ["US"],
          });
          institutionName = (inst.institution as Record<string, string>)?.name ?? null;
        }
      } catch {
        /* the connection still works without its display name */
      }

      const { error } = await vault.from("plaid_items").upsert({
        owner_id: user.id,
        item_id: itemId,
        access_token: accessToken,
        institution_id: institutionId,
        institution_name: institutionName,
        accounts,
        status: "active",
      }, { onConflict: "owner_id,item_id" });
      if (error) throw new Error("could not store the connection: " + error.message);

      return reply(req, 200, {
        ok: true,
        item_id: itemId,
        institution_name: institutionName,
        accounts: (accounts as Record<string, unknown>[]).map((a) => ({
          account_id: a.account_id, name: a.name, mask: a.mask,
          type: a.type, subtype: a.subtype,
        })),
      });
    }

    /* ---- 3. what is connected (names only — never tokens) ---- */
    if (action === "items") {
      const { data, error } = await vault.from("plaid_items")
        .select("item_id, institution_name, accounts, status, last_synced_at, created_at")
        .eq("owner_id", user.id)
        .neq("status", "removed");
      if (error) throw new Error(error.message);
      return reply(req, 200, { ok: true, items: data ?? [], env: env() });
    }

    /* ---- 4. pull transactions since the last cursor ---- */
    if (action === "sync") {
      const { data: items, error } = await vault.from("plaid_items")
        .select("item_id, access_token, cursor, institution_name, accounts")
        .eq("owner_id", user.id)
        .eq("status", "active");
      if (error) {
        if (!serviceKey && /permission denied/i.test(error.message)) {
          throw new Error(
            "the connector has no elevated key, so it cannot read the stored bank token. " +
            "Set one of " + SERVICE_KEY_NAMES.join(", ") + " in Edge Function secrets, " +
            "or call this function with action 'diag' to see which names this project injects.",
          );
        }
        throw new Error(error.message);
      }
      if (!items?.length) return reply(req, 200, { ok: true, added: [], removed: [], items: 0 });

      const added: Record<string, unknown>[] = [];
      const modified: Record<string, unknown>[] = [];
      const removed: string[] = [];
      const problems: string[] = [];

      for (const item of items) {
        const accountNames: Record<string, string> = {};
        for (const account of (item.accounts as Record<string, string>[]) ?? []) {
          accountNames[account.account_id] =
            (account.name ?? "account") + (account.mask ? " ••" + account.mask : "");
        }
        let cursor: string | undefined = item.cursor ?? undefined;
        let hasMore = true;
        let guard = 0;
        try {
          while (hasMore && guard < 40) {
            guard++;
            const page = await plaid("/transactions/sync", {
              access_token: item.access_token,
              cursor,
              count: 500,
            });
            const shape = (row: Record<string, any>) => ({
              transaction_id: row.transaction_id,
              account: accountNames[row.account_id] ?? "account",
              account_id: row.account_id,
              date: row.authorized_date || row.date,
              posted_date: row.date,
              description: row.merchant_name || row.name,
              raw_name: row.name,
              amount: normalisedAmount(Number(row.amount)),
              currency: row.iso_currency_code ?? null,
              pending: Boolean(row.pending),
              category: row.personal_finance_category?.primary ?? null,
              channel: row.payment_channel ?? null,
              institution: item.institution_name ?? null,
              location: row.location && (row.location.lat != null || row.location.address)
                ? {
                  address: [row.location.address, row.location.city, row.location.region,
                    row.location.postal_code].filter(Boolean).join(", ") || null,
                  lat: row.location.lat ?? null,
                  lon: row.location.lon ?? null,
                }
                : null,
            });
            for (const row of (page.added as Record<string, any>[]) ?? []) added.push(shape(row));
            for (const row of (page.modified as Record<string, any>[]) ?? []) modified.push(shape(row));
            for (const row of (page.removed as Record<string, any>[]) ?? []) {
              removed.push(row.transaction_id);
            }
            cursor = page.next_cursor as string;
            hasMore = Boolean(page.has_more);
          }
          await vault.from("plaid_items")
            .update({ cursor, last_synced_at: new Date().toISOString() })
            .eq("owner_id", user.id)
            .eq("item_id", item.item_id);
        } catch (itemError) {
          const message = itemError instanceof Error ? itemError.message : String(itemError);
          problems.push((item.institution_name ?? "a connection") + ": " + message);
          if (/ITEM_LOGIN_REQUIRED|reauth/i.test(message)) {
            await vault.from("plaid_items").update({ status: "reauth" })
              .eq("owner_id", user.id).eq("item_id", item.item_id);
          }
        }
      }
      return reply(req, 200, {
        ok: true, added, modified, removed, items: items.length,
        problems: problems.length ? problems : undefined,
      });
    }

    /* ---- 5. cut a connection loose, at Plaid and here ---- */
    if (action === "remove") {
      const itemId = String(body.item_id ?? "");
      if (!itemId) return reply(req, 400, { ok: false, reason: "no item_id" });
      const { data: rows } = await vault.from("plaid_items")
        .select("access_token").eq("owner_id", user.id).eq("item_id", itemId).limit(1);
      const token = rows?.[0]?.access_token;
      if (token) {
        try {
          await plaid("/item/remove", { access_token: token });
        } catch {
          /* already gone at Plaid — still forget it here */
        }
      }
      const { error } = await vault.from("plaid_items").delete()
        .eq("owner_id", user.id).eq("item_id", itemId);
      if (error) throw new Error(error.message);
      return reply(req, 200, { ok: true, removed: itemId });
    }

    /* ---- 6. which elevated key name this project actually injects ---- */
    if (action === "diag") {
      return reply(req, 200, {
        ok: true,
        env: env(),
        serviceKeyName: serviceKeyName ?? null,
        serviceKeyPresent: Boolean(serviceKey),
        available: SERVICE_KEY_NAMES.filter((name) => Boolean(Deno.env.get(name))),
      });
    }

    return reply(req, 400, { ok: false, reason: "unknown action: " + action });
  } catch (error) {
    return reply(req, 502, {
      ok: false,
      reason: error instanceof Error ? error.message : "the request failed",
    });
  }
});
