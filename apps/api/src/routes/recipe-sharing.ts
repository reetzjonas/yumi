import { recipe, recipeImage, shareLink } from "@yumi/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { validator } from "hono/validator";
import { z } from "zod";
import { type HouseholdEnv, requireAuth, requireHousehold } from "../context";
import { db } from "../db";
import { activeShare, copySharedRecipe, sharedRecipe } from "../recipe-sharing";

async function ownedRecipe(householdId: string, id: string) {
  const [row] = await db
    .select({ id: recipe.id })
    .from(recipe)
    .where(and(eq(recipe.id, id), eq(recipe.householdId, householdId)));
  if (!row) throw new HTTPException(404, { message: "not_found" });
}

const tokenInput = validator("param", (value) =>
  z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).parse(value),
);

export const recipeShares = new Hono<HouseholdEnv>()
  .use(requireAuth, requireHousehold)
  .get("/:id/shares", async (c) => {
    const id = z.uuid().parse(c.req.param("id"));
    await ownedRecipe(c.get("householdId"), id);
    return c.json(
      await db
        .select({
          id: shareLink.id,
          token: shareLink.token,
          expiresAt: shareLink.expiresAt,
          createdAt: shareLink.createdAt,
        })
        .from(shareLink)
        .where(eq(shareLink.recipeId, id))
        .orderBy(desc(shareLink.createdAt)),
    );
  })
  .post(
    "/:id/shares",
    validator("json", (value) =>
      z
        .object({
          expiresAt: z.iso.datetime({ offset: true }).nullable().default(null),
        })
        .parse(value),
    ),
    async (c) => {
      const id = z.uuid().parse(c.req.param("id"));
      const { expiresAt } = c.req.valid("json");
      if (expiresAt && new Date(expiresAt).getTime() <= Date.now())
        throw new HTTPException(400, { message: "invalid_expiry" });
      await ownedRecipe(c.get("householdId"), id);
      const token = [...crypto.getRandomValues(new Uint8Array(32))]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      const [link] = await db
        .insert(shareLink)
        .values({
          recipeId: id,
          token,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        })
        .returning({
          id: shareLink.id,
          token: shareLink.token,
          expiresAt: shareLink.expiresAt,
          createdAt: shareLink.createdAt,
        });
      return c.json(link, 201);
    },
  )
  .delete("/:id/shares/:shareId", async (c) => {
    const id = z.uuid().parse(c.req.param("id"));
    await ownedRecipe(c.get("householdId"), id);
    const deleted = await db
      .delete(shareLink)
      .where(
        and(
          eq(shareLink.id, z.uuid().parse(c.req.param("shareId"))),
          eq(shareLink.recipeId, id),
        ),
      )
      .returning({ id: shareLink.id });
    if (deleted.length === 0)
      throw new HTTPException(404, { message: "not_found" });
    return c.body(null, 204);
  });

export const publicRecipes = new Hono<HouseholdEnv>()
  .use(async (c, next) => {
    c.header("Cache-Control", "no-store");
    c.header("Referrer-Policy", "no-referrer");
    c.header("X-Robots-Tag", "noindex, nofollow");
    await next();
  })
  .get("/:token", tokenInput, async (c) =>
    c.json(await sharedRecipe(c.req.valid("param").token)),
  )
  .get("/:token/image/:variant", async (c) => {
    const token = z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .parse(c.req.param("token"));
    const variant = z.enum(["thumb", "full"]).parse(c.req.param("variant"));
    const link = await activeShare(db, token);
    const [image] = await db
      .select({ data: recipeImage[variant] })
      .from(recipeImage)
      .where(eq(recipeImage.recipeId, link.recipeId));
    if (!image) throw new HTTPException(404, { message: "not_found" });
    return c.body(new Uint8Array(image.data).buffer, 200, {
      "Content-Type": "image/webp",
    });
  })
  .post("/:token/copy", requireAuth, requireHousehold, tokenInput, async (c) =>
    c.json(
      await copySharedRecipe(c.req.valid("param").token, {
        householdId: c.get("householdId"),
        userId: c.get("user").id,
      }),
      201,
    ),
  );
