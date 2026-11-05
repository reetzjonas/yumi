import {
  ingredient,
  recipe,
  recipeImage,
  recipeIngredient,
  recipeStep,
  shareLink,
} from "@yumi/db/schema";
import { and, asc, eq, gt, isNull, or } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "./db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function activeShare(tx: Tx | typeof db, token: string) {
  const [link] = await tx
    .select({ recipeId: shareLink.recipeId })
    .from(shareLink)
    .where(
      and(
        eq(shareLink.token, token),
        or(isNull(shareLink.expiresAt), gt(shareLink.expiresAt, new Date())),
      ),
    );
  if (!link) throw new HTTPException(404, { message: "not_found" });
  return link;
}

export async function sharedRecipe(token: string) {
  return db.transaction(
    async (tx) => {
      const link = await activeShare(tx, token);
      const [row] = await tx
        .select({
          title: recipe.title,
          description: recipe.description,
          servings: recipe.servings,
          prepMinutes: recipe.prepMinutes,
          cookMinutes: recipe.cookMinutes,
          sourceUrl: recipe.sourceUrl,
          tags: recipe.tags,
          imageKey: recipe.imageKey,
        })
        .from(recipe)
        .where(eq(recipe.id, link.recipeId));
      if (!row) throw new HTTPException(404, { message: "not_found" });
      const ingredients = await tx
        .select({
          section: recipeIngredient.section,
          rawText: recipeIngredient.rawText,
          quantity: recipeIngredient.quantity,
          unit: recipeIngredient.unit,
          note: recipeIngredient.note,
          optional: recipeIngredient.optional,
          ingredient: { nameDe: ingredient.nameDe, nameEn: ingredient.nameEn },
        })
        .from(recipeIngredient)
        .leftJoin(ingredient, eq(ingredient.id, recipeIngredient.ingredientId))
        .where(eq(recipeIngredient.recipeId, link.recipeId))
        .orderBy(asc(recipeIngredient.position));
      const steps = await tx
        .select({ text: recipeStep.text })
        .from(recipeStep)
        .where(eq(recipeStep.recipeId, link.recipeId))
        .orderBy(asc(recipeStep.position));
      return { ...row, ingredients, steps };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

export async function copySharedRecipe(
  token: string,
  destination: { readonly householdId: string; readonly userId: string },
) {
  return db.transaction(async (tx) => {
    const link = await activeShare(tx, token);
    const [source] = await tx
      .select()
      .from(recipe)
      .where(eq(recipe.id, link.recipeId))
      .for("share");
    if (!source) throw new HTTPException(404, { message: "not_found" });
    const recipeId = crypto.randomUUID();
    const [image] = await tx
      .select()
      .from(recipeImage)
      .where(eq(recipeImage.recipeId, source.id));
    const imageId = image ? crypto.randomUUID() : null;
    await tx.insert(recipe).values({
      id: recipeId,
      householdId: destination.householdId,
      createdBy: destination.userId,
      title: source.title,
      description: source.description,
      servings: source.servings,
      prepMinutes: source.prepMinutes,
      cookMinutes: source.cookMinutes,
      sourceUrl: source.sourceUrl,
      language: source.language,
      tags: source.tags,
      imageKey: imageId,
    });
    const lines = await tx
      .select()
      .from(recipeIngredient)
      .where(eq(recipeIngredient.recipeId, source.id));
    const catalogIds = new Map<string, string>();
    const lineIds = new Map<string, string>();
    for (const line of lines) {
      let ingredientId = line.ingredientId;
      if (ingredientId && !catalogIds.has(ingredientId)) {
        const [item] = await tx
          .select()
          .from(ingredient)
          .where(eq(ingredient.id, ingredientId));
        if (
          item &&
          item.householdId !== null &&
          item.householdId !== destination.householdId
        ) {
          const id = crypto.randomUUID();
          await tx.insert(ingredient).values({
            ...item,
            id,
            key: null,
            householdId: destination.householdId,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          catalogIds.set(ingredientId, id);
        } else {
          catalogIds.set(ingredientId, ingredientId);
        }
      }
      ingredientId = ingredientId
        ? (catalogIds.get(ingredientId) ?? null)
        : null;
      const id = crypto.randomUUID();
      lineIds.set(line.id, id);
      await tx
        .insert(recipeIngredient)
        .values({ ...line, id, recipeId, ingredientId });
    }
    const steps = await tx
      .select()
      .from(recipeStep)
      .where(eq(recipeStep.recipeId, source.id));
    if (steps.length > 0) {
      await tx.insert(recipeStep).values(
        steps.map((step) => ({
          ...step,
          id: crypto.randomUUID(),
          recipeId,
          ingredientRefs: step.ingredientRefs.flatMap(
            (id) => lineIds.get(id) ?? [],
          ),
        })),
      );
    }
    if (image && imageId) {
      await tx.insert(recipeImage).values({
        id: imageId,
        recipeId,
        thumb: image.thumb,
        full: image.full,
      });
    }
    return { id: recipeId };
  });
}
