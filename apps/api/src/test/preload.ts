import { afterAll } from "bun:test";
import { setupTestDatabase } from "./setup-db";

const teardown = await setupTestDatabase("run");

afterAll(async () => {
  const { db } = await import("../db");
  await db.$client.end();
  await teardown();
});
