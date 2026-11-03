import { member, organization } from "@yumi/db/schema";
import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { type AuthedEnv, requireAuth } from "../context";
import { db } from "../db";

/** Current user, their households and the active one: everything the app shell needs on start. */
export const me = new Hono<AuthedEnv>().use(requireAuth).get("/", async (c) => {
  const user = c.get("user");
  const households = await db
    .select({ id: organization.id, name: organization.name, role: member.role })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, user.id))
    .orderBy(asc(member.createdAt));
  const activeId = c.get("session").activeOrganizationId;
  return c.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image ?? null,
    },
    households,
    activeHouseholdId: households.some((h) => h.id === activeId)
      ? (activeId ?? null)
      : null,
  });
});
