"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { clearAuthCookie, isAuthed, serviceClient, setAuthCookie, verifyAdminToken } from "./lib/service";

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

/**
 * Publishes a notification that every trader sees in their in-app bell. Admin-only: the service-role
 * insert bypasses RLS, so the auth check here is the only gate — it must run on every call.
 */
export async function sendAnnouncement(input: { title: string; body: string }): Promise<{ ok: boolean; error?: string }> {
  if (!(await isAuthed())) return { ok: false, error: "Your session expired. Sign in again." };
  const title = input.title.trim();
  const body = input.body.trim();
  if (title.length < 3) return { ok: false, error: "Add a short title (the subheading traders see first)." };
  if (body.length < 3) return { ok: false, error: "Add the message body." };
  try {
    const { error } = await serviceClient().from("announcements").insert({ title, body });
    if (error) return { ok: false, error: error.message };
    revalidatePath("/admin/notifications");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not send the notification." };
  }
}

/** Shows or hides an existing notification for all traders (hidden ones stop appearing in the bell). */
export async function setAnnouncementActive(id: number, active: boolean): Promise<{ ok: boolean; error?: string }> {
  if (!(await isAuthed())) return { ok: false, error: "Your session expired. Sign in again." };
  try {
    const { error } = await serviceClient().from("announcements").update({ active }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/admin/notifications");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not update the notification." };
  }
}
