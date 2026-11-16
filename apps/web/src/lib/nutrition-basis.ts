import { useSyncExternalStore } from "react";
import { readPreference, writePreference } from "@/lib/preferences";

export type NutritionBasis = "portion" | "100g";
const KEY = "yumi.nutrition.basis";
const listeners = new Set<() => void>();

const current = (): NutritionBasis =>
  readPreference(KEY) === "100g" ? "100g" : "portion";

/** Recipe nutrition per portion or per 100 g; stored per device for all recipes. */
export function useNutritionBasis() {
  const basis = useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, current);
  return [
    basis,
    (next: NutritionBasis) => {
      writePreference(KEY, next);
      for (const listener of listeners) listener();
    },
  ] as const;
}
