import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

// Server-only OAuth + MCP storage. Everything here runs with the service-role key and is never
// imported by client code, so secrets stay on the server.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const SCOPES = ["bizztrack.read", "bizztrack.write"] as const;
export const SCOPES_STRING = SCOPES.join(" ");
export const ACCESS_TTL_SEC = 60 * 60; // 1 hour
export const REFRESH_TTL_SEC = 60 * 60 * 24 * 30; // 30 days
export const CODE_TTL_SEC = 60 * 10; // 10 minutes

/** Redirect URIs always accepted (Claude + ChatGPT), alongside each client's registered list. */
export const KNOWN_REDIRECT_URIS = [
  "https://claude.ai/api/mcp/auth_callback",
  "https://claude.com/api/mcp/auth_callback",
  "https://chatgpt.com/connector_platform_oauth_redirect",
  "https://chatgpt.com/aip/connector_platform_oauth_redirect",
  "http://localhost:6274/oauth/callback", // MCP Inspector (local testing)
];

export function mcpConfigured() {
  return Boolean(SUPABASE_URL && ANON_KEY && SERVICE_ROLE_KEY);
}

/** The public origin of this deployment (e.g. https://bizztrack.in), used as the OAuth issuer. */
export function originFromRequest(request: Request): string {
  const envOrigin = process.env.NEXT_PUBLIC_SITE_URL || process.env.MCP_ISSUER;
  if (envOrigin) return envOrigin.replace(/\/+$/, "");
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") || url.host;
  const proto = request.headers.get("x-forwarded-proto") || (url.protocol.replace(":", "") || "https");
  return `${proto}://${host}`;
}

