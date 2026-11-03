import { describe, expect, test } from "bun:test";
import type { ShoppingEvent } from "@yumi/shared";
import { type OutboxRecord, replayDisposition, replayOutbox } from "./outbox";

function record(sequence: number, listId = "list-a"): OutboxRecord {
  return {
    sequence,
    householdId: "household",
    listId,
    event: {
      id: `event-${sequence}`,
      itemId: `item-${sequence}`,
      clientTs: "2026-11-03T10:00:00.000Z",
      storeId: "selected-store",
      type: "item_checked",
    },
  };
}

describe("outbox replay", () => {
  test("classifies only 200 as acknowledged and preserves session failures", () => {
    expect(replayDisposition(200)).toBe("applied");
    for (const status of [400, 403, 404, 422, 429])
      expect(replayDisposition(status)).toBe("rejected");
    for (const status of [0, 201, 401, 409, 500, 503])
      expect(replayDisposition(status)).toBe("retry");
  });

  test("groups lists and replays at most 500 events in insertion order", async () => {
    const pending = Array.from({ length: 1_001 }, (_, index) =>
      record(index, index === 3 ? "list-b" : "list-a"),
    );
    const sent: { listId: string; events: ShoppingEvent[] }[] = [];
    const removed: OutboxRecord[] = [];
    const retry = await replayOutbox(pending, {
      active: () => true,
      send: async (listId, events) => {
        sent.push({ listId, events });
        return { status: 200 };
      },
      remove: async (batch) => {
        removed.push(...batch);
      },
      rejected: () => {
        throw new Error("Unexpected permanent rejection");
      },
    });
    expect(retry).toBe(false);
    expect(sent.map((batch) => batch.events.length)).toEqual([500, 500, 1]);
    expect(sent[0]?.events[3]?.id).toBe("event-4");
    expect(sent[2]?.listId).toBe("list-b");
    expect(removed).toHaveLength(1_001);
    expect(sent[0]?.events[0]?.storeId).toBe("selected-store");
  });

  test.each([401, 409, 500])(
    "keeps status %i and later events for the same list",
    async (status) => {
      const sent: string[] = [];
      const removed: OutboxRecord[] = [];
      const retry = await replayOutbox(
        [
          ...Array.from({ length: 501 }, (_, index) => record(index)),
          record(502, "list-b"),
        ],
        {
          active: () => true,
          send: async (listId) => {
            sent.push(listId);
            return { status: listId === "list-a" ? status : 200 };
          },
          remove: async (batch) => {
            removed.push(...batch);
          },
          rejected: () => {
            throw new Error("Unexpected permanent rejection");
          },
        },
      );
      expect(retry).toBe(true);
      expect(sent).toEqual(["list-a", "list-b"]);
      expect(removed.map((row) => row.sequence)).toEqual([502]);
    },
  );

  test("drops permanent rejections and reports them", async () => {
    const removed: OutboxRecord[] = [];
    const rejected: string[] = [];
    expect(
      await replayOutbox([record(1)], {
        active: () => true,
        send: async () => ({ status: 404 }),
        remove: async (batch) => {
          removed.push(...batch);
        },
        rejected: (listId) => rejected.push(listId),
      }),
    ).toBe(false);
    expect(removed.map((row) => row.sequence)).toEqual([1]);
    expect(rejected).toEqual(["list-a"]);
  });

  test("keeps events after network failure", async () => {
    let removed = false;
    const retry = await replayOutbox([record(1)], {
      active: () => true,
      send: async () => {
        throw new TypeError("Network unavailable");
      },
      remove: async () => {
        removed = true;
      },
      rejected: () => {},
    });
    expect(retry).toBe(true);
    expect(removed).toBe(false);
  });

  test("does not acknowledge an in-flight response from a previous session", async () => {
    let active = true;
    let removed = false;
    await replayOutbox([record(1)], {
      active: () => active,
      send: async () => {
        active = false;
        return { status: 200 };
      },
      remove: async () => {
        removed = true;
      },
      rejected: () => {},
    });
    expect(removed).toBe(false);
  });
});
