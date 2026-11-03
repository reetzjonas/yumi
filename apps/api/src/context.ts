import { member } from "@yumi/db/schema";
import { and, eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { type AuthSession, auth } from "./auth";
import { db } from "./db";

export type AppEnv = {
  Variables: {
    user: AuthSession["user"] | null;
    session: AuthSession["session"] | null;
  };
};

export type AuthedEnv = {
  Variables: { user: AuthSession["user"]; session: AuthSession["session"] };
};

export type HouseholdEnv = {
  Variables: AuthedEnv["Variables"] & { householdId: string; role: string };
};

export const loadSession = createMiddleware<AppEnv>(async (c, next) => {
  const result = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set("user", result?.user ?? null);
  c.set("session", result?.session ?? null);
  await next();
});

export const requireAuth = createMiddleware<AuthedEnv>(async (c, next) => {
  if (!c.get("user") || !c.get("session")) {
    throw new HTTPException(401, { message: "unauthorized" });
  }
  await next();
});

/** Scopes the request to the session's active household and verifies membership. */
export const requireHousehold = createMiddleware<HouseholdEnv>(
  async (c, next) => {
    const householdId = c.get("session").activeOrganizationId;
    if (!householdId)
      throw new HTTPException(409, { message: "no_active_household" });
    const [row] = await db
      .select({ role: member.role })
      .from(member)
      .where(
        and(
          eq(member.organizationId, householdId),
          eq(member.userId, c.get("user").id),
        ),
      )
      .limit(1);
    if (!row) throw new HTTPException(403, { message: "not_a_member" });
    c.set("householdId", householdId);
    c.set("role", row.role);
    await next();
  },
);
