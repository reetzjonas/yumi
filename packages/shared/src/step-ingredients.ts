import { parseIngredientLine } from "./ingredient-line";

export type StepIngredient = {
  readonly rawText: string;
  readonly nameDe?: string | null;
  readonly nameEn?: string | null;
};

function words(text: string) {
  return (
    text
      .normalize("NFC")
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

function plural(word: string, language: "de" | "en") {
  if (language === "de") {
    if (word === "ei") return "eier";
    if (word.length < 4) return word;
    if (/(?:e|el|er)$/.test(word)) return `${word}n`;
    if (/(?:ung|ei)$/.test(word)) return `${word}en`;
    return word;
  }
  if (word.length < 3) return word;
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}${/(?:s|x|z|ch|sh|tomato|potato)$/.test(word) ? "es" : "s"}`;
}

function mentions(
  text: readonly string[],
  name: string,
  language: "de" | "en",
) {
  const phrase = words(name);
  if (phrase.length === 0) return false;
  return text.some((_, start) =>
    phrase.every((word, offset) => {
      const actual = text[start + offset];
      if (actual === word) return true;
      if (language === "de" && offset < phrase.length - 1) {
        return (
          actual !== undefined &&
          ((word.endsWith("e") &&
            /^[nrsm]$/.test(actual.slice(word.length)) &&
            actual.startsWith(word)) ||
            (actual.endsWith("e") &&
              /^[nrsm]$/.test(word.slice(actual.length)) &&
              word.startsWith(actual)))
        );
      }
      // Only inflect the noun at the end of a complete name, never a substring.
      return (
        offset === phrase.length - 1 &&
        actual !== undefined &&
        (plural(word, language) === actual || plural(actual, language) === word)
      );
    }),
  );
}

/** Match complete catalog/raw names conservatively; explicit edits override this. */
export function matchStepIngredientPositions(
  text: string,
  ingredients: readonly StepIngredient[],
): number[] {
  const tokens = words(text);
  return ingredients.flatMap((line, position) => {
    const rawName = parseIngredientLine(line.rawText).name;
    const matched =
      (line.nameDe && mentions(tokens, line.nameDe, "de")) ||
      (line.nameEn && mentions(tokens, line.nameEn, "en")) ||
      mentions(tokens, rawName, "de") ||
      mentions(tokens, rawName, "en");
    return matched ? [position] : [];
  });
}
