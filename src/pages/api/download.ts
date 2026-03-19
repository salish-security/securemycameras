import type { APIContext } from "astro";

export async function GET({ locals }: APIContext) {
  const env = locals.runtime?.env as any;
  if (!env?.PRIVATE_FILES) {
    return new Response("Storage not configured", { status: 500 });
  }

  const obj = await env.PRIVATE_FILES.get("secure-your-cameras-guide.pdf");
  if (!obj) {
    return new Response("Download coming soon — check back shortly.", { status: 404 });
  }

  return new Response(obj.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="Secure-Your-Cameras-Guide.pdf"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}
