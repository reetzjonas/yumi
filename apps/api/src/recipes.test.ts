import { describe, expect, test } from "bun:test";
import { type Client, householdMember } from "./test/client";

type Recipe = {
  id: string;
  title: string;
  tags: string[];
  ingredients: Array<{
    section: string | null;
    rawText: string;
    quantity: number | null;
    unit: string | null;
    ingredientId: string | null;
    ingredient: { nameDe: string } | null;
  }>;
  steps: Array<{ text: string }>;
};

async function onionId(c: Client) {
  const res = await c.request("/api/ingredients?q=Zwiebel&limit=1");
  const [onion] = (await res.json()) as { id: string }[];
  if (!onion) throw new Error("seed onion missing");
  return onion.id;
}

async function createRecipe(c: Client, body: object) {
  const res = await c.request("/api/recipes", {
    method: "POST",
    body: JSON.stringify(body),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as Recipe;
}

describe("recipes", () => {
  test("create, read, update and delete keep order and links", async () => {
    const c = await householdMember("chef");
    const onion = await onionId(c);
    const created = await createRecipe(c, {
      title: "Zwiebelkuchen",
      servings: 4,
      tags: ["herbst", "herbst", "vegetarisch"],
      sourceUrl: "https://example.com/zwiebelkuchen",
      ingredients: [
        { section: "Teig", rawText: "250 g Mehl", quantity: 250, unit: "g" },
        {
          section: "Belag",
          rawText: "1 kg Zwiebeln",
          quantity: 1,
          unit: "kg",
          ingredientId: onion,
        },
      ],
      steps: [{ text: "Teig kneten" }, { text: "Zwiebeln schmoren" }],
    });
    expect(created.tags).toEqual(["herbst", "vegetarisch"]);
    expect(created.ingredients.map((i) => i.section)).toEqual([
      "Teig",
      "Belag",
    ]);
    expect(created.ingredients[1]?.ingredient?.nameDe).toBe("Zwiebel");
    expect(created.ingredients[0]?.ingredient).toBeNull();

    const updated = await c.request(`/api/recipes/${created.id}`, {
      method: "PUT",
      body: JSON.stringify({
        title: "Schwäbischer Zwiebelkuchen",
        steps: [{ text: "Zwiebeln schmoren" }, { text: "Teig kneten" }],
      }),
    });
    expect(updated.status).toBe(200);
    const after = (await updated.json()) as Recipe;
    expect(after.steps.map((s) => s.text)).toEqual([
      "Zwiebeln schmoren",
      "Teig kneten",
    ]);
    expect(after.ingredients).toEqual([]);

    expect(
      (await c.request(`/api/recipes/${created.id}`, { method: "DELETE" }))
        .status,
    ).toBe(204);
    expect((await c.request(`/api/recipes/${created.id}`)).status).toBe(404);
  });

  test("list filters by search text and tag", async () => {
    const c = await householdMember("lister");
    await createRecipe(c, { title: "Linsensuppe", tags: ["suppe"] });
    await createRecipe(c, {
      title: "Tomatensuppe",
      tags: ["suppe", "schnell"],
    });
    await createRecipe(c, { title: "Pfannkuchen", tags: ["süß"] });

    const titles = async (query: string) =>
      (
        (await (await c.request(`/api/recipes${query}`)).json()) as Recipe[]
      ).map((r) => r.title);
    expect((await titles("?q=suppe")).sort()).toEqual([
      "Linsensuppe",
      "Tomatensuppe",
    ]);
    expect(await titles("?tag=schnell")).toEqual(["Tomatensuppe"]);
    expect(await titles("?q=50%25")).toEqual([]);
    expect(await (await c.request("/api/recipes/tags")).json()).toEqual([
      "schnell",
      "suppe",
      "süß",
    ]);
  });

  test("recipes and household ingredients stay within their household", async () => {
    const a = await householdMember("recipe-a");
    const b = await householdMember("recipe-b");
    const recipe = await createRecipe(a, { title: "Geheimrezept" });
    const own = await a.request("/api/ingredients", {
      method: "POST",
      body: JSON.stringify({ nameDe: "Hausgewürz" }),
    });
    const spice = (await own.json()) as { id: string };

    expect((await b.request(`/api/recipes/${recipe.id}`)).status).toBe(404);
    expect(await (await b.request("/api/recipes")).json()).toEqual([]);
    expect(
      (
        await b.request(`/api/recipes/${recipe.id}`, {
          method: "PUT",
          body: JSON.stringify({ title: "Geklaut" }),
        })
      ).status,
    ).toBe(404);
    expect(
      (await b.request(`/api/recipes/${recipe.id}`, { method: "DELETE" }))
        .status,
    ).toBe(404);

    const foreign = await b.request("/api/recipes", {
      method: "POST",
      body: JSON.stringify({
        title: "Mit fremder Zutat",
        ingredients: [{ rawText: "1 TL Hausgewürz", ingredientId: spice.id }],
      }),
    });
    expect(foreign.status).toBe(400);
    expect(await foreign.json()).toEqual({ error: "invalid_ingredient" });
  });

  test("invalid input is rejected", async () => {
    const c = await householdMember("recipe-invalid");
    for (const body of [
      {},
      { title: " " },
      { title: "X", sourceUrl: "javascript:alert(1)" },
      { title: "X", ingredients: [{ rawText: "1 x", unit: "bucket" }] },
    ]) {
      const res = await c.request("/api/recipes", {
        method: "POST",
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(400);
    }
  });

  test("an uploaded image is resized to WebP and served per household", async () => {
    const c = await householdMember("photographer");
    const other = await householdMember("photo-other");
    const recipe = await createRecipe(c, { title: "Mit Foto" });
    const png = await new Bun.Image(
      Uint8Array.from(
        atob(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
        ),
        (ch) => ch.charCodeAt(0),
      ),
    )
      .resize(1600, 1000)
      .png()
      .bytes();
    const upload = async (bytes: Uint8Array) => {
      const form = new FormData();
      form.append("image", new File([bytes], "photo.png"));
      return c.request(`/api/recipes/${recipe.id}/image`, {
        method: "PUT",
        body: form,
      });
    };

    const res = await upload(png);
    expect(res.status).toBe(200);
    const { imageKey } = (await res.json()) as { imageKey: string };
    const detail = (await (
      await c.request(`/api/recipes/${recipe.id}`)
    ).json()) as { imageKey: string };
    expect(detail.imageKey).toBe(imageKey);

    const thumb = await c.request(`/api/recipes/${recipe.id}/image/thumb`);
    expect(thumb.headers.get("content-type")).toBe("image/webp");
    const size = new Bun.Image(new Uint8Array(await thumb.arrayBuffer()));
    expect(await size.metadata()).toMatchObject({ width: 400, height: 250 });
    expect(
      (await other.request(`/api/recipes/${recipe.id}/image/full`)).status,
    ).toBe(404);

    const broken = await upload(new Uint8Array([1, 2, 3]));
    expect(broken.status).toBe(400);
    expect(await broken.json()).toEqual({ error: "invalid_image" });

    expect(
      (
        await c.request(`/api/recipes/${recipe.id}/image`, {
          method: "DELETE",
        })
      ).status,
    ).toBe(204);
    expect(
      (await c.request(`/api/recipes/${recipe.id}/image/thumb`)).status,
    ).toBe(404);
  });
});
