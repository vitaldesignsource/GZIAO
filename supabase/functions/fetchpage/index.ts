// GZ IAO · fetchpage — the one server-side key.
//
// A minimal authenticated page-fetch relay. The static site cannot read
// cross-origin pages (publishers rarely send CORS headers); this function
// fetches a page server-side and returns its text, unlocking Watchtower
// full-text and, later, Sentinel web-domain extraction.
//
// Safety posture:
//   - The caller is verified here, in this function, against the project's
//     auth. It does NOT rely on the platform's JWT gate: that gate checks
//     the legacy shared secret, which stops working the moment a project
//     moves to asymmetric signing keys, and a relay must not become an open
//     proxy because a platform setting changed underneath it.
//   - https only; named hosts only (no raw IPs); obvious private and
//     link-local names refused — no reaching into anyone's network. Every
//     redirect hop is taken manually and revalidated against the same
//     rules, so a public host cannot bounce us somewhere internal.
//   - 10-second timeout, 2 MB cap, text-like content only.

import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://gziao.com",
  "https://www.gziao.com",
  "http://localhost:4173",
];

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

function refused(req: Request, status: number, reason: string): Response {
  return new Response(JSON.stringify({ ok: false, reason }), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

function hostRefused(host: string): string | null {
  const h = host.toLowerCase();
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(h)) {
    return "only named public hosts are fetched";
  }
  if (
    h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") ||
    h.endsWith(".internal") || h.endsWith(".lan") || h.endsWith(".home.arpa") ||
    h.endsWith(".supabase.co") || h.endsWith(".supabase.net")
  ) {
    return "that host is not reachable from here";
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") return refused(req, 405, "POST only");

  /* who is asking — checked here rather than assumed from the gateway */
  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization) return refused(req, 401, "not signed in");
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authorization } } },
  );
  /* the token must be handed to getUser explicitly: without an argument
     supabase-js looks for a stored session, which a server has never had */
  const bearer = authorization.replace(/^Bearer\s+/i, "");
  const { data: userData, error: userError } = await db.auth.getUser(bearer);
  if (userError || !userData?.user) return refused(req, 401, "not signed in");

  let url = "";
  try {
    const body = await req.json();
    url = String(body.url ?? "");
  } catch {
    return refused(req, 400, "body must be JSON: {\"url\": \"https://…\"}");
  }

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return refused(req, 400, "not a valid URL");
  }
  if (target.protocol !== "https:") return refused(req, 400, "https only");
  if (target.username || target.password) return refused(req, 400, "no credentials in URLs");
  const hostProblem = hostRefused(target.hostname);
  if (hostProblem) return refused(req, 400, hostProblem);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    /* Following redirects automatically would let a public host bounce us
       to an internal address, since the host rules only ever saw the URL
       the caller supplied. Each hop is taken by hand and revalidated. */
    let hops = 0;
    let current = target;
    let upstream: Response;
    while (true) {
      upstream = await fetch(current.href, {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          "User-Agent": "GZIAO-Reader/1.0 (+https://gziao.com)",
          "Accept": "text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.5",
        },
      });
      if (upstream.status < 300 || upstream.status > 399) break;
      const location = upstream.headers.get("location");
      if (!location) break;
      /* the redirect's own body is never wanted — release it */
      await upstream.body?.cancel().catch(() => {});
      if (++hops > 5) return refused(req, 502, "too many redirects");
      let next: URL;
      try {
        next = new URL(location, current.href);
      } catch {
        return refused(req, 502, "the redirect target was not a valid URL");
      }
      if (next.protocol !== "https:") {
        return refused(req, 400, "a redirect tried to leave https");
      }
      if (next.username || next.password) {
        return refused(req, 400, "a redirect carried credentials");
      }
      const hopProblem = hostRefused(next.hostname);
      if (hopProblem) {
        return refused(req, 400, "a redirect pointed somewhere unreachable: " + hopProblem);
      }
      current = next;
    }
    const contentType = upstream.headers.get("content-type") ?? "";
    if (!/text\/|application\/(json|xhtml|xml)/i.test(contentType)) {
      return refused(req, 415, "only text-like content is relayed (got " + contentType + ")");
    }
    const reader = upstream.body?.getReader();
    if (!reader) return refused(req, 502, "empty upstream body");
    const chunks: Uint8Array[] = [];
    let total = 0;
    const CAP = 2 * 1024 * 1024;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > CAP) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
    const merged = new Uint8Array(Math.min(total, CAP));
    let at = 0;
    for (const chunk of chunks) {
      const room = merged.length - at;
      if (room <= 0) break;
      merged.set(room >= chunk.length ? chunk : chunk.slice(0, room), at);
      at += Math.min(room, chunk.length);
    }
    const text = new TextDecoder("utf-8", { fatal: false }).decode(merged);
    return new Response(
      JSON.stringify({
        ok: true,
        status: upstream.status,
        contentType,
        truncated: total > CAP,
        finalUrl: upstream.url || current.href,
        text,
      }),
      { headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  } catch (error) {
    const reason = error instanceof Error && error.name === "AbortError"
      ? "the page took longer than ten seconds"
      : "the page could not be fetched";
    return refused(req, 502, reason);
  } finally {
    clearTimeout(timer);
  }
});
