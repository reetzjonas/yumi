import { parseIngredientLine, recipeInputSchema } from "@yumi/shared";
import { RecipeExtractionError, RecipeImportError } from "./errors";
import {
  cleanText,
  decodeEntities,
  type HtmlNode,
  nodes,
  nodeText,
  parseHtml,
} from "./html";
import { validateImportUrl } from "./transport";

type Data = Record<string, unknown>;

export type RecipeImportDraft = ReturnType<typeof recipeInputSchema.parse>;

export interface ExtractedRecipe {
  draft: RecipeImportDraft;
  method: "jsonld" | "microdata";
  sourceUrl: string;
  /** Not fetched until it has passed the same URL/DNS/redirect policy. */
  imageUrl: string | null;
}

function object(value: unknown): Data | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Data)
    : null;
}

function values(value: unknown): unknown[] {
  return value === undefined || value === null
    ? []
    : Array.isArray(value)
      ? value
      : [value];
}

function text(value: unknown, depth = 0): string {
  if (depth > 32) throw new RecipeImportError("invalid_recipe");
  if (typeof value === "string") return cleanText(value);
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((entry) => text(entry, depth + 1))
      .filter(Boolean)
      .join(", ");
  }
  const data = object(value);
  return data ? text(data["@value"] ?? data.text ?? data.name, depth + 1) : "";
}

function isType(value: unknown, type: string): boolean {
  return values(value).some(
    (entry) =>
      typeof entry === "string" &&
      entry.replace(/^https?:\/\/schema.org\//, "") === type,
  );
}

/** Calendar years/months have no unambiguous minute value. */
export function durationMinutes(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value
    .trim()
    .match(
      /^P(?:(\d+(?:[.,]\d+)?)W)?(?:(\d+(?:[.,]\d+)?)D)?(?:T(?:(\d+(?:[.,]\d+)?)H)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)S)?)?$/i,
    );
  if (!match?.slice(1).some(Boolean) || /T$/i.test(value.trim())) return null;
  const [weeks = 0, days = 0, hours = 0, minutes = 0, seconds = 0] = match
    .slice(1)
    .map((part) => Number(part?.replace(",", ".") ?? 0));
  const result = Math.ceil(
    weeks * 10_080 + days * 1440 + hours * 60 + minutes + seconds / 60,
  );
  return result <= 10_000 ? result : null;
}

function servings(value: unknown): number {
  for (const entry of values(value)) {
    const numeric =
      typeof entry === "number"
        ? entry
        : Number(
            text(entry)
              .match(/\d+(?:[.,]\d+)?/)?.[0]
              ?.replace(",", "."),
          );
    if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 100)
      return numeric;
  }
  return 2;
}

function steps(value: unknown, depth = 0): { text: string }[] {
  if (depth > 32) throw new RecipeImportError("invalid_recipe");
  return values(value).flatMap((entry) => {
    const data = object(entry);
    if (data) {
      if (isType(data["@type"], "HowToSection") || data.itemListElement) {
        const title = text(data.name);
        const children = steps(data.itemListElement ?? data.steps, depth + 1);
        return title ? [{ text: title }, ...children] : children;
      }
      const value = text(data.text ?? data.name);
      return value ? [{ text: value }] : [];
    }
    if (typeof entry !== "string") return [];
    // Plain string instructions often contain paragraphs or numbered lines.
    return entry
      .split(/(?:\r?\n)+|<\/(?:p|li)>|<br\s*\/?>/i)
      .map(cleanText)
      .filter(Boolean)
      .map((text) => ({ text }));
  });
}

function image(
  value: unknown,
  sourceUrl: string,
  ids: ReadonlyMap<string, Data>,
): string | null {
  for (const entry of values(value)) {
    const reference = object(entry)?.["@id"];
    const data =
      (typeof reference === "string" ? ids.get(reference) : undefined) ??
      object(entry);
    const candidate =
      typeof entry === "string" ? entry : (data?.contentUrl ?? data?.url);
    if (typeof candidate !== "string" || !candidate.trim()) continue;
    try {
      return new URL(decodeEntities(candidate), sourceUrl).href;
    } catch {
      // Another image candidate can still be usable.
    }
  }
  return null;
}

