import {
  ingredient,
  pantryItem,
  recipe,
  recipeIngredient,
  shoppingEvent,
  shoppingList,
  shoppingListItem,
} from "@yumi/db/schema";
import {
  addRecipeToListSchema,
  parseIngredientLine,
  type ShoppingEvent,
  shoppingEventBatchSchema,
  shoppingEventSchema,
  shoppingItemFieldsSchema,
  shoppingListInputSchema,
  unitSchema,
} from "@yumi/shared";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { validator } from "hono/validator";
import { z } from "zod";
import { type HouseholdEnv, requireAuth, requireHousehold } from "../context";
import { db } from "../db";
import { applyDueRecurring } from "../recurring";
import { applyShoppingEvents } from "../shopping-events";
import { loadShoppingList } from "../shopping-list-data";

const LIST = "/lists/:id";
const listBody = validator("json", (value) =>
  shoppingListInputSchema.parse(value),
);

async function assertListOwned(householdId: string, id: string) {
  const [row] = await db
    .select({ id: shoppingList.id })
    .from(shoppingList)
    .where(
      and(eq(shoppingList.id, id), eq(shoppingList.householdId, householdId)),
    )
    .limit(1);
  if (!row) throw new HTTPException(404, { message: "not_found" });
}

const RECENT_LIMIT = 12;

/** Items the household added by hand lately, newest first, one per ingredient or label. */
async function recentItems(householdId: string) {
  const rows = await db
    .select({ payload: shoppingEvent.payload })
    .from(shoppingEvent)
    .innerJoin(shoppingList, eq(shoppingList.id, shoppingEvent.listId))
    .where(
      and(
        eq(shoppingList.householdId, householdId),
        eq(shoppingEvent.type, "item_added"),
      ),
    )
    .orderBy(desc(shoppingEvent.serverTs))
    .limit(300);
  const seen = new Set<string>();
  const recent = [];
  for (const row of rows) {
    const fields = shoppingItemFieldsSchema.safeParse(row.payload).data;
    if (!fields || fields.sources.length) continue;
    const key = fields.ingredientId ?? fields.label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    recent.push({ key, ...fields });
    if (recent.length === RECENT_LIMIT) break;
  }
  const ids = recent.flatMap((item) =>
    item.ingredientId ? [item.ingredientId] : [],
  );
  const linked = ids.length
    ? await db
        .select({
          id: ingredient.id,
          nameDe: ingredient.nameDe,
          nameEn: ingredient.nameEn,
          icon: ingredient.icon,
          categoryId: ingredient.categoryId,
          defaultUnit: ingredient.defaultUnit,
        })
        .from(ingredient)
        .where(inArray(ingredient.id, ids))
    : [];
  return recent.map(({ key, label, ingredientId, categoryId }) => ({
    key,
    label,
    categoryId,
    ingredient: linked.find((row) => row.id === ingredientId) ?? null,
  }));
}

const scale = (quantity: number | null, factor: number) =>
  quantity === null ? null : Math.round(quantity * factor * 1000) / 1000;

