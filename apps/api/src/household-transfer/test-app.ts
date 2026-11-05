import { expect } from "bun:test";
import { type HouseholdTransfer, householdTransferSchema } from "@yumi/shared";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { type AppEnv, loadSession } from "../context";
import { householdTransfer } from "../routes/household-transfer";
import { type Client, createHousehold, signUp } from "../test/client";

export const transferApp = new Hono<AppEnv>()
  .use(loadSession)
  .route("/transfer", householdTransfer)
  .onError((error, c) => {
    if (error instanceof HTTPException)
      return c.json({ error: error.message }, error.status);
    if (error instanceof ZodError)
      return c.json({ error: "invalid_input", issues: error.issues }, 400);
    throw error;
  });

export function request(c: Client, path: string, body?: unknown) {
  return transferApp.request(`/transfer/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { cookie: c.cookie, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function household(prefix: string) {
  const name = `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  const c = await signUp(name);
  const id = await createHousehold(c, `${name} home`);
  return { c, id };
}

export async function exported(c: Client): Promise<HouseholdTransfer> {
  const response = await request(c, "export");
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("content-disposition")).toContain(
    "yumi-household-v1.json",
  );
  return householdTransferSchema.parse(await response.json());
}
