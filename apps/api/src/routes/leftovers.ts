import { leftover } from "@yumi/db/schema";
import { unitSchema } from "@yumi/shared";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { validator } from "hono/validator";
import { z } from "zod";
import { type HouseholdEnv, requireAuth, requireHousehold } from "../context";
import { db } from "../db";
import { loadLeftovers, reuseSuggestions } from "../leftovers";
import { lockQueue } from "./queue";

export const leftovers = new Hono<HouseholdEnv>()
  .use(requireAuth, requireHousehold)
  .get("/", async (c) => c.json(await loadLeftovers(c.get("householdId"))))
  .get(
    "/suggestions",
    validator("query", (value) =>
      z
        .object({ similar: z.enum(["true", "false"]).default("false") })
        .parse(value),
    ),
    async (c) =>
      c.json(
        await reuseSuggestions(
          c.get("householdId"),
          c.req.valid("query").similar === "true",
        ),
      ),
  )
  .patch(
    "/:id",
    validator("json", (value) =>
      z
        .object({
          quantity: z.number().positive().max(1_000_000),
          unit: unitSchema,
        })
        .parse(value),
    ),
    async (c) => {
      const householdId = c.get("householdId");
      const id = z.uuid().parse(c.req.param("id"));
      const result = await db.transaction(async (tx) => {
        await lockQueue(tx, householdId);
        const [updated] = await tx
          .update(leftover)
          .set(c.req.valid("json"))
          .where(
            and(eq(leftover.id, id), eq(leftover.householdId, householdId)),
          )
          .returning({ id: leftover.id });
        if (!updated) throw new HTTPException(404, { message: "not_found" });
        return updated;
      });
      return c.json(result);
    },
  )
  .delete("/:id", async (c) => {
    const householdId = c.get("householdId");
    const id = z.uuid().parse(c.req.param("id"));
    await db.transaction(async (tx) => {
      await lockQueue(tx, householdId);
      const [deleted] = await tx
        .delete(leftover)
        .where(and(eq(leftover.id, id), eq(leftover.householdId, householdId)))
        .returning({ id: leftover.id });
      if (!deleted) throw new HTTPException(404, { message: "not_found" });
    });
    return c.body(null, 204);
  });
