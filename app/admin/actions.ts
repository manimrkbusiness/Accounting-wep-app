"use server";

import { redirect } from "next/navigation";
import { clearAuthCookie, setAuthCookie, verifyAdminToken } from "./lib/service";

/**
 * Called from the admin sign-in card with the signed-in user's Supabase access token.
 * The token is verified on the server and only an allow-listed admin email is let in.
 */
export async function adminLogin(token: string): Promise<{ ok: boolean; error?: string }> {
  const email = await verifyAdminToken(token);
  if (!email) return { ok: false, error: "This account is not allowed into the control panel." };
  await setAuthCookie();
  return { ok: true };
}

export async function logout(formData: FormData) {
  const base = String(formData.get("base") || "/admin");
  await clearAuthCookie();
  redirect(base);
}
