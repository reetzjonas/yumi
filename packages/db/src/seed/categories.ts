export const CATEGORY_KEYS = [
  "produce",
  "bakery",
  "dairy",
  "meat",
  "fish",
  "frozen",
  "pantry",
  "world-foods",
  "pasta-grains",
  "baking",
  "spices",
  "snacks",
  "drinks",
  "household",
  "other",
] as const;

export type CategoryKey = (typeof CATEGORY_KEYS)[number];

export const SEED_CATEGORIES: Record<
  CategoryKey,
  { de: string; en: string; icon: string }
> = {
  produce: { de: "Obst & Gemüse", en: "Produce", icon: "🥕" },
  bakery: { de: "Brot & Backwaren", en: "Bakery", icon: "🥖" },
  dairy: { de: "Milchprodukte & Eier", en: "Dairy & eggs", icon: "🧀" },
  meat: { de: "Fleisch & Wurst", en: "Meat", icon: "🥩" },
  fish: { de: "Fisch", en: "Fish", icon: "🐟" },
  frozen: { de: "Tiefkühl", en: "Frozen", icon: "🧊" },
  pantry: { de: "Vorrat & Konserven", en: "Pantry", icon: "🥫" },
  "world-foods": {
    de: "Asia & Internationales",
    en: "World foods",
    icon: "🍜",
  },
  "pasta-grains": {
    de: "Nudeln, Reis & Getreide",
    en: "Pasta, rice & grains",
    icon: "🍝",
  },
  baking: { de: "Backzutaten", en: "Baking", icon: "🧁" },
  spices: { de: "Gewürze & Saucen", en: "Spices & sauces", icon: "🧂" },
  snacks: { de: "Snacks & Süßes", en: "Snacks & sweets", icon: "🍫" },
  drinks: { de: "Getränke", en: "Drinks", icon: "🧃" },
  household: { de: "Haushalt & Drogerie", en: "Household", icon: "🧻" },
  other: { de: "Sonstiges", en: "Other", icon: "🛒" },
};
