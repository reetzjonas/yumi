import { describe, expect, test } from "bun:test";
import { parseRecipeText } from "./text";

describe("parseRecipeText", () => {
  test("reads a recipe with German headings", () => {
    const draft = parseRecipeText(`Linsen-Dal

Cremig und schnell. Für 4 Personen.

Zutaten:
- 200 g rote Linsen
- 1 Zwiebel
- Salz

Zubereitung
1. Zwiebel hacken und anbraten.
2. Linsen zugeben, 20 Minuten köcheln.`);
    expect(draft?.title).toBe("Linsen-Dal");
    expect(draft?.servings).toBe(4);
    expect(draft?.description).toBe("Cremig und schnell. Für 4 Personen.");
    expect(draft?.ingredients.map((line) => line.rawText)).toEqual([
      "200 g rote Linsen",
      "1 Zwiebel",
      "Salz",
    ]);
    expect(draft?.steps.map((step) => step.text)).toEqual([
      "Zwiebel hacken und anbraten.",
      "Linsen zugeben, 20 Minuten köcheln.",
    ]);
  });

  test("without headings, lines starting with an amount are ingredients", () => {
    const draft = parseRecipeText(`Pancakes
250 g flour
2 eggs
500 ml milk
Whisk everything into a smooth batter.
Fry thin pancakes in a hot pan.`);
    expect(draft?.title).toBe("Pancakes");
    expect(draft?.servings).toBe(2);
    expect(draft?.ingredients).toHaveLength(3);
    expect(draft?.steps).toHaveLength(2);
  });

  test("text without ingredients or steps is no recipe", () => {
    expect(parseRecipeText("Just a note\nwithout anything to cook")).toBeNull();
    expect(parseRecipeText("Title\n200 g flour\n2 eggs")).toBeNull();
    expect(parseRecipeText("   ")).toBeNull();
  });
});
