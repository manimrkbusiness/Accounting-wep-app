import { issueTokens, rotateRefreshToken, takeAuthCode, verifyPkceS256 } from "../../_mcp/store";
import { corsJson, corsPreflight, oauthError, readForm } from "../../_mcp/http";

// OAuth token endpoint: authorization_code (with PKCE S256) and refresh_token (rotating).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const params = await readForm(request);
  const grantType = params.get("grant_type");

  if (grantType === "authorization_code") {
    const code = params.get("code") || "";
    const redirectUri = params.get("redirect_uri") || "";
    const clientId = params.get("client_id") || "";
    const verifier = params.get("code_verifier") || "";
    const record = await takeAuthCode(code);
    if (!record) return oauthError("invalid_grant", "The authorization code is invalid or has expired.");
    if (clientId && record.client_id !== clientId) return oauthError("invalid_grant", "Client mismatch.");
    if (record.redirect_uri !== redirectUri) return oauthError("invalid_grant", "Redirect URI mismatch.");
    if (!verifyPkceS256(verifier, record.code_challenge)) return oauthError("invalid_grant", "PKCE verification failed.");
    const tokens = await issueTokens({ client_id: record.client_id, trader_id: record.trader_id, scope: record.scope, resource: record.resource });
    return corsJson({ access_token: tokens.access_token, token_type: "Bearer", expires_in: tokens.expires_in, refresh_token: tokens.refresh_token, scope: tokens.scope });
  }

  if (grantType === "refresh_token") {
    const refreshToken = params.get("refresh_token") || "";
    const clientId = params.get("client_id") || "";
    const tokens = await rotateRefreshToken(refreshToken, clientId);
    if (!tokens) return oauthError("invalid_grant", "The refresh token is invalid or has expired.");
    return corsJson({ access_token: tokens.access_token, token_type: "Bearer", expires_in: tokens.expires_in, refresh_token: tokens.refresh_token, scope: tokens.scope });
  }

  return oauthError("unsupported_grant_type", "Only authorization_code and refresh_token are supported.");
}

export function OPTIONS() {
  return corsPreflight();
}
