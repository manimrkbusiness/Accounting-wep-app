import "server-only";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { registerTools } from "../_mcp/tools";
import { findAccessToken } from "../_mcp/store";

// The BizzTrack MCP endpoint. One Streamable-HTTP endpoint, Bearer-protected. withMcpAuth validates
// the token on every call and injects the trader id; createMcpHandler runs the tools.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = createMcpHandler(
  (server) => {
    registerTools(server);
  },
  { serverInfo: { name: "BizzTrack", version: "1.0.0" } }
);

/** Validate our opaque access token → AuthInfo carrying the one trader this token is bound to. */
async function verifyToken(_req: Request, bearer?: string): Promise<AuthInfo | undefined> {
  if (!bearer) return undefined;
  const row = await findAccessToken(bearer);
  if (!row) return undefined;
  return {
    token: bearer,
    clientId: row.client_id,
    scopes: (row.scope ?? "").split(" ").filter(Boolean),
    expiresAt: Math.floor(new Date(row.access_expires_at).getTime() / 1000),
    extra: { traderId: row.trader_id },
  };
}

const authed = withMcpAuth(handler, verifyToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

export { authed as GET, authed as POST, authed as DELETE };
