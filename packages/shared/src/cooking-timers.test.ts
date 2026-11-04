import { describe, expect, test } from "bun:test";
import assert from "node:assert/strict";
import {
  formatTimerTime,
  parseStoredTimers,
  remainingTime,
  serializeTimers,
  timerStorageKey,
  transitionTimers,
} from "./cooking-timers";

const start = (id = "one", seconds = 60) =>
  ({
    type: "start",
    id,
    seconds,
    label: `Soup / Step 1 / ${seconds} s`,
  }) as const;

describe("cooking timer transitions", () => {
  test("starts parallel timers with absolute deadlines", () => {
    let timers = transitionTimers([], start(), 1_000);
    timers = transitionTimers(timers, start("two", 120), 2_000);
    expect(timers).toMatchObject([
      { id: "one", status: "running", endsAt: 61_000 },
      { id: "two", status: "running", endsAt: 122_000 },
    ]);
    assert(timers[0]);
    expect(remainingTime(timers[0], 11_000)).toBe(50_000);
    expect(remainingTime(timers[0], 99_000)).toBe(0);
  });

  test("pauses exactly the selected timer and resumes from its saved remainder", () => {
    let timers = transitionTimers([], start(), 1_000);
    timers = transitionTimers(timers, start("two"), 1_000);
    timers = transitionTimers(timers, { type: "pause", id: "one" }, 11_500);
    expect(timers[0]).toMatchObject({ status: "paused", remainingMs: 49_500 });
    expect(timers[1]).toMatchObject({ status: "running", endsAt: 61_000 });
    assert(timers[0]);
    expect(remainingTime(timers[0], 100_000)).toBe(49_500);
    timers = transitionTimers(timers, { type: "resume", id: "one" }, 100_000);
    expect(timers[0]).toMatchObject({ status: "running", endsAt: 149_500 });
  });

  test("clock jumps and throttled ticks complete once and leave paused timers alone", () => {
    let timers = transitionTimers([], start(), 1_000);
    timers = transitionTimers(timers, start("two"), 1_000);
    timers = transitionTimers(timers, { type: "pause", id: "two" }, 2_000);
    const completed = transitionTimers(timers, { type: "tick" }, 900_000);
    expect(completed[0]).toMatchObject({ status: "completed" });
    expect(completed[1]).toMatchObject({ status: "paused" });
    expect(transitionTimers(completed, { type: "tick" }, 901_000)).toBe(
      completed,
    );
  });

  test("a pause at the deadline completes instead of retaining a zero timer", () => {
    const timers = transitionTimers([], start(), 1_000);
    expect(
      transitionTimers(timers, { type: "pause", id: "one" }, 61_000)[0],
    ).toMatchObject({ status: "completed" });
  });

  test("cancel removes active timers and only dismiss removes completed alarms", () => {
    let timers = transitionTimers([], start(), 0);
    expect(transitionTimers(timers, { type: "dismiss", id: "one" }, 0)).toEqual(
      timers,
    );
    expect(transitionTimers(timers, { type: "cancel", id: "one" }, 0)).toEqual(
      [],
    );
    timers = transitionTimers(timers, { type: "tick" }, 60_000);
    expect(
      transitionTimers(timers, { type: "cancel", id: "one" }, 60_000),
    ).toEqual(timers);
    expect(
      transitionTimers(timers, { type: "dismiss", id: "one" }, 60_000),
    ).toEqual([]);
  });

  test("unknown IDs do not modify running timers", () => {
    const timers = transitionTimers([], start(), 0);
    expect(
      transitionTimers(timers, { type: "pause", id: "other" }, 1_000),
    ).toBe(timers);
  });

  test("rejects invalid start durations at the production boundary", () => {
    for (const seconds of [
      0,
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      604_801,
    ]) {
      expect(() => transitionTimers([], start("one", seconds), 0)).toThrow();
    }
  });
});

describe("household timer persistence", () => {
  test("round-trips running, paused and completed state", () => {
    let timers = transitionTimers([], start("completed", 1), 0);
    timers = transitionTimers(timers, start("paused"), 0);
    timers = transitionTimers(timers, start("running", 120), 0);
    timers = transitionTimers(timers, { type: "pause", id: "paused" }, 500);
    timers = transitionTimers(timers, { type: "tick" }, 1_000);
    const restored = parseStoredTimers(serializeTimers("home", timers), "home");
    expect(restored).toEqual(timers);
    const next = transitionTimers(restored, { type: "tick" }, 2_000);
    expect(next).toBe(restored);
  });

  test("restores overdue active timers and completes them once", () => {
    const timers = transitionTimers([], start(), 0);
    const restored = parseStoredTimers(serializeTimers("home", timers), "home");
    const completed = transitionTimers(restored, { type: "tick" }, 100_000);
    expect(completed[0]?.status).toBe("completed");
    const reloaded = parseStoredTimers(
      serializeTimers("home", completed),
      "home",
    );
    expect(transitionTimers(reloaded, { type: "tick" }, 200_000)).toBe(
      reloaded,
    );
  });

  test("scopes both storage keys and payloads to the current household", () => {
    const timers = transitionTimers([], start(), 0);
    expect(timerStorageKey("a")).not.toBe(timerStorageKey("b"));
    expect(parseStoredTimers(serializeTimers("a", timers), "b")).toEqual([]);
  });

  test("rejects malformed, unknown-version and invalid timer records", () => {
    const running = transitionTimers([], start(), 0)[0];
    const payload = (timers: unknown, version = 1) =>
      JSON.stringify({ householdId: "home", version, timers });
    for (const value of [
      null,
      "{",
      "null",
      "{}",
      payload([running], 2),
      payload([running, running]),
      payload([{ ...running, status: "unknown" }]),
      payload([{ ...running, endsAt: -1 }]),
      payload([{ ...running, durationMs: "60000" }]),
      payload([{ ...running, status: "paused", remainingMs: 60_001 }]),
      payload([{ ...running, status: "paused", remainingMs: 0 }]),
      payload([{ ...running, label: "" }]),
    ]) {
      expect(parseStoredTimers(value, "home")).toEqual([]);
    }
  });
});

test("formats timer remainders without rounding down early", () => {
  expect(formatTimerTime(0)).toBe("0:00");
  expect(formatTimerTime(1)).toBe("0:01");
  expect(formatTimerTime(60_001)).toBe("1:01");
  expect(formatTimerTime(3_661_000)).toBe("1:01:01");
});
