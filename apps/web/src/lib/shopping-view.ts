import { useSyncExternalStore } from "react";
import { readPreference, writePreference } from "@/lib/preferences";

export type ShoppingView = "rows" | "tiles";
const KEY = "yumi.shopping.view";
const listeners = new Set<() => void>();

const current = (): ShoppingView =>
  readPreference(KEY) === "tiles" ? "tiles" : "rows";

/** Rows or tiles for the shopping list; stored per device, shared by all components. */
export function useShoppingView() {
  const view = useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, current);
  return [
    view,
    (next: ShoppingView) => {
      writePreference(KEY, next);
      for (const listener of listeners) listener();
    },
  ] as const;
}
