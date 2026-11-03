import { member } from "@yumi/db/schema";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { asc, eq } from "drizzle-orm";
import { db } from "./db";
import { env } from "./env";

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  basePath: "/api/auth",
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  plugins: [organization()],
  databaseHooks: {
    session: {
      create: {
        // Start every session in the user's oldest household, if any.
        before: async (session) => {
          const [first] = await db
            .select({ organizationId: member.organizationId })
            .from(member)
            .where(eq(member.userId, session.userId))
            .orderBy(asc(member.createdAt))
            .limit(1);
          return {
            data: {
              ...session,
              activeOrganizationId: first?.organizationId ?? null,
            },
          };
        },
      },
    },
  },
});

export type AuthSession = typeof auth.$Infer.Session;
