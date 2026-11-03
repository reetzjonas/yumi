import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .default("postgres://yumi:yumi@localhost:55433/yumi"),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32)
    .default("dev-only-secret-change-me-0123456789abcdef"),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:5173"),
  PORT: z.coerce.number().default(3000),
  APP_VERSION: z.string().default("dev"),
});

export const env = envSchema.parse(process.env);

if (process.env.NODE_ENV === "production" && !process.env.BETTER_AUTH_SECRET) {
  throw new Error("BETTER_AUTH_SECRET must be set in production");
}
