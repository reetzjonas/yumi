import { describe, expect, test } from "bun:test";
import { expectedPackLeftover, rankReuseRecipes } from "./leftovers";
import type { ConversionFactors, Unit } from "./units";

const pack = (quantity: number, unit: Unit) => ({ quantity, unit });

describe("expectedPackLeftover", () => {
  test.each<
    [
      string,
      number,
      Unit,
      readonly { quantity: number; unit: Unit }[],
      number,
      ConversionFactors,
    ]
  >([
    ["converts units", 0.7, "kg", [pack(500, "g")], 0.3, {}],
    [
      "chooses minimal purchase over smallest pack",
      700,
      "g",
      [pack(300, "g"), pack(400, "g"), pack(1000, "g")],
      100,
      {},
    ],
    ["uses density", 300, "g", [pack(200, "ml")], 100, { densityGPerMl: 2 }],
    [
      "uses piece weight",
      250,
      "g",
      [pack(2, "pcs")],
      150,
      { pieceWeightG: 100 },
    ],
    [
      "ignores incompatible packs",
      100,
      "g",
      [pack(1, "pack"), pack(125, "g")],
      25,
      {},
    ],
    ["has no compatible pack", 100, "g", [pack(200, "ml")], 0, {}],
    ["has no pack sizes", 100, "g", [], 0, {}],
    ["has exact whole packs", 600, "g", [pack(200, "g")], 0, {}],
    [
      "tolerates floating point noise",
      0.1 + 0.2,
      "l",
      [pack(100, "ml")],
      0,
      {},
    ],
    [
      "ignores invalid pack sizes",
      100,
      "g",
      [
        pack(0, "g"),
        pack(-1, "g"),
        pack(Number.NaN, "g"),
        pack(Number.POSITIVE_INFINITY, "g"),
        pack(120, "g"),
      ],
      20,
      {},
    ],
  ])("%s", (_name, quantity, unit, packs, expected, factors) => {
    expect(expectedPackLeftover(quantity, unit, packs, factors)).toBeCloseTo(
      expected,
      10,
    );
  });

  test.each([0, -10, Number.NaN, Number.POSITIVE_INFINITY])(
    "returns zero for invalid need %p",
    (quantity) => {
      expect(expectedPackLeftover(quantity, "g", [pack(200, "g")])).toBe(0);
    },
  );
});

