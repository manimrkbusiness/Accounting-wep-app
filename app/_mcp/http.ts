import "server-only";

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "Authorization, Content-Type, mcp-protocol-version",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
};

export function corsJson(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS } });
}

export function corsPreflight() {
  return new Response(null, { status: 204, headers: CORS });
}

export function oauthError(error: string, description: string, status = 400) {
  return corsJson({ error, error_description: description }, status);
}

/** Parse an OAuth request body as application/x-www-form-urlencoded (or JSON) into params. */
export async function readForm(request: Request): Promise<URLSearchParams> {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(body)) if (value != null) params.set(key, String(value));
    return params;
  }
  return new URLSearchParams(await request.text().catch(() => ""));
}
