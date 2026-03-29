export interface Env {
  ASSETS: Fetcher;
  PRIVATE_FILES: R2Bucket;
  PADDLE_WEBHOOK_SECRET: string;
  CONVERTKIT_API_SECRET: string;
  CONVERTKIT_PURCHASE_TAG: string;
  KIT_API_KEY: string;
  KIT_FORM_ID: string;
  CONVERTKIT_QUIZ_TAG: string;
  CONVERTKIT_GUIDE_TAG: string;
  CONVERTKIT_UPSELL_TAG: string;
  PADDLE_GUIDE_PRODUCT_ID: string;
  PADDLE_UPSELL_PRODUCT_ID: string;
  DOWNLOAD_SECRET: string;
  SUPPORT_EMAIL: string;
  PRODUCT_NAME: string;
}

const DOWNLOAD_TTL_IMMEDIATE = 48 * 60 * 60; // 48 hours (checkout redirect)
const DOWNLOAD_TTL_EMAIL = 7 * 24 * 60 * 60; // 7 days (email delivery)

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

    // Create download token — called after Paddle checkout completes
    if (url.pathname === "/api/create-download-token") {
      if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
      return handleCreateDownloadToken(request, env);
    }

    // PDF download — served from R2, requires valid signed token
    if (url.pathname === "/api/download") {
      if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
      return handlePdfDownload(url, env);
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

  // Apply quiz-completed tag for automation triggers
  if (env.CONVERTKIT_QUIZ_TAG) {
    try {
      await fetch(
        `https://api.convertkit.com/v3/tags/${env.CONVERTKIT_QUIZ_TAG}/subscribe`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_secret: env.CONVERTKIT_API_SECRET,
            email,
            fields: {
              camera_score: String(score ?? ""),
              camera_tier: String(tier ?? ""),
            },
          }),
        }
      );
    } catch (err) {
      console.log("Quiz tag error:", err);
    }
  }

  return json({ ok: true }, 200);
}

/** ---------------- Download token creation ---------------- */

async function handleCreateDownloadToken(request: Request, env: Env): Promise<Response> {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const { transactionId, fileType } = body;
  if (!transactionId || typeof transactionId !== "string") {
    return json({ ok: false, error: "Missing transactionId" }, 400);
  }
  const file = (fileType === "checklist") ? "checklist" : "guide";

  const expires = Math.floor(Date.now() / 1000) + DOWNLOAD_TTL_IMMEDIATE;
  const token = await generateDownloadToken(transactionId, expires, env.DOWNLOAD_SECRET, file);

  return json({ ok: true, token, expires, file }, 200);
}

/** ---------------- Paddle webhook handler ---------------- */

async function handlePaddleWebhook(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const sig = request.headers.get("Paddle-Signature");
  if (!sig) return new Response("Missing Paddle-Signature", { status: 400 });

  const rawBody = await request.text();

  const valid = await verifyPaddleSignature(rawBody, sig, env.PADDLE_WEBHOOK_SECRET);
  if (!valid) return new Response("Invalid signature", { status: 400 });

  ctx.waitUntil(processPaddleEvent(rawBody, env, request.url));
  return new Response("OK", { status: 200 });
}

