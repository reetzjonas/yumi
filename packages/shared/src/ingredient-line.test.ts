import { describe, expect, test } from "bun:test";
import {
  type ParsedIngredientLine,
  parseIngredientLine,
} from "./ingredient-line";

type Expected = Partial<Omit<ParsedIngredientLine, "raw" | "confidence">>;

const cases: Array<[line: string, expected: Expected]> = [
  [
    "200 g Mehl, gesiebt",
    { quantity: 200, unit: "g", name: "Mehl", note: "gesiebt" },
  ],
  ["1 1/2 EL Öl", { quantity: 1.5, unit: "tbsp", name: "Öl" }],
  [
    "2-3 Zwiebeln",
    { quantity: 2, quantityMax: 3, unit: null, name: "Zwiebeln" },
  ],
  ["Salz", { quantity: null, unit: null, name: "Salz", note: null }],
  [
    "500g Hackfleisch (gemischt)",
    { quantity: 500, unit: "g", name: "Hackfleisch", note: "gemischt" },
  ],
  ["½ TL Zimt", { quantity: 0.5, unit: "tsp", name: "Zimt" }],
  ["1½ Liter Milch", { quantity: 1.5, unit: "l", name: "Milch" }],
  ["0,5 l Gemüsebrühe", { quantity: 0.5, unit: "l", name: "Gemüsebrühe" }],
  [
    "1 Dose Tomaten (400 g)",
    { quantity: 1, unit: "can", name: "Tomaten", note: "400 g" },
  ],
  ["2 große Zwiebeln", { quantity: 2, name: "Zwiebeln", note: "große" }],
  ["2 Möhre(n)", { quantity: 2, name: "Möhre", note: null }],
  [
    "1 Zwiebel(n), gewürfelt",
    { quantity: 1, name: "Zwiebel", note: "gewürfelt" },
  ],
  ["3 Ei(er) (Größe M)", { quantity: 3, name: "Ei", note: "Größe M" }],
  [
    "250 g Nudeln (kurze)",
    { quantity: 250, unit: "g", name: "Nudeln", note: "kurze" },
  ],
  [
    "1 gestr. TL Backpulver",
    { quantity: 1, unit: "tsp", name: "Backpulver", note: "gestr." },
  ],
  [
    "3 Zehen Knoblauch",
    { quantity: 3, unit: null, unitText: "Zehen", name: "Knoblauch" },
  ],
  ["1 Prise Salz", { quantity: 1, unit: "pinch", name: "Salz" }],
  ["eine Prise Muskat", { quantity: 1, unit: "pinch", name: "Muskat" }],
  [
    "1 Bund Petersilie, gehackt",
    { quantity: 1, unit: "bunch", name: "Petersilie", note: "gehackt" },
  ],
  [
    "1 Pck. Vanillezucker",
    { quantity: 1, unit: "pack", name: "Vanillezucker" },
  ],
  ["2 dl Sahne", { quantity: 200, unit: "ml", name: "Sahne" }],
  ["ca. 100 ml Wasser", { quantity: 100, unit: "ml", name: "Wasser" }],
  [
    "etwas Butter für die Form",
    { quantity: null, name: "Butter", note: "etwas, für die Form" },
  ],
  ["Puderzucker zum Bestäuben", { name: "Puderzucker", note: "zum Bestäuben" }],
  [
    "Pfeffer nach Belieben",
    { name: "Pfeffer", note: "nach Belieben", optional: true },
  ],
  ["- 4 Eier", { quantity: 4, name: "Eier" }],
  [
    "300 g Mehl (Okonomiyaki-)",
    { quantity: 300, unit: "g", name: "Okonomiyaki-Mehl", note: null },
  ],
  [
    "Flocken ((Bonitoflocken bzw. Katsuoboshi), Fischflocken)",
    {
      name: "Bonitoflocken",
      note: "(Bonitoflocken bzw. Katsuoboshi), Fischflocken",
    },
  ],
  [
    "Algen (Seetang (Aonori), getrocknet)",
    { name: "Algen", note: "Seetang (Aonori), getrocknet" },
  ],
  [
    "4 Scheibe/n Speck (hauchdünn, ungeräuchert)",
    {
      quantity: 4,
      unitText: "Scheibe",
      name: "Speck",
      note: "hauchdünn, ungeräuchert",
    },
  ],
  ["n. B. Wasser", { name: "Wasser", note: "n. B.", optional: true }],
  ["1 Zwiebel/n", { quantity: 1, name: "Zwiebel" }],
  ["1 Becher Schmand", { quantity: 1, unitText: "Becher", name: "Schmand" }],
  [
    "2 cups all-purpose flour, sifted",
    { quantity: 2, unit: "cup", name: "all-purpose flour", note: "sifted" },
  ],
  ["1 tbsp olive oil", { quantity: 1, unit: "tbsp", name: "olive oil" }],
  ["3/4 cup sugar", { quantity: 0.75, unit: "cup", name: "sugar" }],
  [
    "1 (14 oz) can diced tomatoes",
    { quantity: 1, unit: "can", name: "diced tomatoes", note: "14 oz" },
  ],
  ["8 oz cream cheese", { quantity: 226.8, unit: "g", name: "cream cheese" }],
  ["1 lb ground beef", { quantity: 453.6, unit: "g", name: "ground beef" }],
  [
    "2 cloves garlic, minced",
    { quantity: 2, unitText: "cloves", name: "garlic", note: "minced" },
  ],
  ["a pinch of salt", { quantity: 1, unit: "pinch", name: "salt" }],
  ["1 large egg", { quantity: 1, name: "egg", note: "large" }],
  ["salt and pepper to taste", { name: "salt and pepper", note: "to taste" }],
  [
    "1 tsp vanilla extract (optional)",
    { quantity: 1, unit: "tsp", name: "vanilla extract", optional: true },
  ],
  ["2 to 3 carrots", { quantity: 2, quantityMax: 3, name: "carrots" }],
];

describe("parseIngredientLine", () => {
  test.each(cases)("%p", (line, expected) => {
    expect(parseIngredientLine(line)).toMatchObject(expected);
  });

  test("plain lines are confident, unclear ones are not", () => {
    expect(parseIngredientLine("200 g Mehl").confidence).toBe(1);
    expect(parseIngredientLine("Salz").confidence).toBeGreaterThanOrEqual(0.8);
    expect(parseIngredientLine("Salz und Pfeffer").confidence).toBeLessThan(
      0.8,
    );
    expect(parseIngredientLine("3 Zehen Knoblauch").confidence).toBeLessThan(
      0.8,
    );
    expect(parseIngredientLine("").confidence).toBe(0);
  });
});
