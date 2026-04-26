export interface Env {
  ASSETS: Fetcher;
  PRIVATE_FILES: R2Bucket;
  PURCHASE_RECORDS: KVNamespace;
  PADDLE_WEBHOOK_SECRET: string;
  PADDLE_API_KEY: string;
  PADDLE_ENV: string; // "sandbox" or "production"
  RESEND_API_KEY: string;
  RESEND_FROM: string; // e.g. "Secure My Cameras <orders@salishsecurity.ai>"
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

// Hoisted to module scope so both handlePdfDownload and any future handlers share it
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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    // Kit subscribe proxy — quiz email gate
    if (url.pathname === "/api/subscribe" && request.method === "POST") {
      return handleSubscribe(request, env, ctx);
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

    // Resend download link — customer enters email, gets new link if they purchased
    if (url.pathname === "/api/resend-download") {
      if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
      return handleResendDownload(request, env);
    }

    // Serve static assets (Astro build output)
    return env.ASSETS.fetch(request);
  },
};

/** ---------------- Kit subscribe proxy ---------------- */

async function handleSubscribe(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const { email: rawEmail, firstName, score, tier } = body;
  if (!rawEmail) {
    return json({ ok: false, error: "Missing email" }, 400);
  }
  // Normalize email before all downstream calls
  const email = String(rawEmail).trim().toLowerCase();

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

  // Apply quiz-completed tag asynchronously — does not block the response
  if (env.CONVERTKIT_QUIZ_TAG) {
    ctx.waitUntil(
      fetch(
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
      )
        .then((r) => { if (!r.ok) console.log("Quiz tag error:", r.status); })
        .catch((err) => console.log("Quiz tag error:", err))
    );
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
  console.log("Paddle webhook: received request");
  const sig = request.headers.get("Paddle-Signature");
  if (!sig) {
    console.log("Paddle webhook: missing Paddle-Signature header");
    return new Response("Missing Paddle-Signature", { status: 400 });
  }

  const rawBody = await request.text();
  console.log("Paddle webhook: body length =", rawBody.length, "sig present =", !!sig);
  // NOTE: do not log the full sig header — it contains a replayable HMAC value
  console.log("Paddle webhook: body start =", rawBody.substring(0, 80));

  const valid = await verifyPaddleSignature(rawBody, sig, env.PADDLE_WEBHOOK_SECRET);
  if (!valid) {
    console.log("Paddle webhook: signature verification FAILED");
    return new Response("Invalid signature", { status: 400 });
  }

  console.log("Paddle webhook: signature valid, processing event");
  ctx.waitUntil(processPaddleEvent(rawBody, env, request.url));
  return new Response("OK", { status: 200 });
}

interface PaddleItem {
  price?: { product_id?: string };
  product?: { id?: string };
}

async function processPaddleEvent(rawBody: string, env: Env, requestUrl: string): Promise<void> {
  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    console.log("Paddle webhook: failed to parse JSON");
    return;
  }

  console.log("Paddle webhook: event_type =", event?.event_type);
  console.log("Paddle webhook: top-level keys =", Object.keys(event || {}));
  if (event?.event_type !== "transaction.completed") return;

  const transactionId = event?.data?.id;
  const customerId = event?.data?.customer_id;
  console.log("Paddle webhook: txnId =", transactionId, "customerId =", customerId);
  console.log("Paddle webhook: notification obj =", JSON.stringify(event?.notification)?.substring(0, 200));
  console.log("Paddle webhook: address obj =", JSON.stringify(event?.data?.address));
  console.log("Paddle webhook: full data keys =", Object.keys(event?.data || {}));

  // Try inline paths first — Paddle v2 sandbox doesn't embed customer object
  let email: string | null =
    event?.data?.customer?.email ||
    event?.data?.billing_details?.email ||
    event?.data?.checkout?.customer?.email ||
    null;

  // Fall back to Paddle API lookup using customer_id
  if (!email && customerId && env.PADDLE_API_KEY) {
    console.log("Paddle webhook: fetching email from Paddle API for customerId =", customerId);
    email = await fetchPaddleCustomerEmail(customerId, env.PADDLE_API_KEY, env.PADDLE_ENV === "sandbox");
  }

  if (!email) {
    console.log("Paddle webhook: could not resolve email, customerId =", customerId);
    return;
  }
  // Log only domain portion — don't expose PII in plaintext logs
  console.log("Paddle webhook: resolved email domain =", email.split("@")[1] ?? "(none)");

  // Determine which product(s) were purchased
  const items: PaddleItem[] = event?.data?.items || [];
  const productIds = items.map((item) => item?.price?.product_id || item?.product?.id || "");

  console.log("Paddle webhook: productIds =", JSON.stringify(productIds), "env.PADDLE_GUIDE_PRODUCT_ID =", env.PADDLE_GUIDE_PRODUCT_ID);

  const boughtGuide = !env.PADDLE_GUIDE_PRODUCT_ID || productIds.includes(env.PADDLE_GUIDE_PRODUCT_ID) || productIds.length === 0;
  const boughtUpsell = Boolean(env.PADDLE_UPSELL_PRODUCT_ID && productIds.includes(env.PADDLE_UPSELL_PRODUCT_ID));

  console.log("Paddle webhook: boughtGuide =", boughtGuide, "boughtUpsell =", boughtUpsell);

  // Record purchase in KV (hashed email → products purchased) for /api/resend-download
  if (env.PURCHASE_RECORDS && env.DOWNLOAD_SECRET) {
    const emailHash = await hmacSha256Hex(env.DOWNLOAD_SECRET, `email:${email.toLowerCase()}`);
    const existing = await env.PURCHASE_RECORDS.get(emailHash);
    let record: Record<string, boolean> = {};
    if (existing) {
      try {
        record = JSON.parse(existing);
      } catch {
        console.log("Paddle webhook: failed to parse existing purchase record, starting fresh");
      }
    }
    if (boughtGuide) record.guide = true;
    if (boughtUpsell) record.checklist = true;
    await env.PURCHASE_RECORDS.put(emailHash, JSON.stringify(record));
    console.log("Purchase record stored for hash:", emailHash.substring(0, 8));
  }

  // Tag in Kit for nurture sequence — generate download URLs only for purchased products
  const origin = new URL(requestUrl).origin;
  const actions: Promise<void>[] = [];
  const expires = Math.floor(Date.now() / 1000) + DOWNLOAD_TTL_EMAIL;

  if (boughtGuide) {
    const tagId = env.CONVERTKIT_GUIDE_TAG || env.CONVERTKIT_PURCHASE_TAG;
    if (tagId) {
      let guideDownloadUrl = "";
      if (transactionId && env.DOWNLOAD_SECRET) {
        const guideToken = await generateDownloadToken(transactionId, expires, env.DOWNLOAD_SECRET, "guide");
        guideDownloadUrl = `${origin}/api/download?token=${guideToken}&expires=${expires}&file=guide`;
      }
      actions.push(tagSubscriberInKit(env, tagId, email, {
        download_url: guideDownloadUrl,
        transaction_id: transactionId || "",
      }));
    }
  }

  if (boughtUpsell && env.CONVERTKIT_UPSELL_TAG) {
    let checklistDownloadUrl = "";
    if (transactionId && env.DOWNLOAD_SECRET) {
      const checklistToken = await generateDownloadToken(transactionId, expires, env.DOWNLOAD_SECRET, "checklist");
      checklistDownloadUrl = `${origin}/api/download?token=${checklistToken}&expires=${expires}&file=checklist`;
    }
    actions.push(tagSubscriberInKit(env, env.CONVERTKIT_UPSELL_TAG, email, {
      checklist_download_url: checklistDownloadUrl,
      transaction_id: transactionId || "",
    }));
  }

  await Promise.allSettled(actions);
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
    const resText = await res.text().catch(() => "");
    if (!res.ok) {
      console.log("ConvertKit tag error:", res.status, resText);
    } else {
      console.log("ConvertKit tag OK:", res.status, resText.substring(0, 200));
    }
  } catch (err) {
    console.log("ConvertKit request failed:", err);
  }
}

