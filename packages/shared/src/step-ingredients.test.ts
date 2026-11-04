import { describe, expect, test } from "bun:test";
import { matchStepIngredientPositions } from "./step-ingredients";

describe("matchStepIngredientPositions", () => {
  test.each([
    ["Zwiebeln schneiden.", "1 Zwiebel", [0]],
    ["Die Zwiebel schneiden.", "2 Zwiebeln", [0]],
    ["Add the onions.", "1 onion", [0]],
    ["Whisk the eggs.", "1 egg", [0]],
    ["Add berries and tomatoes.", "200 g berry", [0]],
    ["Add the tomato.", "2 tomatoes", [0]],
    ["Frischen Kräutern zugeben.", "10 g frische Kräuter", [0]],
    ["Eier verquirlen.", "1 Ei", [0]],
    ["Mehl sieben.", "250 g Mehl, gesiebt", [0]],
    ["Mit Salz abschmecken.", "Salz nach Geschmack", [0]],
    ["Semmelmehl dazugeben.", "250 g Mehl", []],
    ["Den Reisenden bedienen.", "100 g Reis", []],
    ["Alles salzen.", "1 TL Salz", []],
    ["Butter einrühren.", "1 Ei", []],
    ["Rote Paprika würfeln.", "1 grüne Paprika", []],
    ["Ohne Öl braten.", "2 EL Sesamöl", []],
  ])("matches complete names in %s", (text, rawText, expected) => {
    expect(matchStepIngredientPositions(text, [{ rawText }])).toEqual(expected);
  });

  test("matches catalog translations and raw names once per ingredient in recipe order", () => {
    const ingredients = [
      { rawText: "1 Knolle", nameDe: "Zwiebel", nameEn: "onion" },
      { rawText: "200 g Mehl, gesiebt" },
      { rawText: "1 EL Öl" },
    ];

    expect(
      matchStepIngredientPositions(
        "Die Zwiebeln mit Mehl mischen, then add the onions.",
        ingredients,
      ),
    ).toEqual([0, 1]);
  });
});
