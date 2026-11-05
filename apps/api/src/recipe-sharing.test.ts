import { describe, expect, test } from "bun:test";
import { shareLink } from "@yumi/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { client, householdMember, signUp } from "./test/client";
import {
  createShare,
  detailSchema,
  fixture,
  idSchema,
  linkSchema,
} from "./test/sharing";

describe("recipe sharing", () => {
  test("anonymous readers see only recipe content and uncached images", async () => {
    const { owner, recipe } = await fixture("sharing-public");
    const link = await createShare(owner, recipe.id);
    const anonymous = client();
    const response = await anonymous.request(
      `/api/recipe-shares/${link.token}`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await response.json()).toEqual({
      title: "Shared soup",
      description: "A household recipe",
      servings: 3,
      prepMinutes: null,
      cookMinutes: null,
      sourceUrl: null,
      tags: [],
      imageKey: null,
      ingredients: [
        {
          section: null,
          rawText: "2 g spice blend",
          quantity: 2,
          unit: "g",
          note: null,
          optional: false,
          ingredient: {
            nameDe: "Geheime Gewürzmischung",
            nameEn: "Secret spice blend",
          },
        },
        {
          section: null,
          rawText: "Water",
          quantity: null,
          unit: null,
          note: null,
          optional: false,
          ingredient: null,
        },
        {
          section: null,
          rawText: "1 g spice blend",
          quantity: null,
          unit: null,
          note: null,
          optional: false,
          ingredient: {
            nameDe: "Geheime Gewürzmischung",
            nameEn: "Secret spice blend",
          },
        },
      ],
      steps: [{ text: "Mix the spice blend." }],
    });
    const image = await anonymous.request(
      `/api/recipe-shares/${link.token}/image/full`,
    );
    expect(image.status).toBe(200);
    expect(image.headers.get("cache-control")).toBe("no-store");
    expect([...new Uint8Array(await image.arrayBuffer())]).toEqual([4, 5, 6]);
    expect((await anonymous.request(`/api/recipes/${recipe.id}`)).status).toBe(
      401,
    );
  });

  test("copy remaps custom ingredients, manual step references and images into the destination", async () => {
    const { owner, recipe, customId } = await fixture("sharing-copy");
    const link = await createShare(owner, recipe.id);
    const destination = await householdMember("sharing-recipient");
    const response = await destination.request(
      `/api/recipe-shares/${link.token}/copy`,
      { method: "POST" },
    );
    expect(response.status).toBe(201);
    const { id } = idSchema.parse(await response.json());
    expect(id).not.toBe(recipe.id);
    const copy = detailSchema.parse(
      await (await destination.request(`/api/recipes/${id}`)).json(),
    );
    expect(copy.title).toBe(recipe.title);
    expect(copy.ingredients.map((line) => line.rawText)).toEqual(
      recipe.ingredients.map((line) => line.rawText),
    );
    expect(copy.ingredients[0]?.ingredientId).not.toBe(customId);
    expect(copy.ingredients[0]?.ingredientId).toBe(
      copy.ingredients[2]?.ingredientId,
    );
    expect(copy.ingredients[0]?.excludeFromNutrition).toBe(true);
    expect(copy.steps[0]?.ingredientPositions).toEqual([0, 2]);
    expect(copy.steps[0]?.ingredientRefs).toEqual(
      copy.ingredients
        .filter((_, index) => index === 0 || index === 2)
        .map((line) => line.id),
    );
    expect(copy.imageKey).not.toBeNull();
    const image = await destination.request(`/api/recipes/${id}/image/full`);
    expect([...new Uint8Array(await image.arrayBuffer())]).toEqual([4, 5, 6]);
    expect((await owner.request(`/api/recipes/${id}`)).status).toBe(404);
    expect(
      (await destination.request(`/api/recipes/${recipe.id}`)).status,
    ).toBe(404);
    const catalog = z
      .array(z.object({ id: z.uuid(), nameEn: z.string() }))
      .parse(
        await (
          await destination.request("/api/ingredients?q=Secret%20spice")
        ).json(),
      );
    expect(
      catalog.some((item) => item.id === copy.ingredients[0]?.ingredientId),
    ).toBe(true);
    await owner.request(`/api/recipes/${recipe.id}`, { method: "DELETE" });
    expect((await destination.request(`/api/recipes/${id}`)).status).toBe(200);
  });

  test.each(["revoked", "expired", "deleted"] as const)(
    "%s links deny reading, images and copies",
    async (state) => {
      const { owner, recipe } = await fixture(`sharing-${state}`);
      const link = await createShare(owner, recipe.id);
      switch (state) {
        case "revoked":
          expect(
            (
              await owner.request(
                `/api/recipes/${recipe.id}/shares/${link.id}`,
                { method: "DELETE" },
              )
            ).status,
          ).toBe(204);
          break;
        case "expired":
          await db
            .update(shareLink)
            .set({ expiresAt: new Date(0) })
            .where(eq(shareLink.id, link.id));
          break;
        case "deleted":
          await owner.request(`/api/recipes/${recipe.id}`, {
            method: "DELETE",
          });
          break;
      }
      expect(
        (await client().request(`/api/recipe-shares/${link.token}`)).status,
      ).toBe(404);
      expect(
        (await client().request(`/api/recipe-shares/${link.token}/image/full`))
          .status,
      ).toBe(404);
      expect(
        (
          await owner.request(`/api/recipe-shares/${link.token}/copy`, {
            method: "POST",
          })
        ).status,
      ).toBe(404);
    },
  );

  test("share management is household scoped and copying requires an active household", async () => {
    const { owner, recipe } = await fixture("sharing-management");
    const link = await createShare(owner, recipe.id);
    const outsider = await householdMember("sharing-outsider");
    for (const [method, path, body] of [
      ["GET", `/api/recipes/${recipe.id}/shares`, undefined],
      ["POST", `/api/recipes/${recipe.id}/shares`, "{}"],
      ["DELETE", `/api/recipes/${recipe.id}/shares/${link.id}`, undefined],
    ] as const) {
      expect((await outsider.request(path, { method, body })).status).toBe(404);
    }
    const list = await owner.request(`/api/recipes/${recipe.id}/shares`);
    expect(
      z
        .array(linkSchema)
        .parse(await list.json())
        .map((item) => item.id),
    ).toEqual([link.id]);
    expect(
      (
        await client().request(`/api/recipe-shares/${link.token}/copy`, {
          method: "POST",
        })
      ).status,
    ).toBe(401);
    const noHousehold = await signUp("sharing-no-home");
    expect(
      (
        await noHousehold.request(`/api/recipe-shares/${link.token}/copy`, {
          method: "POST",
        })
      ).status,
    ).toBe(409);
    expect(
      (await client().request(`/api/recipe-shares/${"0".repeat(64)}`)).status,
    ).toBe(404);
  });

  test("future expiry is retained and past expiry is rejected", async () => {
    const { owner, recipe } = await fixture("sharing-expiry");
    const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
    const response = await owner.request(`/api/recipes/${recipe.id}/shares`, {
      method: "POST",
      body: JSON.stringify({ expiresAt }),
    });
    expect(response.status).toBe(201);
    const link = linkSchema.parse(await response.json());
    expect(link.expiresAt).toBe(expiresAt);
    expect(
      (await client().request(`/api/recipe-shares/${link.token}`)).status,
    ).toBe(200);
    expect(
      (
        await owner.request(`/api/recipes/${recipe.id}/shares`, {
          method: "POST",
          body: JSON.stringify({ expiresAt: "2000-01-01T00:00:00Z" }),
        })
      ).status,
    ).toBe(400);
  });
});
