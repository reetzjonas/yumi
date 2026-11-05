import { useCallback, useEffect, useState } from "react";

const SESSION_MS = 4 * 60 * 60 * 1000;
const storageKey = (listId: string) => `yumi.shopping.store.${listId}`;

function readSession(listId: string): { storeId: string; at: number } | null {
  const raw = localStorage.getItem(storageKey(listId));
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    localStorage.removeItem(storageKey(listId));
    return null;
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("storeId" in parsed) ||
    !("at" in parsed) ||
    typeof parsed.storeId !== "string" ||
    typeof parsed.at !== "number"
  )
    return null;
  const age = Date.now() - parsed.at;
  return age >= 0 && age < SESSION_MS
    ? { storeId: parsed.storeId, at: parsed.at }
    : null;
}

/**
 * The store the shopper explicitly picked for the current trip. Only this
 * store is attached to check events, so checking items at home does not train
 * the learned route. The pick expires after four hours without a check.
 */
export function useStoreSession(listId: string) {
  const [state, setState] = useState(() => ({
    listId,
    session: readSession(listId),
  }));
  if (state.listId !== listId)
    setState({ listId, session: readSession(listId) });
  const session = state.listId === listId ? state.session : null;
  const storeId = session?.storeId ?? null;
  const choose = useCallback(
    (next: string | null) => {
      const session = next ? { storeId: next, at: Date.now() } : null;
      if (session)
        localStorage.setItem(storageKey(listId), JSON.stringify(session));
      else localStorage.removeItem(storageKey(listId));
      setState({ listId, session });
    },
    [listId],
  );
  const touch = useCallback(() => {
    const current = readSession(listId)?.storeId ?? null;
    choose(current);
    return current;
  }, [listId, choose]);
  useEffect(() => {
    const refresh = () => setState({ listId, session: readSession(listId) });
    const timer = session
      ? window.setTimeout(
          refresh,
          Math.max(0, session.at + SESSION_MS - Date.now()),
        )
      : undefined;
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [listId, session]);
  return { storeId, choose, touch };
}

export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let disposed = false;
    const request = async () => {
      if (document.visibilityState !== "visible" || sentinel) return;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (disposed) await next.release();
        else {
          sentinel = next;
          next.addEventListener("release", () => {
            sentinel = null;
          });
        }
      } catch (error) {
        console.warn("Screen wake lock unavailable", error);
      }
    };
    void request();
    document.addEventListener("visibilitychange", request);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", request);
      void sentinel?.release();
    };
  }, [active]);
}