function mapRecipe(
  data: Data,
  method: ExtractedRecipe["method"],
  sourceUrl: string,
  ids: ReadonlyMap<string, Data> = new Map(),
): ExtractedRecipe | null {
  const title = text(data.name);
  if (!title) return null;
  const lines = values(data.recipeIngredient)
    .flatMap((value) =>
      typeof value === "string" ? value.split(/\r?\n/) : [text(value)],
    )
    .map(cleanText)
    .filter(Boolean);
  const ingredients = lines.map((rawText) => {
    const parsed = parseIngredientLine(rawText);
    return {
      rawText,
      quantity: parsed.quantity,
      unit: parsed.unit,
      ingredientId: null,
      section: null,
      note: parsed.note,
      optional: parsed.optional,
    };
  });
  const parsed = recipeInputSchema.safeParse({
    title,
    description: text(data.description) || null,
    servings: servings(data.recipeYield),
    prepMinutes: durationMinutes(data.prepTime),
    cookMinutes: durationMinutes(data.cookTime),
    sourceUrl,
    ingredients,
    steps: steps(data.recipeInstructions),
    tags: [],
  });
  return parsed.success
    ? {
        draft: parsed.data,
        method,
        sourceUrl,
        imageUrl: image(data.image, sourceUrl, ids),
      }
    : null;
}

function jsonRecipes(root: HtmlNode) {
  const recipes: Data[] = [];
  const ids = new Map<string, Data>();
  for (const node of nodes(root)) {
    if (
      node.tag !== "script" ||
      node.attrs.type?.split(";")[0]?.trim().toLowerCase() !==
        "application/ld+json"
    )
      continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(nodeText(node).replace(/^\s*<!--|-->\s*$/g, ""));
    } catch {
      continue;
    }
    const pending = [parsed];
    let count = 0;
    while (pending.length && ++count <= 50_000) {
      const current = pending.pop();
      if (Array.isArray(current)) {
        for (let index = current.length - 1; index >= 0; index--)
          pending.push(current[index]);
      } else {
        const data = object(current);
        if (!data) continue;
        if (isType(data["@type"], "Recipe")) recipes.push(data);
        const id = data["@id"];
        if (typeof id === "string" && Object.keys(data).length > 1)
          ids.set(id, data);
        const children = Object.values(data);
        for (let index = children.length - 1; index >= 0; index--) {
          if (children[index] && typeof children[index] === "object")
            pending.push(children[index]);
        }
      }
    }
  }
  return { recipes, ids };
}

function microdata(node: HtmlNode, depth = 0): Data {
  if (depth > 32) throw new RecipeImportError("invalid_recipe");
  const result: Data = { "@type": node.attrs.itemtype?.split(/\s+/) };
  const pending = [...node.children].reverse();
  while (pending.length) {
    const child = pending.pop();
    if (!child || typeof child === "string") continue;
    const names = child.attrs.itemprop?.split(/\s+/).filter(Boolean) ?? [];
    if (names.length) {
      const value =
        "itemscope" in child.attrs
          ? microdata(child, depth + 1)
          : decodeEntities(
              child.attrs.content ??
                child.attrs.datetime ??
                child.attrs.src ??
                child.attrs.href ??
                nodeText(child),
            );
      for (const name of names) {
        const prior = result[name];
        result[name] = prior === undefined ? value : [...values(prior), value];
      }
    }
    // Properties belong only to their nearest itemscope.
    if (!("itemscope" in child.attrs))
      pending.push(...[...child.children].reverse());
  }
  return result;
}

export function extractRecipe(html: string, inputUrl: string): ExtractedRecipe {
  const sourceUrl = validateImportUrl(inputUrl).href;
  if (Buffer.byteLength(html) > 2 * 1024 * 1024)
    throw new RecipeImportError("response_too_large");
  const root = parseHtml(html);
  const pageImage = image(
    nodes(root).find(
      (node) =>
        node.tag === "meta" &&
        node.attrs.property?.toLowerCase() === "og:image" &&
        node.attrs.content,
    )?.attrs.content,
    sourceUrl,
    new Map(),
  );
  const withImage = (result: ExtractedRecipe) => ({
    ...result,
    imageUrl: result.imageUrl ?? pageImage,
  });
  let found = false;
  const { recipes, ids } = jsonRecipes(root);
  for (const data of recipes) {
    found = true;
    try {
      const result = mapRecipe(data, "jsonld", sourceUrl, ids);
      if (result) return withImage(result);
    } catch (error) {
      if (
        !(error instanceof RecipeImportError) ||
        error.code !== "invalid_recipe"
      )
        throw error;
    }
  }
  for (const node of nodes(root)) {
    if (
      !("itemscope" in node.attrs) ||
      !isType(node.attrs.itemtype?.split(/\s+/), "Recipe")
    )
      continue;
    found = true;
    try {
      const result = mapRecipe(microdata(node), "microdata", sourceUrl);
      if (result) return withImage(result);
    } catch (error) {
      if (
        !(error instanceof RecipeImportError) ||
        error.code !== "invalid_recipe"
      )
        throw error;
    }
  }
  throw new RecipeExtractionError(
    found ? "invalid_recipe" : "no_recipe",
    sourceUrl,
    cleanText(nodeText(root, true)),
  );
}
