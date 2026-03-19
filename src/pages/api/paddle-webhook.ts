import type { APIContext } from "astro";

export async function POST({ request, locals }: APIContext) {
  const env = locals.runtime?.env as Record<string, string> | undefined;
  if (!env?.PADDLE_WEBHOOK_SECRET || !env?.CONVERTKIT_API_SECRET || !env?.CONVERTKIT_PURCHASE_TAG) {
    return new Response("Not configured", { status: 500 });
  }

  const sig = request.headers.get("Paddle-Signature");
  if (!sig) return new Response("Missing Paddle-Signature", { status: 400 });

  const rawBody = await request.text();

  const valid = await verifyPaddleSignature(rawBody, sig, env.PADDLE_WEBHOOK_SECRET);
  if (!valid) return new Response("Invalid signature", { status: 400 });

  // Respond 200 immediately, process async
  const event = JSON.parse(rawBody);
  if (event?.event_type !== "transaction.completed") {
    return new Response("OK", { status: 200 });
  }

  const email = event?.data?.customer?.email;
  if (!email) {
    console.log("Paddle webhook: no customer email in payload");
    return new Response("OK", { status: 200 });
  }

  // Tag purchaser in ConvertKit
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

  return new Response("OK", { status: 200 });
}

/** Paddle v2 webhook signature verification */
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
