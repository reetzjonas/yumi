import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const adminUrl =
  process.env.TEST_DATABASE_ADMIN_URL ??
  "postgres://yumi:yumi@localhost:55433/postgres";

/**
 * Creates a fresh, migrated database for one test file and points DATABASE_URL at it.
 * Import the app only after calling this (the app reads env at import time).
 */
export async function setupTestDatabase(name: string) {
  const dbName = `yumi_test_${name}_${process.pid}`;
  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
  await admin.unsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE "${dbName}"`);
  const url = new URL(adminUrl);
  url.pathname = `/${dbName}`;
  const client = postgres(url.toString(), { max: 1, onnotice: () => {} });
  await migrate(drizzle(client), {
    migrationsFolder: new URL(
      "../../../../packages/db/migrations",
      import.meta.url,
    ).pathname,
  });
  await client.end();
  process.env.DATABASE_URL = url.toString();
  return async () => {
    await admin.unsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await admin.end();
  };
}
