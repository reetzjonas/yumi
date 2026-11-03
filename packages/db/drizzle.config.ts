import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ?? "postgres://yumi:yumi@localhost:55433/yumi",
  },
  casing: "snake_case",
});
