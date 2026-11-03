import { cookLog, mealQueueEntry, organization, recipe } from "@yumi/db/schema";
import {
  queueEntryInputSchema,
  queueEntryUpdateSchema,
  queueOrderSchema,
} from "@yumi/shared";
import { and, asc, eq, max } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { validator } from "hono/validator";
import { z } from "zod";
import { type HouseholdEnv, requireAuth, requireHousehold } from "../context";
import { db } from "../db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function lockQueue(tx: Tx, householdId: string) {
  await tx
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.id, householdId))
    .for("update");
}

function queued(householdId: string) {
  return and(
    eq(mealQueueEntry.householdId, householdId),
    eq(mealQueueEntry.status, "queued"),
  );
}

export const queue = new Hono<HouseholdEnv>()
  .use(requireAuth, requireHousehold)
  .get("/", async (c) =>
    c.json(
      await db
        .select({
          id: mealQueueEntry.id,
          recipeId: mealQueueEntry.recipeId,
          servings: mealQueueEntry.servings,
          position: mealQueueEntry.position,
          plannedFor: mealQueueEntry.plannedFor,
          status: mealQueueEntry.status,
          recipe: {
            id: recipe.id,
            title: recipe.title,
            servings: recipe.servings,
            imageKey: recipe.imageKey,
            prepMinutes: recipe.prepMinutes,
            cookMinutes: recipe.cookMinutes,
          },
        })
        .from(mealQueueEntry)
        .innerJoin(
          recipe,
          and(
            eq(recipe.id, mealQueueEntry.recipeId),
            eq(recipe.householdId, c.get("householdId")),
          ),
        )
        .where(queued(c.get("householdId")))
        .orderBy(asc(mealQueueEntry.position), asc(mealQueueEntry.id)),
    ),
  )
  .post(
    "/",
    validator("json", (value) => queueEntryInputSchema.parse(value)),
    async (c) => {
      const householdId = c.get("householdId");
      const input = c.req.valid("json");
      const row = await db.transaction(async (tx) => {
        await lockQueue(tx, householdId);
        const [owned] = await tx
          .select({ id: recipe.id })
          .from(recipe)
          .where(
            and(
              eq(recipe.id, input.recipeId),
              eq(recipe.householdId, householdId),
            ),
          );
        if (!owned) throw new HTTPException(404, { message: "not_found" });
        const [last] = await tx
          .select({ position: max(mealQueueEntry.position) })
          .from(mealQueueEntry)
          .where(queued(householdId));
        const [created] = await tx
          .insert(mealQueueEntry)
          .values({
            ...input,
            householdId,
            position: (last?.position ?? -1) + 1,
          })
          .returning();
        return created;
      });
      return c.json(row, 201);
    },
  )
  .put(
    "/order",
    validator("json", (value) => queueOrderSchema.parse(value)),
    async (c) => {
      const householdId = c.get("householdId");
      const { ids } = c.req.valid("json");
      await db.transaction(async (tx) => {
        await lockQueue(tx, householdId);
        const rows = await tx
          .select({ id: mealQueueEntry.id })
          .from(mealQueueEntry)
          .where(queued(householdId));
        const current = new Set(rows.map((row) => row.id));
        if (ids.length !== current.size || ids.some((id) => !current.has(id)))
          throw new HTTPException(409, { message: "invalid_input" });
        for (const [position, id] of ids.entries()) {
          await tx
            .update(mealQueueEntry)
            .set({ position })
            .where(and(queued(householdId), eq(mealQueueEntry.id, id)));
        }
      });
      return c.json({ ok: true });
    },
  )
  .patch(
    "/:id",
    validator("json", (value) => queueEntryUpdateSchema.parse(value)),
    async (c) => {
      const householdId = c.get("householdId");
      const id = z.uuid().parse(c.req.param("id"));
      const input = c.req.valid("json");
      const row = await db.transaction(async (tx) => {
        await lockQueue(tx, householdId);
        const [updated] = await tx
          .update(mealQueueEntry)
          .set(input)
          .where(and(queued(householdId), eq(mealQueueEntry.id, id)))
          .returning();
        if (!updated) throw new HTTPException(404, { message: "not_found" });
        if (input.status === "cooked") {
          await tx.insert(cookLog).values({
            householdId,
            recipeId: updated.recipeId,
            userId: c.get("user").id,
          });
        }
        return updated;
      });
      return c.json(row);
    },
  );
