import { getClientRecord, redirectAllowed } from "../../_mcp/store";
import { AuthorizeClient } from "./AuthorizeClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const get = (key: string) => {
    const value = sp[key];
    return (Array.isArray(value) ? value[0] : value) ?? "";
  };
  const params = {
    response_type: get("response_type"),
    client_id: get("client_id"),
    redirect_uri: get("redirect_uri"),
    code_challenge: get("code_challenge"),
    code_challenge_method: get("code_challenge_method") || "S256",
    scope: get("scope"),
    state: get("state"),
    resource: get("resource"),
  };
  const client = await getClientRecord(params.client_id);
  const valid = params.response_type === "code" && Boolean(params.redirect_uri) && redirectAllowed(client, params.redirect_uri) && Boolean(params.code_challenge);
  const clientName = client?.client_name || "an AI assistant (Claude or ChatGPT)";
  return <AuthorizeClient params={params} valid={valid} clientName={clientName} />;
}
