import { expect, test } from "bun:test";
import { healthSchema } from "./health";

test("health schema rejects unknown status", () => {
  expect(healthSchema.safeParse({ status: "ok", version: "1" }).success).toBe(
    true,
  );
  expect(healthSchema.safeParse({ status: "down", version: "1" }).success).toBe(
    false,
  );
});