/** ---------------- Resend download link (self-serve recovery) ---------------- */

async function handleResendDownload(request: Request, env: Env): Promise<Response> {
  // Rate limit: 3 requests per minute per IP — prevents email enumeration
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const rateLimitKey = `ratelimit:resend:${ip}`;
  if (env.PURCHASE_RECORDS) {
    const count = parseInt((await env.PURCHASE_RECORDS.get(rateLimitKey)) ?? "0", 10);
    if (count >= 3) {
      return json({ error: "Too many requests. Please try again later." }, 429);
    }
    await env.PURCHASE_RECORDS.put(rateLimitKey, String(count + 1), { expirationTtl: 60 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !email.includes("@")) {
    return json({ error: "Valid email required" }, 400);
  }

  // Neutral response — don't leak whether email is in system
  const notFoundResponse = json({ found: false }, 200);

  if (!env.PURCHASE_RECORDS || !env.DOWNLOAD_SECRET) {
    return notFoundResponse;
  }

  const emailHash = await hmacSha256Hex(env.DOWNLOAD_SECRET, `email:${email}`);
  const existing = await env.PURCHASE_RECORDS.get(emailHash);
  if (!existing) return notFoundResponse;

  let record: { guide?: boolean; checklist?: boolean };
  try {
    record = JSON.parse(existing);
  } catch {
    return notFoundResponse;
  }

  const origin = new URL(request.url).origin;
  const expires = Math.floor(Date.now() / 1000) + DOWNLOAD_TTL_EMAIL;
  const stableId = emailHash.substring(0, 16);

  const links: { guide?: string; checklist?: string } = {};

  if (record.guide) {
    const token = await generateDownloadToken(stableId, expires, env.DOWNLOAD_SECRET, "guide");
    links.guide = `${origin}/api/download?token=${token}&expires=${expires}&file=guide`;
  }

  if (record.checklist) {
    const token = await generateDownloadToken(stableId, expires, env.DOWNLOAD_SECRET, "checklist");
    links.checklist = `${origin}/api/download?token=${token}&expires=${expires}&file=checklist`;
  }

  console.log("Recovery link generated for hash", emailHash.substring(0, 8), JSON.stringify(record));
  return json({ found: true, links, expires }, 200);
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

/** ---------------- Resend transactional email ---------------- */
// TODO(resend): Wire up sendGuideDeliveryEmail / sendChecklistDeliveryEmail in
// processPaddleEvent once securemycameras.com domain is verified in Resend.
// Until then, delivery is via the /thank-you page token redirect and
// the /api/resend-download self-serve recovery endpoint.

async function sendGuideDeliveryEmail(to: string, downloadUrl: string, env: Env): Promise<void> {
  const from = env.RESEND_FROM || "Secure My Cameras <hello@securemycameras.com>";
  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1C1917">
      <h2 style="font-size:22px;font-weight:700;margin-bottom:8px">Your Secure Camera Setup Guide is ready</h2>
      <p style="margin-bottom:24px;color:#57534E">You're one step closer to a camera system that actually protects you. Your guide is ready to download.</p>
      <a href="${downloadUrl}" style="display:inline-block;background:#DC2626;color:#fff;font-weight:700;padding:14px 28px;border-radius:6px;text-decoration:none;font-size:16px">Download Your Guide →</a>
      <p style="margin-top:24px;font-size:13px;color:#78716C">This link expires in 7 days. If you have any issues, reply to this email.</p>
    </div>
  `;
  await sendResendEmail({ to, from, subject: "Your Secure Camera Setup Guide is here", html, env });
}

async function sendChecklistDeliveryEmail(to: string, downloadUrl: string, env: Env): Promise<void> {
  const from = env.RESEND_FROM || "Secure My Cameras <hello@securemycameras.com>";
  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1C1917">
      <h2 style="font-size:22px;font-weight:700;margin-bottom:8px">Your Home Network Security Checklist is ready</h2>
      <p style="margin-bottom:24px;color:#57534E">Your checklist is ready to download. Use it to lock down your network and keep your cameras protected.</p>
      <a href="${downloadUrl}" style="display:inline-block;background:#DC2626;color:#fff;font-weight:700;padding:14px 28px;border-radius:6px;text-decoration:none;font-size:16px">Download Your Checklist →</a>
      <p style="margin-top:24px;font-size:13px;color:#78716C">This link expires in 7 days. If you have any issues, reply to this email.</p>
    </div>
  `;
  await sendResendEmail({ to, from, subject: "Your Home Network Security Checklist is here", html, env });
}

async function sendResendEmail(opts: {
  to: string;
  from: string;
  subject: string;
  html: string;
  env: Env;
}): Promise<void> {
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: opts.from,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
      }),
    });
    const body = await resp.text();
    if (!resp.ok) {
      console.log("Resend error:", resp.status, body);
    } else {
      console.log("Resend OK:", resp.status, body.substring(0, 100));
    }
  } catch (err) {
    console.log("Resend request failed:", err);
  }
}

/** ---------------- Paddle API helpers ---------------- */

async function fetchPaddleCustomerEmail(customerId: string, apiKey: string, sandbox: boolean): Promise<string | null> {
  const base = sandbox ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";
  try {
    const resp = await fetch(`${base}/customers/${customerId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) {
      console.log("Paddle API customer fetch failed:", resp.status, await resp.text());
      return null;
    }
    const body: { data?: { email?: string } } = await resp.json();
    return body?.data?.email ?? null;
  } catch (e) {
    console.log("Paddle API customer fetch error:", e);
    return null;
  }
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

  const signedPayload = `${ts}:${rawBody}`;
  const expected = await hmacSha256Hex(secret, signedPayload);
  const match = timingSafeEqualHex(expected, h1);
  if (!match) console.log(`Paddle sig mismatch: ts=${ts} h1=${h1.substring(0,8)} expected=${expected.substring(0,8)}`);
  return match;
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
