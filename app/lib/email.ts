// Server-only. Sends transactional emails through Resend. It is INERT until RESEND_API_KEY is set
// (every send becomes a no-op that just logs), so no email is ever sent from an environment that
// has not been configured. NEVER import this from a client component — it would leak the API key.
import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
// A verified Resend sender, e.g. "Coconut Trade Desk <no-reply@bizztrack.in>".
const EMAIL_FROM = process.env.EMAIL_FROM || "Coconut Trade Desk <no-reply@bizztrack.in>";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://bizztrack.in";

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

export function emailConfigured() {
  return Boolean(resend);
}

type SendArgs = { to: string; subject: string; html: string; text?: string };

async function send({ to, subject, html, text }: SendArgs): Promise<boolean> {
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — skipped "${subject}"`);
    return false;
  }
  if (!to) return false;
  try {
    const { error } = await resend.emails.send({ from: EMAIL_FROM, to, subject, html, text });
    if (error) {
      console.error("[email] send failed:", error);
      return false;
    }
    return true;
  } catch (caught) {
    console.error("[email] send threw:", caught);
    return false;
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] as string));
}

function layout(title: string, bodyHtml: string) {
  return `<!doctype html><html><body style="margin:0;background:#f4f8f4;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#16271e;">
  <div style="max-width:520px;margin:0 auto;padding:24px;">
    <div style="font-weight:800;letter-spacing:.04em;color:#15402a;font-size:14px;margin-bottom:16px;">COCONUT TRADE DESK</div>
    <div style="background:#ffffff;border:1px solid #e2ebe4;border-radius:14px;padding:24px;">
      <h1 style="margin:0 0 12px;font-size:20px;color:#15402a;">${title}</h1>
      ${bodyHtml}
    </div>
    <p style="color:#5a6b61;font-size:12px;margin:16px 4px;">Coconut Trade Desk · <a href="${SITE_URL}" style="color:#1f7a46;">bizztrack.in</a></p>
  </div></body></html>`;
}

const button = (href: string, label: string) =>
  `<a href="${href}" style="display:inline-block;background:#1f7a46;color:#ffffff;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:8px;">${label}</a>`;

/** One-time welcome for a newly onboarded user. */
export function sendWelcomeEmail(to: string, name?: string | null) {
  const hi = name ? `Hi ${escapeHtml(name)},` : "Hi,";
  return send({
    to,
    subject: "Welcome to Coconut Trade Desk",
    html: layout("Welcome aboard!", `<p>${hi}</p>
      <p>Your Coconut Trade Desk account is ready. Record purchases, stock, sales, husk and cash in one place — and see your real profit on every lorry.</p>
      <p>You're on a free trial to start. Open your dashboard and record your first purchase:</p>
      <p style="margin:18px 0;">${button(SITE_URL + "/dashboard", "Open my dashboard")}</p>
      <p style="color:#5a6b61;font-size:13px;">If you didn't create this account, you can safely ignore this email.</p>`),
    text: `${name ? `Hi ${name},` : "Hi,"}\n\nYour Coconut Trade Desk account is ready. Open your dashboard: ${SITE_URL}/dashboard`
  });
}

/** Security notice sent when a returning user signs in. */
export function sendLoginAlertEmail(to: string, name: string | null | undefined, meta: { when: string; ip?: string }) {
  const hi = name ? `Hi ${escapeHtml(name)},` : "Hi,";
  return send({
    to,
    subject: "New sign-in to your Coconut Trade Desk account",
    html: layout("New sign-in detected", `<p>${hi}</p>
      <p>Your account was just signed in to.</p>
      <p style="color:#5a6b61;font-size:14px;">Time: ${escapeHtml(meta.when)}${meta.ip ? `<br>IP address: ${escapeHtml(meta.ip)}` : ""}</p>
      <p>If this was you, no action is needed. <strong>If this wasn't you</strong>, reset your password right away:</p>
      <p style="margin:18px 0;">${button(SITE_URL + "/login", "Secure my account")}</p>`),
    text: `${name ? `Hi ${name},` : "Hi,"}\n\nYour account was just signed in to at ${meta.when}${meta.ip ? ` (IP ${meta.ip})` : ""}. If this wasn't you, reset your password: ${SITE_URL}/login`
  });
}

/** Payment receipt / subscription confirmation. */
export function sendSubscriptionEmail(to: string, name: string | null | undefined, meta: { amount?: string; nextRenewal?: string }) {
  const hi = name ? `Hi ${escapeHtml(name)},` : "Hi,";
  return send({
    to,
    subject: "Payment received — your subscription is active",
    html: layout("Thank you — you're subscribed!", `<p>${hi}</p>
      <p>We've received your payment${meta.amount ? ` of <strong>${escapeHtml(meta.amount)}</strong>` : ""} and your Coconut Trade Desk subscription is active. Thank you!</p>
      ${meta.nextRenewal ? `<p style="color:#5a6b61;font-size:14px;">Next renewal: ${escapeHtml(meta.nextRenewal)}</p>` : ""}
      <p style="margin:18px 0;">${button(SITE_URL + "/dashboard", "Open my dashboard")}</p>`),
    text: `${name ? `Hi ${name},` : "Hi,"}\n\nPayment received${meta.amount ? ` (${meta.amount})` : ""}. Your subscription is active.`
  });
}
