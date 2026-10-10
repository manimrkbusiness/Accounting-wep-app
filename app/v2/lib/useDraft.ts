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

function writeStored<S>(key: string, value: S) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify({ value, savedAt: new Date().toISOString() } satisfies Stored<S>));
  } catch {
    // Storage can be unavailable (private mode, quota). The form still works without drafts.
  }
}

function removeStored(key: string) {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
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
