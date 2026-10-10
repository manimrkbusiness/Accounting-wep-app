"use client";

import Link from "next/link";
import { useWorkspace } from "../lib/workspace";
import { discardDrafts, resumeHref, useDraftIndex } from "../lib/useDraft";

/** Shown on a history page when an entry of that kind is unsaved. */
export function ResumeBanner({ form, newPath, what }: { form: string; newPath: string; what: string }) {
  const ws = useWorkspace();
  const traderId = ws.session?.user.id;
  const drafts = useDraftIndex(traderId);
  const href = resumeHref(drafts, form, newPath);
  if (!href) return null;
  const latest = drafts.find((draft) => draft.form === form);
  const started = latest?.savedAt ? new Date(latest.savedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
  return (
    <section className="resume-banner">
      <div><span className="eyebrow">Unsaved entry</span><strong>You have a {what} in progress{latest?.recordId !== "new" ? " (editing an existing record)" : ""}.</strong>{started ? <span className="muted-text">Last changed {started}</span> : null}</div>
      <div className="row-actions"><Link className="primary-button" href={href}>Continue {what}</Link><button className="secondary-button" onClick={() => { if (window.confirm(`Discard the unsaved ${what}?`)) discardDrafts(traderId, form); }} type="button">Discard</button></div>
    </section>
  );
}
