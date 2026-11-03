import type { ShoppingEvent } from "@yumi/shared";

export interface OutboxRecord {
  sequence: number;
  householdId: string;
  listId: string;
  event: ShoppingEvent;
}

const listeners = new Set<() => void>();
let records: OutboxRecord[] = [];
let database: Promise<IDBDatabase> | undefined;
let loaded: Promise<void> | undefined;
let revision = 0;
let sessionVersion = 0;

function openDatabase() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("yumi-shopping", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("outbox", {
        keyPath: "sequence",
        autoIncrement: true,
      });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return database;
}

async function transact<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("outbox", mode);
    const request = action(transaction.objectStore("outbox"));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function notify() {
  revision += 1;
  for (const listener of listeners) listener();
}

export function subscribeOutbox(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const outboxRevision = () => revision;
export const outboxSessionVersion = () => sessionVersion;

export function loadOutbox() {
  loaded ??= transact<OutboxRecord[]>("readonly", (store) =>
    store.getAll(),
  ).then((stored) => {
    records = stored;
    notify();
  });
  return loaded;
}

export function pendingRecords(householdId: string, listId?: string) {
  return records.filter(
    (record) =>
      record.householdId === householdId &&
      (listId === undefined || record.listId === listId),
  );
}

export async function enqueueEvents(
  householdId: string,
  listId: string,
  events: ShoppingEvent[],
) {
  await loadOutbox();
  const db = await openDatabase();
  const added: OutboxRecord[] = [];
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("outbox", "readwrite");
    const store = transaction.objectStore("outbox");
    for (const event of events) {
      const record = { householdId, listId, event };
      const request = store.add(record);
      request.onsuccess = () =>
        added.push({ ...record, sequence: Number(request.result) });
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  records = [...records, ...added].sort((a, b) => a.sequence - b.sequence);
  notify();
}

export async function removeRecords(removed: OutboxRecord[]) {
  if (!removed.length) return;
  const db = await openDatabase();
  const sequences = new Set(removed.map((record) => record.sequence));
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("outbox", "readwrite");
    const store = transaction.objectStore("outbox");
    for (const sequence of sequences) store.delete(sequence);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  records = records.filter((record) => !sequences.has(record.sequence));
  notify();
}

export async function clearOutbox(householdId?: string) {
  // A session transition invalidates any replay already waiting on a response.
  sessionVersion += 1;
  notify();
  if (!("indexedDB" in globalThis)) return;
  await loadOutbox();
  await removeRecords(householdId ? pendingRecords(householdId) : [...records]);
}

export function replayDisposition(status: number) {
  if (status === 200) return "applied";
  if (status >= 400 && status < 500 && status !== 401 && status !== 409)
    return "rejected";
  return "retry";
}

/** Each list is replayed in insertion order; one unavailable list does not block the others. */
export async function replayOutbox(
  pending: OutboxRecord[],
  callbacks: {
    send: (
      listId: string,
      events: ShoppingEvent[],
    ) => Promise<{ status: number }>;
    remove: (batch: OutboxRecord[]) => Promise<void>;
    rejected: (listId: string) => void;
    active: () => boolean;
  },
) {
  let retry = false;
  for (const listId of new Set(pending.map((record) => record.listId))) {
    const list = pending.filter((record) => record.listId === listId);
    for (let offset = 0; offset < list.length; offset += 500) {
      if (!callbacks.active()) return false;
      const batch = list.slice(offset, offset + 500);
      let disposition: ReturnType<typeof replayDisposition>;
      try {
        disposition = replayDisposition(
          (
            await callbacks.send(
              listId,
              batch.map((record) => record.event),
            )
          ).status,
        );
      } catch {
        disposition = "retry";
      }
      if (!callbacks.active()) return false;
      if (disposition === "retry") {
        retry = true;
        break;
      }
      await callbacks.remove(batch);
      if (disposition === "rejected") callbacks.rejected(listId);
    }
  }
  return retry;
}
