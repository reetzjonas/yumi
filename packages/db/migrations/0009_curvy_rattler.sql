ALTER TABLE "ingredient" ADD COLUMN "nutrition_per100g" jsonb;--> statement-breakpoint
ALTER TABLE "ingredient" ADD COLUMN "nutrition_source" text;