async function processPaddleEvent(rawBody: string, env: Env, requestUrl: string): Promise<void> {
  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    console.log("Paddle webhook: failed to parse JSON");
    return;
  }

  if (event?.event_type !== "transaction.completed") return;

  const email = event?.data?.customer?.email;
  const transactionId = event?.data?.id;
  if (!email) {
    console.log("Paddle webhook: no customer email in payload");
    return;
  }

  // Determine which product(s) were purchased
  const items: any[] = event?.data?.items || [];
  const productIds = items.map((item: any) => item?.price?.product_id || "");

  const boughtGuide = !env.PADDLE_GUIDE_PRODUCT_ID || productIds.includes(env.PADDLE_GUIDE_PRODUCT_ID) || productIds.length === 0;
  const boughtUpsell = env.PADDLE_UPSELL_PRODUCT_ID && productIds.includes(env.PADDLE_UPSELL_PRODUCT_ID);

  // Generate file-specific 7-day download links for email delivery
  const origin = new URL(requestUrl).origin;
  let guideDownloadUrl = "";
  let checklistDownloadUrl = "";
  if (transactionId && env.DOWNLOAD_SECRET) {
    const expires = Math.floor(Date.now() / 1000) + DOWNLOAD_TTL_EMAIL;
    const guideToken = await generateDownloadToken(transactionId, expires, env.DOWNLOAD_SECRET, "guide");
    guideDownloadUrl = `${origin}/api/download?token=${guideToken}&expires=${expires}&file=guide`;

    const checklistToken = await generateDownloadToken(transactionId, expires, env.DOWNLOAD_SECRET, "checklist");
    checklistDownloadUrl = `${origin}/api/download?token=${checklistToken}&expires=${expires}&file=checklist`;
  }

  // Tag purchaser in Kit based on which product they bought
  const tagCalls: Promise<void>[] = [];

  if (boughtGuide) {
    const tagId = env.CONVERTKIT_GUIDE_TAG || env.CONVERTKIT_PURCHASE_TAG;
    tagCalls.push(tagSubscriberInKit(env, tagId, email, {
      download_url: guideDownloadUrl,
      transaction_id: transactionId || "",
    }));
  }

  if (boughtUpsell) {
    tagCalls.push(tagSubscriberInKit(env, env.CONVERTKIT_UPSELL_TAG, email, {
      checklist_download_url: checklistDownloadUrl,
      transaction_id: transactionId || "",
    }));
  }

  await Promise.allSettled(tagCalls);
}

async function tagSubscriberInKit(
  env: Env,
  tagId: string,
  email: string,
  fields: Record<string, string>
): Promise<void> {
  try {
    const res = await fetch(
      `https://api.convertkit.com/v3/tags/${tagId}/subscribe`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_secret: env.CONVERTKIT_API_SECRET,
          email,
          fields,
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

/** ---------------- PDF download (served from R2, token-gated) ---------------- */

async function handlePdfDownload(url: URL, env: Env): Promise<Response> {
  const token = url.searchParams.get("token");
  const expiresStr = url.searchParams.get("expires");

  if (!token || !expiresStr) {
    return new Response("Access denied — valid download link required.", {
      status: 403,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const expires = parseInt(expiresStr, 10);
  if (!Number.isFinite(expires)) {
    return new Response("Invalid download link.", { status: 403 });
  }

  // Check expiry
  const now = Math.floor(Date.now() / 1000);
  if (now > expires) {
    return new Response(
      "This download link has expired. Check your email for a fresh link, or contact " + env.SUPPORT_EMAIL,
      { status: 403, headers: { "Content-Type": "text/plain" } }
    );
  }

  // Read file param before verification (file is part of the signed payload)
  const fileParam = url.searchParams.get("file") || "guide";
  const FILES: Record<string, { r2Key: string; filename: string }> = {
    guide: {
      r2Key: "secure-your-cameras-guide.pdf",
      filename: "Secure-Your-Cameras-Guide.pdf",
    },
    checklist: {
      r2Key: "home-network-security-checklist.pdf",
      filename: "Home-Network-Security-Checklist.pdf",
    },
  };
  const fileInfo = FILES[fileParam] || FILES.guide;

  // Verify HMAC — token signs expires + fileType
  const expected = await hmacSha256Hex(env.DOWNLOAD_SECRET, `download:${fileParam}:${expiresStr}`);
  if (!timingSafeEqualHex(expected, token)) {
    return new Response("Invalid download link.", { status: 403 });
  }
  const obj = await env.PRIVATE_FILES.get(fileInfo.r2Key);
  if (!obj) {
    return new Response("Download coming soon — check back shortly.", { status: 404 });
  }

  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  headers.set("Content-Disposition", `attachment; filename="${fileInfo.filename}"`);
  headers.set("Cache-Control", "private, no-store");

  return new Response(obj.body, { headers });
}

/** ---------------- Download token generation ---------------- */

async function generateDownloadToken(transactionId: string, expires: number, secret: string, fileType: string = "guide"): Promise<string> {
  // Token signs the expiry timestamp + file type. The transactionId is accepted
  // for audit purposes but token validity depends on expires + fileType + secret.
  // A guide token cannot be used to download the checklist and vice versa.
  return hmacSha256Hex(secret, `download:${fileType}:${expires}`);
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
