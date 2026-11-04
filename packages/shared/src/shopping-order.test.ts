import { expect, test } from "bun:test";
import {
  type LearnedShoppingOrder,
  learnShoppingOrder,
  type ShoppingOrderEvent,
  sortShoppingItems,
} from "./shopping-order";

const event = (
  id: string,
  ingredientId: string | null,
  clientTs: number,
): ShoppingOrderEvent => ({
  id,
  listId: "list",
  storeId: "store",
  itemId: id,
  ingredientId,
  categoryId: "produce",
  clientTs,
});

test.each([
  [30 * 60_000 - 1, 1, 0],
  [30 * 60_000, 2, 0.5],
  [30 * 60_000 + 1, 2, 0.5],
])(
  "a gap of %i ms produces %i ingredient samples",
  (gap, sampleCount, score) => {
    const events = [
      event("1", "apple", 0),
      event("2", "bread", 1),
      event("3", "bread", 1 + gap),
      event("4", "apple", 2 + gap),
    ];

    const learned = learnShoppingOrder(events);

    expect(learned.ingredients).toEqual([
      { id: "apple", score, sampleCount },
      { id: "bread", score: 1 - score, sampleCount },
    ]);
  },
);

test.each(["listId", "storeId"] as const)(
  "events from independent %s values cannot form a session",
  (field) => {
    const events = [
      event("1", "apple", 0),
      { ...event("2", "bread", 1), [field]: "other" },
    ];

    expect(learnShoppingOrder(events)).toEqual({
      ingredients: [],
      categories: [],
    });
  },
);

test("client time and then event id determine the order without mutating input", () => {
  const events = Object.freeze([
    event("z", "bread", 10),
    event("later", "milk", 20),
    event("a", "apple", 10),
  ]);

  const learned = learnShoppingOrder(events);

  expect(learned.ingredients).toEqual([
    { id: "apple", score: 0, sampleCount: 1 },
    { id: "bread", score: 0.5, sampleCount: 1 },
    { id: "milk", score: 1, sampleCount: 1 },
  ]);
});

test("repeated identities retain their first observation and free text uses item identity", () => {
  const events = [
    event("1", "apple", 0),
    { ...event("2", "apple", 1), categoryId: "ignored" },
    { ...event("3", null, 2), itemId: "free", categoryId: null },
    { ...event("4", null, 3), itemId: "free", categoryId: "ignored" },
    event("5", null, 4),
  ];

  const learned = learnShoppingOrder(events);

  expect(learned).toEqual({
    ingredients: [
      { id: "apple", score: 0, sampleCount: 1 },
      { id: "free", score: 0.5, sampleCount: 1 },
      { id: "5", score: 1, sampleCount: 1 },
    ],
    categories: [{ id: "produce", score: 0.5, sampleCount: 1 }],
  });
});

test("duplicate observations and isolated one-item sessions do not train", () => {
  const events = [
    event("1", "apple", 0),
    event("2", "apple", 1),
    event("3", "bread", 30 * 60_000 + 1),
  ];

  expect(learnShoppingOrder(events)).toEqual({
    ingredients: [],
    categories: [],
  });
});

test("recent sessions weigh one half and category means count once per session", () => {
  const sessions = [
    ["apple", "pear", "milk"],
    ["milk", "pear", "apple"],
    ["milk", "pear", "apple"],
  ];
  const events = sessions.flatMap((ingredients, session) =>
    ingredients.map((id, rank) => ({
      ...event(`${session}-${rank}`, id, session * 3_600_000 + rank),
      categoryId: id === "milk" ? "dairy" : "produce",
    })),
  );

  const learned = learnShoppingOrder(events.reverse());

  expect(learned).toEqual({
    ingredients: [
      { id: "apple", score: 0.75, sampleCount: 3 },
      { id: "pear", score: 0.5, sampleCount: 3 },
      { id: "milk", score: 0.25, sampleCount: 3 },
    ],
    categories: [
      { id: "produce", score: 0.625, sampleCount: 3 },
      { id: "dairy", score: 0.25, sampleCount: 3 },
    ],
  });
});

const categories = Object.freeze([
  { id: "frozen", defaultPosition: 90 },
  { id: "produce", defaultPosition: 10 },
  { id: "dairy", defaultPosition: 40 },
]);
const item = (id: string, categoryId: string | null) => ({
  id,
  ingredientId: id,
  categoryId,
  checked: false,
});
const learned: LearnedShoppingOrder = {
  ingredients: [
    { id: "established", score: 0.1, sampleCount: 2 },
    { id: "new", score: 0, sampleCount: 1 },
  ],
  categories: [{ id: "dairy", score: 0.8, sampleCount: 1 }],
};

test.each([
  { manualOrder: null },
  { manualOrder: undefined },
  { manualOrder: [] },
])(
  "without a manual order, scores fall through ingredient, category and normalized default",
  ({ manualOrder }) => {
    const items = Object.freeze([
      item("unknown", null),
      item("new", "dairy"),
      item("default-middle", "dairy-removed"),
      item("established", "frozen"),
      item("default-first", "produce"),
      { ...item("category-only", "dairy"), ingredientId: null },
    ]);

    const sorted = sortShoppingItems(items, categories, manualOrder, learned);

    expect(sorted.map(({ id }) => id)).toEqual([
      "default-first",
      "established",
      "new",
      "category-only",
      "unknown",
      "default-middle",
    ]);
  },
);

test("default category ranks share the normalized scale with learned scores", () => {
  const items = [
    item("default-middle", "dairy"),
    item("learned", "produce"),
    item("default-last", "frozen"),
  ];
  const scores: LearnedShoppingOrder = {
    ingredients: [{ id: "learned", score: 0.75, sampleCount: 2 }],
    categories: [],
  };

  expect(
    sortShoppingItems(items, categories, null, scores).map(({ id }) => id),
  ).toEqual(["default-middle", "learned", "default-last"]);
});

test("manual partial order overrides learning and unlisted categories follow defaults", () => {
  const items = [
    item("new", "dairy"),
    item("produce", "produce"),
    item("established", "frozen"),
  ];

  const sorted = sortShoppingItems(items, categories, ["dairy"], learned);

  expect(sorted.map(({ id }) => id)).toEqual(["new", "produce", "established"]);
});

test("checked items come last while score ties preserve input order", () => {
  const items = [
    { ...item("checked-first", "produce"), checked: true },
    item("tie-first", "dairy"),
    item("tie-second", "dairy"),
    item("unchecked-first", "produce"),
    { ...item("checked-second", "produce"), checked: true },
  ];

  const sorted = sortShoppingItems(items, categories, null, learned);

  expect(sorted.map(({ id }) => id)).toEqual([
    "unchecked-first",
    "tie-first",
    "tie-second",
    "checked-first",
    "checked-second",
  ]);
});

test("empty and single-category catalogs sort without invalid scores", () => {
  const items = [item("unknown", null), item("known", "produce")];
  const scores: LearnedShoppingOrder = { ingredients: [], categories: [] };

  expect(sortShoppingItems(items, [], null, scores)).toEqual(items);
  expect(
    sortShoppingItems(
      items,
      [{ id: "produce", defaultPosition: 40 }],
      null,
      scores,
    ).map(({ id }) => id),
  ).toEqual(["known", "unknown"]);
});
