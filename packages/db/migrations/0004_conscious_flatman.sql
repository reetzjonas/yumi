DROP INDEX "pantry_item_household_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "pantry_item_household_ingredient_idx" ON "pantry_item" USING btree ("household_id","ingredient_id");