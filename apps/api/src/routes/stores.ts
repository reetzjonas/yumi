import { ingredientCategory, shoppingList, store } from "@yumi/db/schema";
import { listStoreInputSchema, storeInputSchema } from "@yumi/shared";
import { and, asc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { validator } from "hono/validator";
import { z } from "zod";
import { type HouseholdEnv, requireAuth, requireHousehold } from "../context";
import { db } from "../db";

const fields = {
  id: store.id,
  name: store.name,
  categoryOrder: store.categoryOrder,
};
const storeBody = validator("json", (value) => storeInputSchema.parse(value));

async function validateCategories(ids: string[]) {
  if (ids.length === 0) return;
  const rows = await db
    .select({ id: ingredientCategory.id })
    .from(ingredientCategory)
    .where(inArray(ingredientCategory.id, ids));
  if (rows.length !== ids.length)
    throw new HTTPException(400, { message: "invalid_category" });
}

export const stores = new Hono<HouseholdEnv>()
  .use(requireAuth, requireHousehold)
  .get("/", async (c) =>
    c.json(
      await db
        .select(fields)
        .from(store)
        .where(eq(store.householdId, c.get("householdId")))
        .orderBy(asc(store.name)),
    ),
  )
  .post("/", storeBody, async (c) => {
    const input = c.req.valid("json");
    await validateCategories(input.categoryOrder);
    const [row] = await db
      .insert(store)
      .values({ ...input, householdId: c.get("householdId") })
      .returning(fields);
    return c.json(row, 201);
  })
  .put("/:id", storeBody, async (c) => {
    const input = c.req.valid("json");
    await validateCategories(input.categoryOrder);
    const [row] = await db
      .update(store)
      .set(input)
      .where(
        and(
          eq(store.id, z.uuid().parse(c.req.param("id"))),
          eq(store.householdId, c.get("householdId")),
        ),
      )
      .returning(fields);
    if (!row) throw new HTTPException(404, { message: "not_found" });
    return c.json(row);
  })
  .delete("/:id", async (c) => {
    const rows = await db
      .delete(store)
      .where(
        and(
          eq(store.id, z.uuid().parse(c.req.param("id"))),
          eq(store.householdId, c.get("householdId")),
        ),
      )
      .returning({ id: store.id });
    if (rows.length === 0)
      throw new HTTPException(404, { message: "not_found" });
    return c.body(null, 204);
  });

export const listStore = new Hono<HouseholdEnv>()
  .use(requireAuth, requireHousehold)
  .put(
    "/lists/:id/store",
    validator("json", (value) => listStoreInputSchema.parse(value)),
    async (c) => {
      const householdId = c.get("householdId");
      const id = z.uuid().parse(c.req.param("id"));
      const { storeId } = c.req.valid("json");
      if (storeId) {
        const [owned] = await db
          .select({ id: store.id })
          .from(store)
          .where(and(eq(store.id, storeId), eq(store.householdId, householdId)))
          .limit(1);
        if (!owned) throw new HTTPException(404, { message: "not_found" });
      }
      const [list] = await db
        .update(shoppingList)
        .set({ defaultStoreId: storeId })
        .where(
          and(
            eq(shoppingList.id, id),
            eq(shoppingList.householdId, householdId),
          ),
        )
        .returning({ defaultStoreId: shoppingList.defaultStoreId });
      if (!list) throw new HTTPException(404, { message: "not_found" });
      return c.json(list);
    },
  );
