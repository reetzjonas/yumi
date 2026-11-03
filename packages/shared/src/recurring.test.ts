import { expect, test } from "bun:test";
import { advanceDue, firstOccurrence } from "./recurring";

test("first occurrence is the same day or the next matching weekday", () => {
  // 2026-11-03 is a Tuesday
  expect(firstOccurrence("2026-11-03", 2)).toBe("2026-11-03");
  expect(firstOccurrence("2026-11-03", 6)).toBe("2026-11-07");
  expect(firstOccurrence("2026-11-03", 1)).toBe("2026-11-09");
});

test("a due date moves one interval past today", () => {
  expect(advanceDue("2026-11-07", 1, "2026-11-07")).toBe("2026-11-14");
  expect(advanceDue("2026-11-07", 2, "2026-11-08")).toBe("2026-11-21");
});

test("missed runs collapse into the next future date", () => {
  expect(advanceDue("2026-10-03", 1, "2026-11-03")).toBe("2026-11-07");
  expect(advanceDue("2026-10-03", 2, "2026-11-03")).toBe("2026-11-14");
});
