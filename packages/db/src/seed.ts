import { sql } from "drizzle-orm";
import { createDb } from "./index";
import { ingredientCategory } from "./schema";

const categories: Array<[key: string, de: string, en: string, icon: string]> = [
  ["produce", "Obst & Gemüse", "Produce", "🥕"],
  ["bakery", "Brot & Backwaren", "Bakery", "🥖"],
  ["dairy", "Milchprodukte & Eier", "Dairy & eggs", "🧀"],
  ["meat", "Fleisch & Wurst", "Meat", "🥩"],
  ["fish", "Fisch", "Fish", "🐟"],
  ["frozen", "Tiefkühl", "Frozen", "🧊"],
  ["pantry", "Vorrat & Konserven", "Pantry", "🥫"],
  ["pasta-grains", "Nudeln, Reis & Getreide", "Pasta, rice & grains", "🍝"],
  ["baking", "Backzutaten", "Baking", "🧁"],
  ["spices", "Gewürze & Saucen", "Spices & sauces", "🧂"],
  ["snacks", "Snacks & Süßes", "Snacks & sweets", "🍫"],
  ["drinks", "Getränke", "Drinks", "🧃"],
  ["household", "Haushalt & Drogerie", "Household", "🧻"],
  ["other", "Sonstiges", "Other", "🛒"],
];

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const db = createDb(url);

await db
  .insert(ingredientCategory)
  .values(
    categories.map(([key, nameDe, nameEn, icon], i) => ({
      key,
      nameDe,
      nameEn,
      icon,
      defaultPosition: i * 10,
    })),
  )
  .onConflictDoUpdate({
    target: ingredientCategory.key,
    set: {
      nameDe: sql`excluded.name_de`,
      nameEn: sql`excluded.name_en`,
      icon: sql`excluded.icon`,
      defaultPosition: sql`excluded.default_position`,
    },
  });
console.log(`seeded ${categories.length} categories`);
await db.$client.end();
