ALTER TABLE "ingredient" ADD COLUMN "key" text;--> statement-breakpoint
ALTER TABLE "ingredient" ADD CONSTRAINT "ingredient_key_unique" UNIQUE("key");