export const shopping = new Hono<HouseholdEnv>()
  .use(requireAuth, requireHousehold)
  .get("/lists", async (c) => {
    const rows = await db
      .select({
        id: shoppingList.id,
        name: shoppingList.name,
        defaultStoreId: shoppingList.defaultStoreId,
        openCount: count(shoppingListItem.id),
      })
      .from(shoppingList)
      .leftJoin(
        shoppingListItem,
        and(
          eq(shoppingListItem.listId, shoppingList.id),
          eq(shoppingListItem.checked, false),
        ),
      )
      .where(eq(shoppingList.householdId, c.get("householdId")))
      .groupBy(shoppingList.id)
      .orderBy(asc(shoppingList.createdAt));
    return c.json(rows);
  })
  .get("/recent", async (c) => c.json(await recentItems(c.get("householdId"))))
  .post("/lists", listBody, async (c) => {
    const input = c.req.valid("json");
    const [row] = await db
      .insert(shoppingList)
      .values({ ...input, householdId: c.get("householdId") })
      .returning({
        id: shoppingList.id,
        name: shoppingList.name,
        defaultStoreId: shoppingList.defaultStoreId,
      });
    return c.json(row, 201);
  })
  .patch(LIST, listBody, async (c) => {
    const input = c.req.valid("json");
    const [row] = await db
      .update(shoppingList)
      .set(input)
      .where(
        and(
          eq(shoppingList.id, z.uuid().parse(c.req.param("id"))),
          eq(shoppingList.householdId, c.get("householdId")),
        ),
      )
      .returning({
        id: shoppingList.id,
        name: shoppingList.name,
        defaultStoreId: shoppingList.defaultStoreId,
      });
    if (!row) throw new HTTPException(404, { message: "not_found" });
    return c.json(row);
  })
  .delete(LIST, async (c) => {
    const deleted = await db
      .delete(shoppingList)
      .where(
        and(
          eq(shoppingList.id, z.uuid().parse(c.req.param("id"))),
          eq(shoppingList.householdId, c.get("householdId")),
        ),
      )
      .returning({ id: shoppingList.id });
    if (deleted.length === 0)
      throw new HTTPException(404, { message: "not_found" });
    return c.body(null, 204);
  })
  .get(LIST, async (c) => {
    const householdId = c.get("householdId");
    const listId = z.uuid().parse(c.req.param("id"));
    await assertListOwned(householdId, listId);
    await applyDueRecurring({ listId, householdId, userId: c.get("user").id });
    return c.json(await loadShoppingList(householdId, listId));
  })
  .post(
    `${LIST}/events`,
    validator("json", (value) => shoppingEventBatchSchema.parse(value)),
    async (c) => {
      const householdId = c.get("householdId");
      const listId = z.uuid().parse(c.req.param("id"));
      await assertListOwned(householdId, listId);
      const { events } = c.req.valid("json");
      const applied = await applyShoppingEvents(
        { listId, householdId, userId: c.get("user").id },
        events,
      );
      return c.json({ applied });
    },
  )
  .post(
    `${LIST}/recipes`,
    validator("json", (value) => addRecipeToListSchema.parse(value)),
    async (c) => {
      const householdId = c.get("householdId");
      const listId = z.uuid().parse(c.req.param("id"));
      await assertListOwned(householdId, listId);
      const input = c.req.valid("json");
      const [source] = await db
        .select({ id: recipe.id, servings: recipe.servings })
        .from(recipe)
        .where(
          and(
            eq(recipe.id, input.recipeId),
            eq(recipe.householdId, householdId),
          ),
        )
        .limit(1);
      if (!source) throw new HTTPException(404, { message: "not_found" });
      const lines = await db
        .select({
          rawText: recipeIngredient.rawText,
          quantity: recipeIngredient.quantity,
          unit: recipeIngredient.unit,
          ingredientId: recipeIngredient.ingredientId,
          nameDe: ingredient.nameDe,
          nameEn: ingredient.nameEn,
        })
        .from(recipeIngredient)
        .leftJoin(ingredient, eq(ingredient.id, recipeIngredient.ingredientId))
        .where(
          and(
            eq(recipeIngredient.recipeId, source.id),
            eq(recipeIngredient.optional, false),
          ),
        )
        .orderBy(asc(recipeIngredient.position));
      const factor = (input.servings ?? source.servings) / source.servings;
      const clientTs = new Date().toISOString();
      const events: ShoppingEvent[] = lines.map((line) => ({
        id: crypto.randomUUID(),
        itemId: crypto.randomUUID(),
        clientTs,
        type: "item_added",
        payload: {
          label:
            (input.locale === "en" ? line.nameEn : line.nameDe) ??
            (parseIngredientLine(line.rawText).name || line.rawText),
          ingredientId: line.ingredientId,
          quantity: scale(line.quantity, factor),
          unit: unitSchema.safeParse(line.unit).data ?? null,
          sources: [{ kind: "recipe", id: source.id }],
        },
      }));
      const staples = new Set(
        (
          await db
            .select({ ingredientId: pantryItem.ingredientId })
            .from(pantryItem)
            .where(eq(pantryItem.householdId, householdId))
        ).map((row) => row.ingredientId),
      );
      const isStaple = (event: ShoppingEvent) =>
        event.type === "item_added" &&
        !!event.payload.ingredientId &&
        staples.has(event.payload.ingredientId);
      const parsed = events
        .filter((e) => !isStaple(e))
        .map((e) => shoppingEventSchema.parse(e));
      const applied = parsed.length
        ? await applyShoppingEvents(
            { listId, householdId, userId: c.get("user").id },
            parsed,
          )
        : [];
      // offered as "check if you still have" so the client can add them anyway
      const skipped = events.flatMap((e) =>
        e.type === "item_added" && isStaple(e) ? [e.payload] : [],
      );
      return c.json({ added: applied.length, staples: skipped }, 201);
    },
  );
