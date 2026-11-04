ALTER TABLE "recipe_ingredient" ADD COLUMN "exclude_from_nutrition" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE "recipe_ingredient"
SET "exclude_from_nutrition" = true
WHERE "quantity" IS NULL
  AND "ingredient_id" IN (
    SELECT i."id"
    FROM "ingredient" i
    JOIN "ingredient_category" c ON c."id" = i."category_id"
    WHERE c."key" = 'spices'
  );