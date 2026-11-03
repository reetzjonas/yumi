import { householdInvite, member, organization } from "@yumi/db/schema";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { auth } from "../auth";
import {
  type AuthedEnv,
  type HouseholdEnv,
  requireAuth,
  requireHousehold,
} from "../context";
import { db } from "../db";

const createInviteSchema = z.object({
  expiresInDays: z.number().int().min(1).max(30).default(7),
  maxUses: z.number().int().min(1).max(50).nullable().default(null),
});

const MANAGER_ROLES = new Set(["owner", "admin"]);

function newToken() {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString(
    "base64url",
  );
}

/** Invite management within the active household. */
export const householdInvites = new Hono<HouseholdEnv>()
  .use(requireAuth, requireHousehold)
  .get("/", async (c) => {
    const rows = await db
      .select({
        id: householdInvite.id,
        token: householdInvite.token,
        expiresAt: householdInvite.expiresAt,
        maxUses: householdInvite.maxUses,
        uses: householdInvite.uses,
      })
      .from(householdInvite)
      .where(
        and(
          eq(householdInvite.householdId, c.get("householdId")),
          isNull(householdInvite.revokedAt),
          gt(householdInvite.expiresAt, sql`now()`),
        ),
      )
      .orderBy(desc(householdInvite.createdAt));
    return c.json(rows);
  })
  .post("/", async (c) => {
    if (!MANAGER_ROLES.has(c.get("role")))
      throw new HTTPException(403, { message: "forbidden" });
    const input = createInviteSchema.parse(
      await c.req.json().catch(() => ({})),
    );
    const [row] = await db
      .insert(householdInvite)
      .values({
        householdId: c.get("householdId"),
        token: newToken(),
        createdBy: c.get("user").id,
        expiresAt: new Date(Date.now() + input.expiresInDays * 86_400_000),
        maxUses: input.maxUses,
      })
      .returning({
        id: householdInvite.id,
        token: householdInvite.token,
        expiresAt: householdInvite.expiresAt,
        maxUses: householdInvite.maxUses,
        uses: householdInvite.uses,
      });
    return c.json(row, 201);
  })
  .delete("/:id", async (c) => {
    if (!MANAGER_ROLES.has(c.get("role")))
      throw new HTTPException(403, { message: "forbidden" });
    const revoked = await db
      .update(householdInvite)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(householdInvite.id, c.req.param("id")),
          eq(householdInvite.householdId, c.get("householdId")),
        ),
      )
      .returning({ id: householdInvite.id });
    if (revoked.length === 0)
      throw new HTTPException(404, { message: "not_found" });
    return c.body(null, 204);
  });

async function findUsableInvite(token: string) {
  const [row] = await db
    .select({
      id: householdInvite.id,
      householdId: householdInvite.householdId,
      householdName: organization.name,
      expiresAt: householdInvite.expiresAt,
      maxUses: householdInvite.maxUses,
      uses: householdInvite.uses,
    })
    .from(householdInvite)
    .innerJoin(organization, eq(organization.id, householdInvite.householdId))
    .where(
      and(
        eq(householdInvite.token, token),
        isNull(householdInvite.revokedAt),
        gt(householdInvite.expiresAt, sql`now()`),
      ),
    )
    .limit(1);
  if (!row || (row.maxUses !== null && row.uses >= row.maxUses)) {
    throw new HTTPException(404, { message: "invite_invalid" });
  }
  return row;
}

/** Joining via token, for any signed-in user. */
export const invites = new Hono<AuthedEnv>()
  .use(requireAuth)
  .get("/:token", async (c) => {
    const invite = await findUsableInvite(c.req.param("token"));
    return c.json({
      householdName: invite.householdName,
      expiresAt: invite.expiresAt,
    });
  })
  .post("/:token/accept", async (c) => {
    const invite = await findUsableInvite(c.req.param("token"));
    const userId = c.get("user").id;
    const [existing] = await db
      .select({ id: member.id })
      .from(member)
      .where(
        and(
          eq(member.organizationId, invite.householdId),
          eq(member.userId, userId),
        ),
      )
      .limit(1);
    if (!existing) {
      await auth.api.addMember({
        body: { userId, organizationId: invite.householdId, role: "member" },
      });
      await db
        .update(householdInvite)
        .set({ uses: sql`${householdInvite.uses} + 1` })
        .where(eq(householdInvite.id, invite.id));
    }
    await auth.api.setActiveOrganization({
      headers: c.req.raw.headers,
      body: { organizationId: invite.householdId },
    });
    return c.json({
      householdId: invite.householdId,
      householdName: invite.householdName,
    });
  });
