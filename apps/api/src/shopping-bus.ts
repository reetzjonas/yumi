import { db } from "./db";

/**
 * Fan-out of shopping list changes to SSE subscribers via Postgres LISTEN/NOTIFY,
 * so every API replica hears changes made on any other one.
 */
const CHANNEL = "shopping_changes";
type Listener = (listId: string) => void;
const listeners = new Map<string, Set<Listener>>();
let listening: Promise<unknown> | undefined;

function ensureListening() {
  listening ??= db.$client.listen(CHANNEL, (payload) => {
    const { householdId, listId } = JSON.parse(payload) as {
      householdId: string;
      listId: string;
    };
    for (const listener of listeners.get(householdId) ?? []) listener(listId);
  });
  return listening;
}

export async function subscribeShopping(
  householdId: string,
  listener: Listener,
) {
  await ensureListening();
  const set = listeners.get(householdId) ?? new Set();
  set.add(listener);
  listeners.set(householdId, set);
  return () => {
    set.delete(listener);
    if (!set.size) listeners.delete(householdId);
  };
}

export async function publishListChange(householdId: string, listId: string) {
  await db.$client.notify(CHANNEL, JSON.stringify({ householdId, listId }));
}
