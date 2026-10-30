import { adminClient, getUserId } from "../../razorpay/shared";
import { sendWelcomeEmail, sendLoginAlertEmail } from "../../../lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Repeated sign-ins inside this window don't re-send the "new sign-in" alert (dedupes double-fires).
const LOGIN_ALERT_THROTTLE_MS = 5 * 60 * 1000;

/**
 * Called by the client after a genuine sign-in (email sign-in, Google callback) and after a new
 * user finishes their profile. The SERVER decides what to send, from the user's own stored flags —
 * the client cannot pick the recipient or the email type, and alerts are throttled. Inert until
 * RESEND_API_KEY is configured (email.ts no-ops), so this endpoint is always safe to call.
 */
export async function POST(request: Request) {
  const userId = await getUserId(request);
  if (!userId) return Response.json({ error: "Not signed in." }, { status: 401 });

  let admin;
  try {
    admin = adminClient();
  } catch {
    return Response.json({ ok: true, sent: "none" });
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("email, full_name, account_type, welcome_email_at, last_login_email_at")
    .eq("id", userId)
    .maybeSingle();

  // Not onboarded yet (no profile row, no workspace chosen, or no email): nothing to send.
  if (!profile || !profile.account_type || !profile.email) {
    return Response.json({ ok: true, sent: "none" });
  }

  // First time after onboarding: one welcome email, recorded so it never repeats.
  if (!profile.welcome_email_at) {
    await sendWelcomeEmail(profile.email, profile.full_name);
    await admin.from("profiles").update({ welcome_email_at: new Date().toISOString() }).eq("id", userId);
    return Response.json({ ok: true, sent: "welcome" });
  }

  // Returning sign-in: throttled security alert.
  const last = profile.last_login_email_at ? new Date(profile.last_login_email_at).getTime() : 0;
  if (Date.now() - last < LOGIN_ALERT_THROTTLE_MS) {
    return Response.json({ ok: true, sent: "none" });
  }

  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || undefined;
  const when = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
  await sendLoginAlertEmail(profile.email, profile.full_name, { when, ip });
  await admin.from("profiles").update({ last_login_email_at: new Date().toISOString() }).eq("id", userId);
  return Response.json({ ok: true, sent: "login" });
}
