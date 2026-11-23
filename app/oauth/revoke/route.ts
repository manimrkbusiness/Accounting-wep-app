import { revokeToken } from "../../_mcp/store";
import { corsJson, corsPreflight, readForm } from "../../_mcp/http";

// Token revocation (RFC 7009). Always returns 200, even for an unknown token.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const params = await readForm(request);
  const token = params.get("token") || "";
  if (token) {
    try { await revokeToken(token); } catch { /* ignore */ }
  }
  return corsJson({});
}

export function OPTIONS() {
  return corsPreflight();
}
