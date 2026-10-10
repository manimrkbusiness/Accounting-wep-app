"use client";

/** Shown above a form whose unsaved entries were restored from a previous visit. */
export function DraftNotice({ show, what, onDiscard }: { show: boolean; what: string; onDiscard: () => void }) {
  if (!show) return null;
  return (
    <p className="status-message draft-notice">
      <span>Restored your unsaved {what} from where you left off. It stays here until you save it.</span>
      <button className="link-button" onClick={onDiscard} type="button">Discard draft</button>
    </p>
  );
}
