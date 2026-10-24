import { AdminLogin } from "./AdminLogin";

/** Renders the unauthed states: a not-configured notice, or the email sign-in card. */
export function AdminGate({ configured, base }: { configured: boolean; base: string }) {
  if (!configured) {
    return (
      <main className="admin-shell">
        <div className="admin-card">
          <h1>Control panel not configured</h1>
          <p>Set <code>SUPABASE_SERVICE_ROLE_KEY</code> (and optionally <code>ADMIN_EMAILS</code>) in the Vercel environment, then redeploy.</p>
        </div>
      </main>
    );
  }
  return <AdminLogin base={base} />;
}
