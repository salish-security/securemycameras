import type { APIContext } from "astro";

export async function POST({ request, locals }: APIContext) {
  const env = locals.runtime?.env as Record<string, string> | undefined;
  if (!env?.KIT_API_KEY || !env?.KIT_FORM_ID) {
    return new Response(JSON.stringify({ ok: false, error: "Not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: { email?: string; firstName?: string; score?: number; tier?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { email, firstName, score, tier } = body;
  if (!email) {
    return new Response(JSON.stringify({ ok: false, error: "Missing email" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
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
    return new Response(JSON.stringify({ ok: false }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
