import { redirect } from "next/navigation";
import { adminBase } from "../../lib/service";

export const dynamic = "force-dynamic";

/** The trader view moved to /users/[id]; keep old links working. */
export default async function TraderRedirect({ params }: { params: Promise<{ id: string }> }) {
  const base = await adminBase();
  const { id } = await params;
  redirect(`${base}/users/${id}`);
}
