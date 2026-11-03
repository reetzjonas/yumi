import type { Health } from "@yumi/shared";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { ZodError } from "zod";
import { auth } from "./auth";
import { type AppEnv, loadSession } from "./context";
import { env } from "./env";
import { ingredients } from "./routes/ingredients";
import { householdInvites, invites } from "./routes/invites";
import { me } from "./routes/me";
import { pantry } from "./routes/pantry";
import { recipes } from "./routes/recipes";
import { shopping } from "./routes/shopping";
import { listStore, stores } from "./routes/stores";

const api = new Hono<AppEnv>()
  .on(["GET", "POST"], "/auth/*", (c) => auth.handler(c.req.raw))
  .get("/health", (c) =>
    c.json<Health>({ status: "ok", version: env.APP_VERSION }),
  )
  .use(loadSession)
  .route("/me", me)
  .route("/household/invites", householdInvites)
  .route("/invites", invites)
  .route("/ingredients", ingredients)
  .route("/recipes", recipes)
  .route("/pantry", pantry)
  .route("/shopping", shopping)
  .route("/shopping", listStore)
  .route("/stores", stores);

export const app = new Hono()
  .use(process.env.NODE_ENV === "test" ? (_c, next) => next() : logger())
  .route("/api", api)
  .onError((err, c) => {
    if (err instanceof HTTPException)
      return c.json({ error: err.message }, err.status);
    if (err instanceof ZodError)
      return c.json({ error: "invalid_input", issues: err.issues }, 400);
    console.error(err);
    return c.json({ error: "internal_error" }, 500);
  });

export type AppType = typeof app;
