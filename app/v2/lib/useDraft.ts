"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

const PREFIX = "ctd-draft:";

type Stored<S> = { value: S; savedAt: string };

function readStored<S>(key: string): Stored<S> | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as Stored<S>) : null;
  } catch {
    return null;
  }
}

const CHANGE_EVENT = "ctd-draft-change";

function notifyChange() {
  try {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // ignore
  }
}

function writeStored<S>(key: string, value: S) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify({ value, savedAt: new Date().toISOString() } satisfies Stored<S>));
    notifyChange();
  } catch {
    // Storage can be unavailable (private mode, quota). The form still works without drafts.
  }
}

function removeStored(key: string) {
  try {
    if (window.localStorage.getItem(PREFIX + key) !== null) {
      window.localStorage.removeItem(PREFIX + key);
      notifyChange();
    }
  } catch {
    // ignore
  }
}

export type DraftSummary = { form: string; recordId: string; savedAt: string };

/** Unsaved entries the trader has in progress, newest first. */
export function listDrafts(traderId: string | undefined): DraftSummary[] {
  if (typeof window === "undefined" || !traderId) return [];
  const found = new Map<string, DraftSummary>();
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const storageKey = window.localStorage.key(index);
      if (!storageKey || !storageKey.startsWith(`${PREFIX}${traderId}:`)) continue;
      const [, form, recordId] = storageKey.slice(PREFIX.length).split(":");
      if (!form || !recordId) continue;
      const stored = readStored<unknown>(storageKey.slice(PREFIX.length));
      const savedAt = stored?.savedAt ?? "";
      const id = `${form}:${recordId}`;
      const existing = found.get(id);
      if (!existing || existing.savedAt < savedAt) found.set(id, { form, recordId, savedAt });
    }
  } catch {
    return [];
  }
  return Array.from(found.values()).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/** Removes every stored draft for one form (all records), or for one record when given. */
export function discardDrafts(traderId: string | undefined, form: string, recordId?: string) {
  if (typeof window === "undefined" || !traderId) return;
  try {
    const prefix = `${PREFIX}${traderId}:${form}:${recordId ?? ""}`;
    const keys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const storageKey = window.localStorage.key(index);
      if (storageKey && storageKey.startsWith(prefix)) keys.push(storageKey);
    }
    keys.forEach((storageKey) => window.localStorage.removeItem(storageKey));
    if (keys.length) notifyChange();
  } catch {
    // ignore
  }
}

/** Live list of drafts for the sidebar and history pages; updates whenever a draft is written or cleared. */
export function useDraftIndex(traderId: string | undefined) {
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  useEffect(() => {
    const refresh = () => setDrafts(listDrafts(traderId));
    refresh();
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [traderId]);
  return drafts;
}

/** Where to resume a form's latest draft, or null when there is none. */
export function resumeHref(drafts: DraftSummary[], form: string, newPath: string) {
  const latest = drafts.find((draft) => draft.form === form);
  if (!latest) return null;
  return latest.recordId === "new" ? newPath : `${newPath}?edit=${latest.recordId}`;
}

/**
 * Form state that survives navigating away and coming back. The value is kept in the
 * browser under `key` until it is cleared (after a save or an explicit discard).
 * Pass serialize/deserialize for values that are not plain JSON, such as a Map.
 */
export function useDraft<T, S = T>(key: string, initial: () => T, options?: { serialize?: (value: T) => S; deserialize?: (stored: S) => T }) {
  const serializeRef = useRef(options?.serialize ?? ((value: T) => value as unknown as S));
  serializeRef.current = options?.serialize ?? ((value: T) => value as unknown as S);
  const deserialize = options?.deserialize ?? ((stored: S) => stored as unknown as T);
  const initialJson = useRef<string | null>(null);
  const restoredRef = useRef(false);

  const [value, setValue] = useState<T>(() => {
    const fresh = initial();
    initialJson.current = JSON.stringify(serializeRef.current(fresh));
    if (typeof window === "undefined") return fresh;
    const stored = readStored<S>(key);
    if (stored && JSON.stringify(stored.value) !== initialJson.current) {
      restoredRef.current = true;
      return deserialize(stored.value);
    }
    return fresh;
  });
  const [restored, setRestored] = useState(restoredRef.current);

  useEffect(() => {
    const serialized = serializeRef.current(value);
    if (JSON.stringify(serialized) === initialJson.current) removeStored(key);
    else writeStored(key, serialized);
  }, [key, value]);

  const clear = useCallback((next?: T) => {
    removeStored(key);
    restoredRef.current = false;
    setRestored(false);
    if (next !== undefined) {
      initialJson.current = JSON.stringify(serializeRef.current(next));
      setValue(next);
    }
  }, [key]);

  return { value, setValue: setValue as Dispatch<SetStateAction<T>>, restored, wasRestored: restoredRef.current, clear };
}

/** Builds a stable draft key for the signed-in trader, a form name and the record being edited. */
export function draftKey(traderId: string | undefined, form: string, recordId?: number | string | null) {
  return `${traderId ?? "anon"}:${form}:${recordId ?? "new"}`;
}

/** Reads a numeric query parameter once, on the client. */
export function queryNumber(name: string) {
  if (typeof window === "undefined") return null;
  const value = Number(new URLSearchParams(window.location.search).get(name));
  return value > 0 ? value : null;
}
