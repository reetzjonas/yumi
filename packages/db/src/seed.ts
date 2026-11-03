import { createDb } from "./index";
import { seedCatalog } from "./seed/index";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const db = createDb(url);
const counts = await seedCatalog(db);
console.log(
  `seeded ${counts.categories} categories, ${counts.ingredients} ingredients`,
);
await db.$client.end();
