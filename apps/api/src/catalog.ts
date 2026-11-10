import { ingredient } from "@yumi/db/schema";
import { type ParsedIngredientLine, resolveMeasureWord } from "@yumi/shared";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "./db";

const MIN_SCORE = 0.3;
const MIN_MATCH_SCORE = 0.5;
// Without a prefix or substring hit, trigram overlap alone links unrelated
// names ("Okonomiyaki-Sauce" -> "Teriyakisauce" scores 0.56).
const MIN_FUZZY_MATCH_SCORE = 0.7;

export const ingredientColumns = {
  id: ingredient.id,
  key: ingredient.key,
  householdId: ingredient.householdId,
  nameDe: ingredient.nameDe,
  nameEn: ingredient.nameEn,
  synonyms: ingredient.synonyms,
  categoryId: ingredient.categoryId,
  defaultUnit: ingredient.defaultUnit,
  densityGPerMl: ingredient.densityGPerMl,
  pieceWeightG: ingredient.pieceWeightG,
  nutritionPer100g: ingredient.nutritionPer100g,
  nutritionSource: ingredient.nutritionSource,
  packSizes: ingredient.packSizes,
  icon: ingredient.icon,
};

export const visibleTo = (householdId: string) =>
  or(isNull(ingredient.householdId), eq(ingredient.householdId, householdId));

function escapeLike(text: string) {
  return text.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

async function rankIngredients(householdId: string, q: string, limit: number) {
  const lower = q.toLowerCase();
  const prefix = `${escapeLike(lower)}%`;
  // word_similarity scores the best-matching part of each name, so partial input ranks well.
  const score = sql<number>`greatest(
    word_similarity(${q}, ${ingredient.nameDe}),
    word_similarity(${q}, ${ingredient.nameEn}),
    coalesce((select max(word_similarity(${q}, s)) from unnest(${ingredient.synonyms}) s), 0)
  )`;
  const exact = sql<boolean>`(lower(${ingredient.nameDe}) = ${lower} or lower(${ingredient.nameEn}) = ${lower}
    or exists (select 1 from unnest(${ingredient.synonyms}) s where lower(s) = ${lower}))`;
  const startsWith = sql<boolean>`(lower(${ingredient.nameDe}) like ${prefix} or lower(${ingredient.nameEn}) like ${prefix}
    or exists (select 1 from unnest(${ingredient.synonyms}) s where lower(s) like ${prefix}))`;
  // A canonical name containing the query outranks a fuzzy synonym phrase:
  // "Öl" must not become "Thunfisch in Öl" just because that synonym is longer.
  const contains = sql<boolean>`(position(${lower} in lower(${ingredient.nameDe})) > 0
    or position(${lower} in lower(${ingredient.nameEn})) > 0)`;
  return db
    .select({ ...ingredientColumns, score, exact, startsWith, contains })
    .from(ingredient)
    .where(
      and(
        visibleTo(householdId),
        or(sql`${score} >= ${MIN_SCORE}`, startsWith),
      ),
    )
    .orderBy(
      sql`${exact} desc`,
      sql`${startsWith} desc`,
      sql`${contains} desc`,
      sql`${score} desc`,
      sql`length(${ingredient.nameDe})`,
    )
    .limit(limit);
}

export async function searchIngredients(
  householdId: string,
  q: string,
  limit: number,
) {
  const rows = await rankIngredients(householdId, q, limit);
  return rows.map(
    ({ score: _s, exact: _e, startsWith: _p, contains: _c, ...row }) => row,
  );
}

async function bestMatch(householdId: string, name: string, strict: boolean) {
  const [top] = await rankIngredients(householdId, name, 1);
  if (!top) return null;
  const minScore =
    top.startsWith || top.contains ? MIN_MATCH_SCORE : MIN_FUZZY_MATCH_SCORE;
  const good = strict ? top.exact : top.exact || top.score >= minScore;
  if (!good) return null;
  const { score: _s, exact, startsWith: _p, contains: _c, ...row } = top;
  const lower = name.toLowerCase();
  // "onions" -> "Onion" is a plural ending, not a guess.
  const inflected = [row.nameDe, row.nameEn, ...row.synonyms].some((known) => {
    const base = known?.toLowerCase();
    return base && lower.startsWith(base) && lower.length - base.length <= 3;
  });
  return { row, confident: exact || inflected };
}

export type IngredientRow = NonNullable<
  Awaited<ReturnType<typeof bestMatch>>
>["row"];

/**
 * Links a parsed line to a catalog ingredient. A measure word joins the name
 * first ("3 Zehen Knoblauch" -> "Knoblauchzehen"), so counted parts match their own entry.
 */
export async function matchParsedLine(
  householdId: string,
  parsed: ParsedIngredientLine,
): Promise<
  ParsedIngredientLine & {
    ingredient: IngredientRow | null;
    /** false for fuzzy links, which deserve a second look */
    confidentMatch: boolean;
  }
> {
  if (!parsed.name)
    return { ...parsed, ingredient: null, confidentMatch: false };
  if (parsed.unitText) {
    const measure = parsed.unitText.toLowerCase().replace(/\.$/, "");
    for (const candidate of [
      `${parsed.name}${measure}`,
      `${parsed.name} ${measure}`,
    ]) {
      const match = await bestMatch(householdId, candidate, true);
      if (match) {
        return {
          ...parsed,
          unit: "pcs",
          unitText: null,
          ingredient: match.row,
          confidentMatch: true,
        };
      }
    }
  }
  // No counted part matched, so a measure word may still name a unit ("Becher").
  const resolved = resolveMeasureWord(parsed);
  const match = await bestMatch(householdId, resolved.name, false);
  if (match)
    return {
      ...resolved,
      ingredient: match.row,
      confidentMatch: match.confident,
    };
  // "Salz und Pfeffer" falls back to its first item, as an unconfident link.
  const first = resolved.name.split(/\s+(?:und|and|oder|or|&)\s+|\s*\/\s*/i)[0];
  const fallback =
    first && first !== resolved.name
      ? await bestMatch(householdId, first, false)
      : null;
  return {
    ...resolved,
    ingredient: fallback?.row ?? null,
    confidentMatch: false,
  };
}
