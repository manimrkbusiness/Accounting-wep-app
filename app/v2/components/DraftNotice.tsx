"use client";

/** Shown above a form whose unsaved entries were restored from a previous visit. */
export function DraftNotice({ show, what, onDiscard, showDiscard = true }: { show: boolean; what: string; onDiscard: () => void; showDiscard?: boolean }) {
  if (!show) return null;
  return (
    <p className="status-message draft-notice">
      <span>Restored your unsaved {what} from where you left off. It stays here until you save it.</span>
      {showDiscard ? <button className="link-button" onClick={onDiscard} type="button">Discard draft</button> : null}
    </p>
  );
}
