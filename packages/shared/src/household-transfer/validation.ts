import type { z } from "zod";
import type { HouseholdTransferData } from "./format";
import {
  HOUSEHOLD_TRANSFER_MAX_IMAGE_BYTES,
  HOUSEHOLD_TRANSFER_MAX_ROWS,
} from "./limits";

export function validateHouseholdTransfer(
  data: HouseholdTransferData,
  ctx: z.RefinementCtx,
) {
  let count = 0;
  const sets = new Map<string, Set<string>>();
  for (const [name, records] of Object.entries(data)) {
    if (!Array.isArray(records)) continue;
    count += records.length;
    const ids = records.map((record) =>
      "id" in record ? record.id : record.recipeId,
    );
    const unique = new Set(ids);
    sets.set(name, unique);
    if (unique.size !== ids.length)
      ctx.addIssue({ code: "custom", path: [name], message: "duplicate_id" });
  }
  if (count > HOUSEHOLD_TRANSFER_MAX_ROWS)
    ctx.addIssue({ code: "custom", message: "too_many_records" });
  const ref = (
    table: string,
    value: string | null,
    path: (string | number)[],
  ) => {
    if (value !== null && !sets.get(table)?.has(value))
      ctx.addIssue({ code: "custom", path, message: "dangling_reference" });
  };
  for (const [index, record] of data.recipeIngredients.entries()) {
    ref("recipes", record.recipeId, ["recipeIngredients", index, "recipeId"]);
    ref("ingredients", record.ingredientId, [
      "recipeIngredients",
      index,
      "ingredientId",
    ]);
  }
  const ingredientRecipes = new Map(
    data.recipeIngredients.map((record) => [record.id, record.recipeId]),
  );
  for (const [index, record] of data.steps.entries()) {
    ref("recipes", record.recipeId, ["steps", index, "recipeId"]);
    for (const ingredientId of record.ingredientRefs)
      if (ingredientRecipes.get(ingredientId) !== record.recipeId)
        ctx.addIssue({
          code: "custom",
          path: ["steps", index, "ingredientRefs"],
          message: "ingredient_reference_outside_recipe",
        });
  }
  for (const [index, record] of data.images.entries())
    ref("recipes", record.recipeId, ["images", index, "recipeId"]);
  for (const [index, record] of data.lists.entries())
    ref("stores", record.defaultStoreId, ["lists", index, "defaultStoreId"]);
  for (const table of ["items", "recurring"] as const)
    for (const [index, record] of data[table].entries()) {
      ref("lists", record.listId, [table, index, "listId"]);
      ref("ingredients", record.ingredientId, [table, index, "ingredientId"]);
    }
  for (const [index, record] of data.items.entries())
    for (const source of record.sources)
      ref(
        { recipe: "recipes", queue: "queue", recurring: "recurring" }[
          source.kind
        ],
        source.id,
        ["items", index, "sources"],
      );
  for (const [index, record] of data.queue.entries())
    ref("recipes", record.recipeId, ["queue", index, "recipeId"]);
  for (const table of ["pantry", "leftovers"] as const)
    for (const [index, record] of data[table].entries())
      ref("ingredients", record.ingredientId, [table, index, "ingredientId"]);
  if (
    new Set(data.pantry.map((record) => record.ingredientId)).size !==
    data.pantry.length
  )
    ctx.addIssue({
      code: "custom",
      path: ["pantry"],
      message: "duplicate_ingredient",
    });
  const globalKeys = data.ingredients.flatMap((record) =>
    record.kind === "global" ? [record.key] : [],
  );
  if (new Set(globalKeys).size !== globalKeys.length)
    ctx.addIssue({
      code: "custom",
      path: ["ingredients"],
      message: "duplicate_global_key",
    });
  for (const [index, record] of data.leftovers.entries())
    for (const sourceId of record.sourceEntryIds)
      ref("queue", sourceId, ["leftovers", index, "sourceEntryIds"]);
  for (const [index, record] of data.cookLogs.entries())
    ref("recipes", record.recipeId, ["cookLogs", index, "recipeId"]);
  const imageBytes = data.images.reduce(
    (sum, image) =>
      sum +
      [image.thumb, image.full].reduce(
        (bytes, encoded) =>
          bytes +
          (encoded.length / 4) * 3 -
          (encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0),
        0,
      ),
    0,
  );
  if (imageBytes > HOUSEHOLD_TRANSFER_MAX_IMAGE_BYTES)
    ctx.addIssue({
      code: "custom",
      path: ["images"],
      message: "images_too_large",
    });
}
