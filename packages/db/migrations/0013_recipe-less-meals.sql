ALTER TABLE "meal_queue_entry" ALTER COLUMN "recipe_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "meal_queue_entry" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "meal_queue_entry" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "meal_queue_entry" ADD CONSTRAINT "meal_queue_meal_identity" CHECK (("meal_queue_entry"."recipe_id" IS NOT NULL AND "meal_queue_entry"."title" IS NULL) OR
        ("meal_queue_entry"."recipe_id" IS NULL AND "meal_queue_entry"."title" IS NOT NULL AND length(btrim("meal_queue_entry"."title")) BETWEEN 1 AND 200));