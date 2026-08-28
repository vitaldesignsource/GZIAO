// GZ IAO · scribe — the AI relay.
//
// Model keys belong on a server, not in a browser. Before this function the
// Scribe held its key in localStorage and called the provider directly, so
// any script running on the page could read it, and every identity had to
// paste their own key.
//
// This relay holds one key per provider in Supabase secrets and forwards
// requests for signed-in identities only. The browser never sees a key, and
// Sky and Meg share one configuration.
//
// It is deliberately NOT a general proxy: the provider and model must both
// come from fixed lists, and the destination path is chosen here rather
// than supplied by the caller. Nothing in the request body can redirect it.
//
// Secrets (Edge Functions → Secrets):
//   GEMINI_API_KEY      a Google AI Studio key — the free tier is enough
//   ANTHROPIC_API_KEY   optional, only if the Anthropic provider is used
//
// Deploy with JWT verification ON.

import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://gziao.com",
  "https://www.gziao.com",
  "http://localhost:4173",
];

/* models this system actually asks for — anything else is refused, so a
   compromised page cannot run up a bill on a larger model */
const ALLOWED_MODELS: Record<string, string[]> = {
  gemini: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"],
  anthropic: ["claude-sonnet-5", "claude-haiku-4-5-20251001"],
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (req.method !== "POST") return reply(req, 405, { ok: false, reason: "POST only" });

  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization) return reply(req, 401, { ok: false, reason: "not signed in" });

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authorization } } },
  );
  /* the token must be handed to getUser explicitly: without an argument
     supabase-js looks for a stored session, which a server has never had */
  const bearer = authorization.replace(/^Bearer\s+/i, "");
  const { data: userData, error: userError } = await db.auth.getUser(bearer);
  if (userError || !userData?.user) return reply(req, 401, { ok: false, reason: "not signed in" });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return reply(req, 400, { ok: false, reason: "body must be JSON" });
  }

  const provider = String(body.provider ?? "");
  const model = String(body.model ?? "");
  const payload = body.payload as Record<string, unknown> | undefined;

  /* which providers this deployment can actually serve — names only */
  if (body.action === "status") {
    return reply(req, 200, {
      ok: true,
      providers: {
        gemini: Boolean(Deno.env.get("GEMINI_API_KEY")),
        anthropic: Boolean(Deno.env.get("ANTHROPIC_API_KEY")),
      },
      models: ALLOWED_MODELS,
    });
  }

  if (!ALLOWED_MODELS[provider]) {
    return reply(req, 400, { ok: false, reason: "unknown provider: " + provider });
  }
  if (!ALLOWED_MODELS[provider].includes(model)) {
    return reply(req, 400, {
      ok: false,
      reason: "model not permitted here: " + model +
        " (allowed: " + ALLOWED_MODELS[provider].join(", ") + ")",
    });
  }
  if (!payload || typeof payload !== "object") {
    return reply(req, 400, { ok: false, reason: "no payload" });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    let upstream: Response;

    if (provider === "gemini") {
      const key = Deno.env.get("GEMINI_API_KEY");
      if (!key) {
        return reply(req, 503, {
          ok: false,
          reason: "This relay has no Gemini key. Set GEMINI_API_KEY in Supabase " +
            "under Edge Functions → Secrets.",
        });
      }
      upstream = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent",
        {
          method: "POST",
          signal: controller.signal,
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify(payload),
        },
      );
    } else {
      const key = Deno.env.get("ANTHROPIC_API_KEY");
      if (!key) {
        return reply(req, 503, {
          ok: false,
          reason: "This relay has no Anthropic key. Set ANTHROPIC_API_KEY in Supabase " +
            "under Edge Functions → Secrets.",
        });
      }
      upstream = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        /* the model is taken from the validated variable, never from the
           caller's payload, so an allowed model cannot be swapped afterwards */
        body: JSON.stringify({ ...payload, model }),
      });
    }

    const text = await upstream.text();
    if (!upstream.ok) {
      /* provider errors are passed through so the app can say what went
         wrong; they never contain the key */
      return reply(req, 502, {
        ok: false,
        reason: "the model provider returned " + upstream.status,
        detail: text.slice(0, 600),
      });
    }
    return new Response(text, {
      status: 200,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return reply(req, 502, {
      ok: false,
      reason: aborted ? "the model took longer than sixty seconds" : "the model could not be reached",
    });
  } finally {
    clearTimeout(timer);
  }
});
