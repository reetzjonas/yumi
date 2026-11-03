import type { Health } from "@yumi/shared";
import { Hono } from "hono";
import { logger } from "hono/logger";

const version = process.env.APP_VERSION ?? "dev";

const api = new Hono().get("/health", (c) =>
  c.json<Health>({ status: "ok", version }),
);

export const app = new Hono().use(logger()).route("/api", api);

export type AppType = typeof app;
