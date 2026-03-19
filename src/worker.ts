export interface Env {
  ASSETS: Fetcher;
  PRIVATE_FILES: R2Bucket;
  PADDLE_WEBHOOK_SECRET: string;
  CONVERTKIT_API_SECRET: string;
  CONVERTKIT_PURCHASE_TAG: string;
  KIT_API_KEY: string;
  KIT_FORM_ID: string;
  SUPPORT_EMAIL: string;
  PRODUCT_NAME: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    // Kit subscribe proxy — quiz email gate
    if (url.pathname === "/api/subscribe" && request.method === "POST") {
      return handleSubscribe(request, env);
    }
    if (url.pathname === "/api/subscribe") {
      return new Response("Method not allowed", { status: 405 });
    }

    // Paddle webhook handler
    if (url.pathname === "/api/paddle-webhook") {
      if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
      return handlePaddleWebhook(request, env, ctx);
    }

    // PDF download — served from R2
    if (url.pathname === "/api/download") {
      if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
      return handlePdfDownload(env);
    }

    // Serve static assets (Astro build output)
    return env.ASSETS.fetch(request);
  },
};

/** ---------------- Kit subscribe proxy ---------------- */

async function handleSubscribe(request: Request, env: Env): Promise<Response> {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const { email, firstName, score, tier } = body;
  if (!email) {
    return json({ ok: false, error: "Missing email" }, 400);
  }

  const kitRes = await fetch(
    `https://api.convertkit.com/v3/forms/${env.KIT_FORM_ID}/subscribe`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: env.KIT_API_KEY,
        email,
        first_name: firstName || "",
        fields: {
          camera_score: String(score ?? ""),
          camera_tier: String(tier ?? ""),
          source: "camera-quiz",
        },
      }),
    }
  );

  if (!kitRes.ok) {
    const errText = await kitRes.text().catch(() => "");
    console.log("Kit API error:", kitRes.status, errText);
    return json({ ok: false }, 502);
  }

  return json({ ok: true }, 200);
}

/** ---------------- Paddle webhook handler ---------------- */

async function handlePaddleWebhook(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const sig = request.headers.get("Paddle-Signature");
  if (!sig) return new Response("Missing Paddle-Signature", { status: 400 });

  const rawBody = await request.text();

  const valid = await verifyPaddleSignature(rawBody, sig, env.PADDLE_WEBHOOK_SECRET);
  if (!valid) return new Response("Invalid signature", { status: 400 });

  ctx.waitUntil(processPaddleEvent(rawBody, env));
  return new Response("OK", { status: 200 });
}

async function processPaddleEvent(rawBody: string, env: Env): Promise<void> {
  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    console.log("Paddle webhook: failed to parse JSON");
    return;
  }

  if (event?.event_type !== "transaction.completed") return;

  const email = event?.data?.customer?.email;
  if (!email) {
    console.log("Paddle webhook: no customer email in payload");
    return;
  }

  try {
    const res = await fetch(
      `https://api.convertkit.com/v3/tags/${env.CONVERTKIT_PURCHASE_TAG}/subscribe`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_secret: env.CONVERTKIT_API_SECRET,
          email,
        }),
      }
    );
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.log("ConvertKit tag error:", res.status, errText);
    }
  } catch (err) {
    console.log("ConvertKit request failed:", err);
  }
}

/** ---------------- PDF download (served from R2) ---------------- */

async function handlePdfDownload(env: Env): Promise<Response> {
  const obj = await env.PRIVATE_FILES.get("secure-your-cameras-guide.pdf");
  if (!obj) {
    return new Response("Download coming soon — check back shortly.", { status: 404 });
  }

  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  headers.set("Content-Disposition", 'attachment; filename="Secure-Your-Cameras-Guide.pdf"');
  headers.set("Cache-Control", "public, max-age=3600");

  return new Response(obj.body, { headers });
}

/** ---------------- Paddle signature verification ---------------- */

async function verifyPaddleSignature(rawBody: string, sigHeader: string, secret: string): Promise<boolean> {
  const parts = Object.fromEntries(
    sigHeader.split(";").map((s) => s.split("=") as [string, string])
  );
  const ts = parts["ts"];
  const h1 = parts["h1"];
  if (!ts || !h1) return false;

  const now = Math.floor(Date.now() / 1000);
  const tsNum = parseInt(ts, 10);
  if (!Number.isFinite(tsNum) || Math.abs(now - tsNum) > 300) return false;

  const signedPayload = `ts:${ts}\n${rawBody}\n`;
  const expected = await hmacSha256Hex(secret, signedPayload);
  return timingSafeEqualHex(expected, h1);
}

/** ---------------- Shared crypto utilities ---------------- */

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/** ---------------- Helpers ---------------- */

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
