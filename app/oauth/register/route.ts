import { createClientRecord } from "../../_mcp/store";
import { corsJson, corsPreflight, oauthError } from "../../_mcp/http";

// Dynamic client registration (RFC 7591). Claude/ChatGPT register themselves and get a client_id.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { redirect_uris?: unknown; client_name?: unknown; scope?: unknown };
  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (redirectUris.length === 0) return oauthError("invalid_client_metadata", "redirect_uris is required", 400);
  try {
    const client = await createClientRecord({
      client_name: typeof body.client_name === "string" ? body.client_name : null,
      redirect_uris: redirectUris,
      scope: typeof body.scope === "string" ? body.scope : null,
    });
    return corsJson(
      {
        client_id: client.client_id,
        client_name: client.client_name,
        redirect_uris: client.redirect_uris,
        grant_types: client.grant_types,
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        scope: client.scope,
      },
      201
    );
  } catch (e) {
    return oauthError("server_error", (e as Error).message, 500);
  }
}

export function OPTIONS() {
  return corsPreflight();
}
