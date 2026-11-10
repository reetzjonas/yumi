import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { aiServer, completion } from "./ai/test-server";
import { type Client, householdMember } from "./test/client";
import {
  pickWeekMeals,
  suggestWeek,
  type WeekCandidate,
} from "./week-suggestion";

const candidate = (
  id: string,
  daysAgo: number | null,
  minutes: number | null = 45,
): WeekCandidate => ({
  id,
  title: id,
  tags: [],
  minutes,
  lastCookedAt:
    daysAgo === null ? null : new Date(Date.now() - daysAgo * 86_400_000),
  myRating: null,
});

describe("pickWeekMeals", () => {
  test("mixes leftovers, long-neglected and one quick recipe", () => {
    const picks = pickWeekMeals(
      [
        candidate("recent", 2),
        candidate("old", 60),
        candidate("never", null),
        candidate("older", 90),
        candidate("quick", 5, 20),
        candidate("leftover", 3),
      ],
      ["leftover", "unknown"],
    );
    expect(picks.map((pick) => [pick.id, pick.reason])).toEqual([
      ["leftover", "leftovers"],
      ["never", "neglected"],
      ["older", "neglected"],
      ["quick", "quick"],
    ]);
  });

  test("returns what exists when there are few recipes", () => {
    expect(pickWeekMeals([candidate("only", null)], [])).toEqual([
      { id: "only", reason: "neglected", reasonText: null },
    ]);
    expect(pickWeekMeals([], [])).toEqual([]);
  });
});

async function recipes(c: Client, titles: string[]) {
  const ids: string[] = [];
  for (const title of titles) {
    const response = await c.request("/api/recipes", {
      method: "POST",
      body: JSON.stringify({ title }),
    });
    ids.push(z.object({ id: z.uuid() }).parse(await response.json()).id);
  }
  return ids;
}

const suggestionSchema = z.object({
  method: z.enum(["rules", "ai"]),
  meals: z.array(
    z.object({
      id: z.uuid(),
      title: z.string(),
      reason: z.string(),
      reasonText: z.string().nullable(),
    }),
  ),
});

describe("week suggestion", () => {
  test("the route suggests unplanned recipes of the household by rules", async () => {
    const c = await householdMember("week-rules");
    const ids = await recipes(c, ["Soup", "Dal", "Pasta", "Salad", "Curry"]);
    const soup = z.uuid().parse(ids[0]);
    const curry = z.uuid().parse(ids[4]);
    await c.request("/api/queue", {
      method: "POST",
      body: JSON.stringify({ recipeId: soup, servings: 2 }),
    });
    const result = suggestionSchema.parse(
      await (await c.request("/api/queue/week-suggestion?locale=en")).json(),
    );
    expect(result.method).toBe("rules");
    expect(result.meals).toHaveLength(4);
    expect(result.meals.map((meal) => meal.id)).not.toContain(soup);
    expect(result.meals.map((meal) => meal.id)).toContain(curry);
    const outsider = await householdMember("week-outsider");
    expect(
      suggestionSchema.parse(
        await (
          await outsider.request("/api/queue/week-suggestion?locale=en")
        ).json(),
      ).meals,
    ).toEqual([]);
  });

  test("AI picks are mapped back to recipes and bad answers fall back to rules", async () => {
    const c = await householdMember("week-ai");
    await recipes(c, ["A", "B", "C", "D", "E", "F"]);
    const session = z
      .object({
        user: z.object({ id: z.string() }),
        activeHouseholdId: z.string(),
      })
      .parse(await (await c.request("/api/me")).json());
    const me = { id: session.user.id, ...session };
    const good = aiServer("ollama", ({ model }) =>
      completion(
        "ollama",
        model,
        JSON.stringify({
          picks: [
            { number: 2, reason: "Long not cooked" },
            { number: 2, reason: "duplicate" },
            { number: 5, reason: "Quick" },
            { number: 6, reason: "Variety" },
            { number: 99, reason: "does not exist" },
          ],
        }),
      ),
    );
    const viaAi = await suggestWeek(
      me.activeHouseholdId,
      me.id,
      "en",
      good.client,
    );
    expect(viaAi.method).toBe("ai");
    expect(viaAi.meals.map((meal) => meal.reasonText)).toEqual([
      "Long not cooked",
      "Quick",
      "Variety",
    ]);
    const bad = aiServer("ollama", ({ model }) =>
      completion(
        "ollama",
        model,
        JSON.stringify({ picks: [{ number: 99, reason: "nothing usable" }] }),
      ),
    );
    const fallback = await suggestWeek(
      me.activeHouseholdId,
      me.id,
      "en",
      bad.client,
    );
    expect(fallback.method).toBe("rules");
    expect(fallback.meals).toHaveLength(4);
  });
});
