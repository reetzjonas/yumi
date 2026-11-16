// Regenerates packages/db/src/bls/bls-4.0.json from the BLS 4.0 data file.
// Download BLS_4_0_2025_DE.zip from https://blsdb.de ("Download BLS-Daten"), unzip it and run
//   bun run nutrition:bls path/to/BLS_4_0_Daten_2025_DE.xlsx
// Every food with complete values is kept, as [code, nameDe, nameEn, ...seven values per 100 g]
// in NUTRIENT_KEYS order; the catalog mapping in seed/bls-codes.ts must resolve to one of them.
import readXlsxFile from "read-excel-file/node";
import { NUTRIENT_KEYS } from "../packages/db/src/bls/format";
import { BLS_CODES } from "../packages/db/src/seed/bls-codes";
import { nutritionValuesSchema } from "../packages/shared/src/nutrition";

const file = process.argv[2];
if (!file)
  throw new Error("Usage: bun run nutrition:bls <BLS_4_0_Daten_2025_DE.xlsx>");

// Our field -> BLS component code. CHO is available carbohydrate, i.e. without fibre.
const COMPONENTS = {
  energyKcal: "ENERCC",
  proteinG: "PROT625",
  fatG: "FAT",
  carbsG: "CHO",
  sugarG: "SUGAR",
  fiberG: "FIBT",
  saltG: "NACL",
} as const;

// The BLS leaves negligible components empty (fibre in cheese, fat in wine); count those as 0.
const NEGLIGIBLE_WHEN_MISSING = new Set(["proteinG", "fatG", "fiberG"]);

const [header, ...rows] = await readXlsxFile(file);
if (!header) throw new Error("Empty BLS file");
const column = (code: string) => {
  const index = header.findIndex((cell) => String(cell).startsWith(`${code} `));
  if (index === -1) throw new Error(`BLS column ${code} not found`);
  return index;
};
const columns = NUTRIENT_KEYS.map((key) => column(COMPONENTS[key]));

const round = (value: number) => Math.round(value * 100) / 100;
const foods: (string | number)[][] = [];
const incomplete = new Map<string, string>();
for (const row of rows) {
  const code = String(row[0]);
  const raw = columns.map((index, i) => {
    const value = row[index];
    if (typeof value === "number") return round(value);
    return NEGLIGIBLE_WHEN_MISSING.has(NUTRIENT_KEYS[i] ?? "") ? 0 : null;
  });
  const values = Object.fromEntries(NUTRIENT_KEYS.map((k, i) => [k, raw[i]]));
  const parsed = nutritionValuesSchema.safeParse(values);
  if (!parsed.success) {
    incomplete.set(code, `${code} ${row[1]}: ${parsed.error.issues[0]?.path}`);
    continue;
  }
  foods.push([
    code,
    String(row[1]),
    String(row[2] ?? ""),
    ...(raw as number[]),
  ]);
}

const kept = new Set(foods.map(([code]) => code));
const problems = [...new Set(Object.values(BLS_CODES))]
  .filter((code) => !kept.has(code))
  .map((code) => incomplete.get(code) ?? `${code}: not in the BLS file`);
if (problems.length > 0)
  throw new Error(
    `Catalog BLS codes without a profile:\n${problems.join("\n")}`,
  );

const target = new URL("../packages/db/src/bls/bls-4.0.json", import.meta.url);
await Bun.write(
  target,
  `[\n${foods.map((f) => JSON.stringify(f)).join(",\n")}\n]\n`,
);
console.log(
  `Wrote ${foods.length} BLS foods, skipped ${incomplete.size} incomplete`,
);
