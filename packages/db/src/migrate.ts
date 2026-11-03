import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema";
import { seedCatalog } from "./seed/index";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const client = postgres(url, { max: 1 });
const db = drizzle(client, { schema, casing: "snake_case" });
await migrate(db, {
  migrationsFolder: new URL("../migrations", import.meta.url).pathname,
});
const counts = await seedCatalog(db);
await client.end();
console.log(
  `migrations applied, catalog seeded (${counts.categories} categories, ${counts.ingredients} ingredients)`,
);
