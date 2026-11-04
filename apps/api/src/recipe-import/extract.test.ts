import { describe, expect, test } from "bun:test";
import { recipeInputSchema } from "@yumi/shared";
import { RecipeImportError } from "./errors";
import { durationMinutes, extractRecipe } from "./extract";
import { readableText } from "./html";

const fixture = (name: string) =>
  Bun.file(new URL(`fixtures/${name}.html`, import.meta.url)).text();
const source = "https://recipes.example/recipes/soup";

describe("structured recipe extraction", () => {
  test("maps a Chefkoch-style recipe and parses ingredients without saving", async () => {
    const result = extractRecipe(await fixture("chefkoch"), source);
    expect(result.method).toBe("jsonld");
    expect(result.imageUrl).toBe("https://recipes.example/images/soup.jpg");
    expect(result.draft).toMatchObject({
      title: "Kartoffelsuppe & Brot",
      description: "Eine einfache Suppe.",
      servings: 4,
      prepMinutes: 15,
      cookMinutes: 65,
      sourceUrl: source,
      ingredients: [
        {
          rawText: "500 g Kartoffeln, geschält",
          quantity: 500,
          unit: "g",
          ingredientId: null,
          note: "geschält",
        },
        { quantity: 1.5 },
        { quantity: null },
      ],
      steps: [
        { text: "Kartoffeln schälen." },
        { text: "Kochen & abschmecken." },
      ],
    });
    expect(recipeInputSchema.safeParse(result.draft).success).toBe(true);
  });

  test.each([
    [
      "an @id reference to an ImageObject in the graph",
      `<script type="application/ld+json">${JSON.stringify({
        "@graph": [
          {
            "@type": "Recipe",
            name: "Curry",
            image: { "@id": `${source}#primaryimage` },
          },
          {
            "@type": "ImageObject",
            "@id": `${source}#primaryimage`,
            url: "https://img.example/curry.jpg",
          },
        ],
      })}</script>`,
      "https://img.example/curry.jpg",
    ],
    [
      "the page's og:image when the recipe names none",
      `<meta property="og:image" content="https://img.example/og.jpg"><script type="application/ld+json">{"@type":"Recipe","name":"Curry"}</script>`,
      "https://img.example/og.jpg",
    ],
    [
      "the recipe image before the page's og:image",
      `<meta property="og:image" content="https://img.example/og.jpg"><script type="application/ld+json">{"@type":"Recipe","name":"Curry","image":"https://img.example/own.jpg"}</script>`,
      "https://img.example/own.jpg",
    ],
  ])("selects %s as the image", (_case, html, expected) => {
    expect(extractRecipe(html, source).imageUrl).toBe(expected);
  });

  test("drops a lone section heading from the cooking steps", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "Recipe",
      name: "Curryrahm-Nudeln mit Hackfleisch",
      recipeIngredient: ["500 g Nudeln"],
      recipeInstructions: [
        {
          "@type": "HowToSection",
          name: "Zubereitung",
          itemListElement: [
            { "@type": "HowToStep", text: "Nudeln kochen." },
            { "@type": "HowToStep", text: "Hackfleisch anbraten." },
          ],
        },
      ],
    })}</script>`;
    expect(extractRecipe(html, source).draft.steps).toEqual([
      { text: "Nudeln kochen.", ingredientPositions: null },
      { text: "Hackfleisch anbraten.", ingredientPositions: null },
    ]);
  });

  test("finds arrays and graphs after malformed JSON-LD and preserves section titles", async () => {
    const result = extractRecipe(await fixture("bbc-graph"), source);
    expect(result.draft.servings).toBe(6);
    expect(result.draft.prepMinutes).toBe(31);
    expect(result.imageUrl).toBe("https://images.example/pie.webp");
    expect(result.draft.steps).toEqual([
      { text: "For the pastry", ingredientPositions: null },
      { text: "Mix the flour.", ingredientPositions: null },
      { text: "Chill.", ingredientPositions: null },
      { text: "For the filling", ingredientPositions: null },
      { text: "Fill and bake.", ingredientPositions: null },
    ]);
  });

  test("falls back to scoped microdata with nested HowToSection/Step", async () => {
    const result = extractRecipe(await fixture("microdata"), source);
    expect(result.method).toBe("microdata");
    expect(result.draft).toMatchObject({
      title: "Nudelgratin & Käse",
      description: "Ein schnelles Abendessen.",
      servings: 3,
      prepMinutes: 10,
      cookMinutes: 35,
      ingredients: [{ quantity: 250 }, { rawText: "100 g Käse" }],
      steps: [{ text: "Nudeln kochen." }, { text: "Mit Käse backen." }],
    });
    expect(result.imageUrl).toBe("https://recipes.example/gratin.png");
    expect(recipeInputSchema.safeParse(result.draft).success).toBe(true);
  });

  test("uses microdata when a JSON-LD Recipe cannot meet the draft contract", async () => {
    const invalid = `<script type="application/ld+json">${JSON.stringify({ "@type": "Recipe", name: "x".repeat(201) })}</script>`;
    expect(
      extractRecipe(invalid + (await fixture("microdata")), source).method,
    ).toBe("microdata");
  });

  test("splits plain paragraph instructions and handles numeric yield", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "Recipe",
      name: "Simple",
      recipeYield: 8,
      recipeInstructions: "<p>Mix &amp; stir.</p><p>Bake.</p>\nServe.",
      image: ["", { contentUrl: "/cover.jpg" }],
    })}</script>`;
    const result = extractRecipe(html, source);
    expect(result.draft.servings).toBe(8);
    expect(result.draft.steps).toEqual([
      { text: "Mix & stir.", ingredientPositions: null },
      { text: "Bake.", ingredientPositions: null },
      { text: "Serve.", ingredientPositions: null },
    ]);
    expect(result.imageUrl).toBe("https://recipes.example/cover.jpg");
  });

  test.each([
    ["<script type='application/ld+json'>{broken</script>", "no_recipe"],
    [
      '<script type=\'application/ld+json\'>{"@type":"Recipe"}</script>',
      "invalid_recipe",
    ],
    ["<h1>Recipe text without structured data</h1>", "no_recipe"],
  ])("rejects unusable structured data: %s", (html, code) => {
    try {
      extractRecipe(html, source);
      throw new Error("expected import error");
    } catch (error) {
      expect(error).toBeInstanceOf(RecipeImportError);
      expect(error).toMatchObject({ code });
    }
  });

  test("rejects fields exceeding the editable recipe limits", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({ "@type": "Recipe", name: "Huge", recipeIngredient: Array(201).fill("Salt") })}</script>`;
    expect(() => extractRecipe(html, source)).toThrow("invalid_recipe");
  });

  test("readable text removes scripts, navigation and hidden content", () => {
    expect(
      readableText(
        "<nav>Menu</nav><script>bad()</script><style>h1{}</style><main><h1>Soup &amp; bread</h1><p>200&#32;g flour</p><i hidden>Hidden</i></main>",
      ),
    ).toBe("Soup & bread 200 g flour");
  });

  test("handles omitted HTML end tags without merging microdata ingredients", () => {
    const result = extractRecipe(
      '<article itemscope itemtype="https://schema.org/Recipe"><h1 itemprop="name">Soup</h1><ul><li itemprop="recipeIngredient">200 g flour<li itemprop="recipeIngredient">100 g butter</ul><p itemprop="recipeInstructions">Mix<p itemprop="recipeInstructions">Bake</article>',
      source,
    );
    expect(result.draft.ingredients.map((line) => line.rawText)).toEqual([
      "200 g flour",
      "100 g butter",
    ]);
    expect(result.draft.steps).toEqual([
      { text: "Mix", ingredientPositions: null },
      { text: "Bake", ingredientPositions: null },
    ]);
  });

  test("rejects excessively nested structured fields with a typed extraction error", () => {
    let name: unknown = "Soup";
    for (let index = 0; index < 100; index++) name = [name];
    const html = `<h1>Soup</h1><script type="application/ld+json">${JSON.stringify({ "@type": "Recipe", name })}</script>`;
    expect(() => extractRecipe(html, source)).toThrow("invalid_recipe");
  });
});

describe("ISO 8601 duration", () => {
  test.each([
    ["PT1H30M", 90],
    ["PT45S", 1],
    ["P1DT2H", 1560],
    ["PT0S", 0],
    ["PT1.5H", 90],
    ["PT1,5H", 90],
    ["P1W", null],
    ["P1M", null],
    ["P1Y", null],
    ["P", null],
    ["PT", null],
    ["P1DT", null],
    ["10 minutes", null],
    ["-PT3M", null],
    ["PT10001M", null],
  ])("%s -> %s minutes", (input, expected) => {
    expect(durationMinutes(input)).toBe(expected);
  });
});
