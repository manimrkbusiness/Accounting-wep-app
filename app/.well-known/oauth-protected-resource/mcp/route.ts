import { originFromRequest, SCOPES } from "../../../_mcp/store";
import { corsJson, corsPreflight } from "../../../_mcp/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// RFC 9728 path-suffixed variant for the resource at /mcp (some clients request this form).
export async function GET(request: Request) {
  const issuer = originFromRequest(request);
  return corsJson({
    resource: `${issuer}/mcp`,
    authorization_servers: [issuer],
    scopes_supported: [...SCOPES],
    bearer_methods_supported: ["header"],
    resource_name: "BizzTrack",
  });
}

export function OPTIONS() {
  return corsPreflight();
}