/** Service-role client: bypasses RLS. Used only for the OAuth tables and the scoped data layer. */
export function service(): SupabaseClient {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error("MCP server is not configured.");
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function randomToken(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(32).toString("base64url")}`;
}

/** PKCE S256: base64url(SHA-256(verifier)) must equal the stored challenge. */
export function verifyPkceS256(verifier: string, challenge: string): boolean {
  if (!verifier || !challenge) return false;
  const computed = crypto.createHash("sha256").update(verifier).digest("base64url");
  const a = Buffer.from(computed);
  const b = Buffer.from(challenge);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Validate a Supabase USER access token (from the trader's normal sign-in) → their trader id. */
export async function traderIdFromSupabaseToken(token: string): Promise<string | null> {
  if (!token || !SUPABASE_URL || !ANON_KEY) return null;
  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

// ---------------------------------------------------------------------------
// OAuth clients (dynamic client registration)
// ---------------------------------------------------------------------------
export type OAuthClient = {
  client_id: string;
  client_name: string | null;
  redirect_uris: string[];
  grant_types: string[];
  token_endpoint_auth_method: string;
  scope: string | null;
};

export async function getClientRecord(clientId: string): Promise<OAuthClient | null> {
  const { data } = await service().from("mcp_oauth_clients").select("*").eq("client_id", clientId).maybeSingle();
  return (data as OAuthClient) ?? null;
}

export async function createClientRecord(input: { client_name?: string | null; redirect_uris: string[]; scope?: string | null }): Promise<OAuthClient> {
  const client_id = randomToken("client");
  const row = {
    client_id,
    client_name: input.client_name ?? null,
    redirect_uris: input.redirect_uris,
    grant_types: ["authorization_code", "refresh_token"],
    token_endpoint_auth_method: "none",
    scope: input.scope ?? SCOPES_STRING,
  };
  const { error } = await service().from("mcp_oauth_clients").insert(row);
  if (error) throw new Error(error.message);
  return row as OAuthClient;
}

/** A redirect URI is allowed if it is registered to the client or is a known platform callback. */
export function redirectAllowed(client: OAuthClient | null, redirectUri: string): boolean {
  if (KNOWN_REDIRECT_URIS.includes(redirectUri)) return true;
  return Boolean(client && client.redirect_uris.includes(redirectUri));
}

// ---------------------------------------------------------------------------
// Authorization codes (one-time, hashed)
// ---------------------------------------------------------------------------
export async function saveAuthCode(input: {
  code: string; client_id: string; trader_id: string; redirect_uri: string;
  code_challenge: string; code_challenge_method: string; scope: string | null; resource: string | null;
}): Promise<void> {
  const { error } = await service().from("mcp_oauth_codes").insert({
    code_hash: sha256(input.code),
    client_id: input.client_id,
    trader_id: input.trader_id,
    redirect_uri: input.redirect_uri,
    code_challenge: input.code_challenge,
    code_challenge_method: input.code_challenge_method,
    scope: input.scope,
    resource: input.resource,
    expires_at: new Date(Date.now() + CODE_TTL_SEC * 1000).toISOString(),
  });
  if (error) throw new Error(error.message);
}

/** Fetch and immediately delete an auth code (single use); returns null if missing or expired. */
export async function takeAuthCode(code: string) {
  const hash = sha256(code);
  const db = service();
  const { data } = await db.from("mcp_oauth_codes").select("*").eq("code_hash", hash).maybeSingle();
  if (data) await db.from("mcp_oauth_codes").delete().eq("code_hash", hash);
  if (!data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data as {
    code_hash: string; client_id: string; trader_id: string; redirect_uri: string;
    code_challenge: string; code_challenge_method: string; scope: string | null; resource: string | null; expires_at: string;
  };
}

// ---------------------------------------------------------------------------
// Access + refresh tokens (hashed, refresh rotated)
// ---------------------------------------------------------------------------
export type IssuedTokens = { access_token: string; refresh_token: string; expires_in: number; scope: string };

export async function issueTokens(input: { client_id: string; trader_id: string; scope: string | null; resource: string | null }): Promise<IssuedTokens> {
  const access_token = randomToken("mcpat");
  const refresh_token = randomToken("mcprt");
  const scope = input.scope || SCOPES_STRING;
  const { error } = await service().from("mcp_oauth_tokens").insert({
    client_id: input.client_id,
    trader_id: input.trader_id,
    access_token_hash: sha256(access_token),
    refresh_token_hash: sha256(refresh_token),
    scope,
    resource: input.resource,
    access_expires_at: new Date(Date.now() + ACCESS_TTL_SEC * 1000).toISOString(),
    refresh_expires_at: new Date(Date.now() + REFRESH_TTL_SEC * 1000).toISOString(),
  });
  if (error) throw new Error(error.message);
  return { access_token, refresh_token, expires_in: ACCESS_TTL_SEC, scope };
}

/** Look up a live access token by its plaintext value; null if unknown, revoked or expired. */
export async function findAccessToken(accessToken: string) {
  const { data } = await service().from("mcp_oauth_tokens").select("*").eq("access_token_hash", sha256(accessToken)).eq("revoked", false).maybeSingle();
  if (!data) return null;
  if (new Date(data.access_expires_at).getTime() < Date.now()) return null;
  return data as { id: string; client_id: string; trader_id: string; scope: string | null; resource: string | null; access_expires_at: string };
}

/** Rotate a refresh token: revoke the old row, issue a fresh pair for the same trader. */
export async function rotateRefreshToken(refreshToken: string, clientId: string): Promise<IssuedTokens | null> {
  const db = service();
  const { data } = await db.from("mcp_oauth_tokens").select("*").eq("refresh_token_hash", sha256(refreshToken)).eq("revoked", false).maybeSingle();
  if (!data) return null;
  if (data.client_id !== clientId) return null;
  if (data.refresh_expires_at && new Date(data.refresh_expires_at).getTime() < Date.now()) return null;
  await db.from("mcp_oauth_tokens").update({ revoked: true }).eq("id", data.id);
  return issueTokens({ client_id: data.client_id, trader_id: data.trader_id, scope: data.scope, resource: data.resource });
}

/** Revoke a token by either its access or refresh value (RFC 7009). */
export async function revokeToken(token: string): Promise<void> {
  const hash = sha256(token);
  const db = service();
  await db.from("mcp_oauth_tokens").update({ revoked: true }).or(`access_token_hash.eq.${hash},refresh_token_hash.eq.${hash}`);
}
