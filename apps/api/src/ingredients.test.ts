import { describe, expect, test } from "bun:test";
import { type Client, householdMember } from "./test/client";

type Ingredient = {
  id: string;
  key: string | null;
  householdId: string | null;
  nameDe: string;
  nameEn: string;
  categoryId: string | null;
};

async function search(c: Client, q: string) {
  const res = await c.request(
    `/api/ingredients?q=${encodeURIComponent(q)}&limit=5`,
  );
  expect(res.status).toBe(200);
  return (await res.json()) as Ingredient[];
}

async function create(c: Client, body: object) {
  return c.request("/api/ingredients", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("ingredient catalog", () => {
  test("categories come in default order", async () => {
    const c = await householdMember("cat-user");
    const res = await c.request("/api/ingredients/categories");
    const rows = (await res.json()) as { key: string }[];
    expect(rows[0]?.key).toBe("produce");
    expect(rows.map((r) => r.key)).toContain("household");
  });

  test.each([
    ["Zwiebel", "onion"],
    ["zwieb", "onion"],
    ["Zwibel", "onion"],
    ["onion", "onion"],
    ["Paradeiser", "tomato"],
    ["Kartoffeln", "potato"],
    ["Öl", "vegetable-oil"],
    ["Brühe", "vegetable-stock"],
    ["Nudeln", "pasta"],
  ])("search %p ranks %p first", async (q, key) => {
    const c = await householdMember(
      `search-${key}-${q}`
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase(),
    );
    const [first] = await search(c, q);
    expect(first?.key).toBe(key);
  });

  test("LIKE wildcards in the query are literal", async () => {
    const c = await householdMember("wildcard-user");
    expect(await search(c, "%")).toEqual([]);
  });

  test("household ingredients are private to their household", async () => {
    const a = await householdMember("ing-owner");
    const b = await householdMember("ing-other");
    const res = await create(a, { nameDe: "Omas Gewürzmischung" });
    expect(res.status).toBe(201);
    const created = (await res.json()) as Ingredient;
    expect(created).toMatchObject({
      nameDe: "Omas Gewürzmischung",
      nameEn: "Omas Gewürzmischung",
      key: null,
    });

    expect((await search(a, "Gewürzmischung")).map((i) => i.id)).toContain(
      created.id,
    );
    expect((await search(b, "Gewürzmischung")).map((i) => i.id)).not.toContain(
      created.id,
    );
    expect((await b.request(`/api/ingredients/${created.id}`)).status).toBe(
      404,
    );
    const update = { nameDe: "Gestohlen" };
    expect(
      (
        await b.request(`/api/ingredients/${created.id}`, {
          method: "PUT",
          body: JSON.stringify(update),
        })
      ).status,
    ).toBe(404);
    expect(
      (await b.request(`/api/ingredients/${created.id}`, { method: "DELETE" }))
        .status,
    ).toBe(404);

    const renamed = await a.request(`/api/ingredients/${created.id}`, {
      method: "PUT",
      body: JSON.stringify({ nameDe: "Gewürzmix", nameEn: "Spice mix" }),
    });
    expect(await renamed.json()).toMatchObject({ nameEn: "Spice mix" });
    expect(
      (await a.request(`/api/ingredients/${created.id}`, { method: "DELETE" }))
        .status,
    ).toBe(204);
  });

  test("global ingredients cannot be changed by a household", async () => {
    const c = await householdMember("global-editor");
    const [onion] = await search(c, "Zwiebel");
    const res = await c.request(`/api/ingredients/${onion?.id}`, {
      method: "PUT",
      body: JSON.stringify({ nameDe: "Zwiebelchen" }),
    });
    expect(res.status).toBe(404);
  });

  test("invalid input is rejected", async () => {
    const c = await householdMember("invalid-input");
    expect((await create(c, {})).status).toBe(400);
    expect(
      (await create(c, { nameDe: "X", categoryId: crypto.randomUUID() }))
        .status,
    ).toBe(400);
    expect(
      (await create(c, { nameDe: "X", defaultUnit: "bucket" })).status,
    ).toBe(400);
  });

  test("parse links lines to catalog ingredients", async () => {
    const c = await householdMember("parse-user");
    const res = await c.request("/api/ingredients/parse", {
      method: "POST",
      body: JSON.stringify({
        lines: [
          "200 g Mehl, gesiebt",
          "2 große Zwiebeln",
          "3 Zehen Knoblauch",
          "Omas Geheimzutat",
        ],
      }),
    });
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<{
      quantity: number | null;
      unit: string | null;
      ingredient: { key: string | null } | null;
    }>;
    expect(rows.map((r) => r.ingredient?.key ?? null)).toEqual([
      "wheat-flour",
      "onion",
      "garlic-clove",
      null,
    ]);
    expect(rows[2]).toMatchObject({ quantity: 3, unit: "pcs" });
  });

  test("parse keeps generic recipe lines away from fuzzy catalog surprises", async () => {
    const c = await householdMember("parse-generic");
    const res = await c.request("/api/ingredients/parse", {
      method: "POST",
      body: JSON.stringify({
        lines: [
          "2 Möhre(n)",
          "250 g Nudeln (kurze)",
          "Salz und Pfeffer",
          "1 Zwiebel(n)",
          "1 Lauchstange(n)",
          "1 EL Öl",
          "300 g Hackfleisch, gemischtes",
          "Currypulver",
          "200 g Schlagsahne",
          "125 ml Brühe",
        ],
      }),
    });
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<{
      ingredient: { key: string | null } | null;
    }>;
    expect(rows[1]?.ingredient?.key).toBe("pasta");
    expect(rows[5]?.ingredient?.key).toBe("vegetable-oil");
    expect(rows[6]?.ingredient?.key).toBe("mixed-mince");
    expect(rows[9]?.ingredient?.key).toBe("vegetable-stock");
  });
});
