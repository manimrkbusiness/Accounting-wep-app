"use server";

import { getClientRecord, randomToken, redirectAllowed, saveAuthCode, traderIdFromSupabaseToken } from "../../_mcp/store";

export type AuthorizeParams = {
  response_type: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  scope: string;
  state: string;
  resource: string;
};

/** Called after the trader signs in and clicks Allow. Mints a one-time code bound to THEIR account. */
export async function approveAuthorization(input: AuthorizeParams & { supabaseAccessToken: string }): Promise<{ redirect: string } | { error: string }> {
  const traderId = await traderIdFromSupabaseToken(input.supabaseAccessToken);
  if (!traderId) return { error: "Please sign in again to authorize." };
  if ((input.code_challenge_method || "S256") !== "S256" || !input.code_challenge) return { error: "This client must use PKCE (S256)." };
  const client = await getClientRecord(input.client_id);
  if (!input.redirect_uri || !redirectAllowed(client, input.redirect_uri)) return { error: "This redirect URL is not allowed." };
  const code = randomToken("code");
  try {
    await saveAuthCode({
      code,
      client_id: input.client_id,
      trader_id: traderId,
      redirect_uri: input.redirect_uri,
      code_challenge: input.code_challenge,
      code_challenge_method: "S256",
      scope: input.scope || null,
      resource: input.resource || null,
    });
  } catch (e) {
    return { error: (e as Error).message };
  }
  const url = new URL(input.redirect_uri);
  url.searchParams.set("code", code);
  if (input.state) url.searchParams.set("state", input.state);
  return { redirect: url.toString() };
}

export async function denyAuthorization(input: { redirect_uri: string; state: string }): Promise<{ redirect: string }> {
  const url = new URL(input.redirect_uri);
  url.searchParams.set("error", "access_denied");
  if (input.state) url.searchParams.set("state", input.state);
  return { redirect: url.toString() };
}
