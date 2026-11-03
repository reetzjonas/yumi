import { serveStatic } from "hono/bun";
import { app } from "./app";

if (process.env.NODE_ENV === "production") {
  app.get(
    "*",
    (c, next) =>
      c.req.path === "/api" || c.req.path.startsWith("/api/")
        ? c.notFound()
        : next(),
    serveStatic({ root: "./apps/web/dist" }),
    serveStatic({ path: "./apps/web/dist/index.html" }),
  );
}

const port = Number(process.env.PORT ?? 3000);

// SSE streams ping every 25 s; Bun closes idle connections after 10 s by default.
export default { port, fetch: app.fetch, idleTimeout: 60 };