describe("rankReuseRecipes", () => {
  test.each<[string, readonly number[], number]>([
    ["partial consumption", [25], 0.25],
    ["full consumption", [100], 1],
    ["excess consumption capped", [150], 1],
    ["duplicate lines combined before capping", [75, 75], 1],
    ["duplicate partial lines added", [20, 30], 0.5],
  ])("%s", (_name, quantities, expected) => {
    const recipes = [
      {
        id: "recipe",
        ingredients: quantities.map((quantity) => ({
          ingredientId: "cream",
          quantity,
          unit: "ml" as const,
        })),
      },
    ];

    const result = rankReuseRecipes(
      recipes,
      [{ ingredientId: "cream", quantity: 100, unit: "ml" }],
      [],
      [],
    );

    expect(result).toEqual([
      { id: "recipe", leftoverCoverage: expected, overlap: 0 },
    ]);
  });

  test("combines converted duplicates using leftover factors and sums leftover fractions", () => {
    const recipes = [
      {
        id: "recipe",
        ingredients: [
          {
            ingredientId: "cream",
            quantity: 0.05,
            unit: "l",
            factors: { densityGPerMl: 9 },
          },
          { ingredientId: "cream", quantity: 100, unit: "g" },
          { ingredientId: "onion", quantity: 1, unit: "pcs" },
        ],
      },
    ] as const;
    const leftovers = [
      {
        ingredientId: "cream",
        quantity: 200,
        unit: "ml",
        factors: { densityGPerMl: 2 },
      },
      {
        ingredientId: "onion",
        quantity: 100,
        unit: "g",
        factors: { pieceWeightG: 100 },
      },
    ] as const;

    expect(rankReuseRecipes(recipes, leftovers, [], [])).toEqual([
      { id: "recipe", leftoverCoverage: 1.5, overlap: 0 },
    ]);
  });

  test("unknown or missing quantities and units do not contribute consumption", () => {
    const recipes = [
      {
        id: "recipe",
        ingredients: [
          {
            ingredientId: "cream",
            quantity: 100,
            unit: "g",
            factors: { densityGPerMl: 2 },
          },
          { ingredientId: "cream", quantity: null, unit: "ml" },
          { ingredientId: "cream", quantity: 100, unit: null },
        ],
      },
    ] as const;

    expect(
      rankReuseRecipes(
        recipes,
        [{ ingredientId: "cream", quantity: 100, unit: "ml" }],
        ["cream"],
        [],
      ),
    ).toEqual([{ id: "recipe", leftoverCoverage: 0, overlap: 1 }]);
  });

  test("excludes staples from coverage and both Jaccard sets, deduplicating IDs", () => {
    const recipes = [
      {
        id: "recipe",
        ingredients: [
          { ingredientId: "salt", quantity: 100, unit: "g" },
          { ingredientId: "cream", quantity: 10, unit: "ml" },
          { ingredientId: "cream", quantity: 10, unit: "ml" },
          { ingredientId: "onion", quantity: null, unit: null },
        ],
      },
    ] as const;
    const leftovers = [
      { ingredientId: "salt", quantity: 100, unit: "g" },
      { ingredientId: "cream", quantity: 100, unit: "ml" },
    ] as const;

    const result = rankReuseRecipes(
      recipes,
      leftovers,
      ["salt", "cream", "cream", "carrot"],
      ["salt"],
    );

    expect(result).toEqual([
      { id: "recipe", leftoverCoverage: 0.2, overlap: 1 / 3 },
    ]);
  });

  test("orders by coverage, then overlap, preserving input order for equal scores", () => {
    const recipes = [
      {
        id: "tie-first",
        ingredients: [{ ingredientId: "onion", quantity: 1, unit: "g" }],
      },
      {
        id: "overlap",
        ingredients: [{ ingredientId: "cream", quantity: 50, unit: "ml" }],
      },
      {
        id: "coverage",
        ingredients: [{ ingredientId: "carrot", quantity: 100, unit: "g" }],
      },
      {
        id: "tie-second",
        ingredients: [{ ingredientId: "onion", quantity: 1, unit: "g" }],
      },
      {
        id: "half",
        ingredients: [{ ingredientId: "carrot", quantity: 50, unit: "g" }],
      },
    ] as const;
    const leftovers = [
      { ingredientId: "cream", quantity: 100, unit: "ml" },
      { ingredientId: "carrot", quantity: 100, unit: "g" },
    ] as const;

    expect(rankReuseRecipes(recipes, leftovers, ["cream"], [])).toEqual([
      { id: "coverage", leftoverCoverage: 1, overlap: 0 },
      { id: "overlap", leftoverCoverage: 0.5, overlap: 1 },
      { id: "half", leftoverCoverage: 0.5, overlap: 0 },
      { id: "tie-first", leftoverCoverage: 0, overlap: 0 },
      { id: "tie-second", leftoverCoverage: 0, overlap: 0 },
    ]);
  });

  test.each([{ queued: [] }, { queued: ["salt"] }])(
    "empty effective sets score zero with queue $queued",
    ({ queued }) => {
      expect(
        rankReuseRecipes(
          [
            { id: "empty", ingredients: [] },
            {
              id: "staple",
              ingredients: [{ ingredientId: "salt", quantity: 1, unit: "g" }],
            },
          ],
          [],
          queued,
          ["salt"],
        ),
      ).toEqual([
        { id: "empty", leftoverCoverage: 0, overlap: 0 },
        { id: "staple", leftoverCoverage: 0, overlap: 0 },
      ]);
    },
  );
});
