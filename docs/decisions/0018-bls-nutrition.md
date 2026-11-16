# 0018: German nutrient database (BLS 4.0) as the primary nutrition source

- Status: Accepted (alpha)
- Date: 2026-11-16

## Context

Catalog nutrition came from USDA FoodData Central SR Legacy 2018. For raw produce that is fine, but
processed foods differ from what German shops sell: US frozen puff pastry has 551 kcal/100 g,
German refrigerated puff pastry about 425; US pork belly, cream cheese, bratwurst and liver sausage
were 30 to 70 % higher than their German counterparts. A quiche came out at almost 1,000 kcal per
portion. yumi targets German households, so its reference values should describe German food.

The Max Rubner-Institut published the Bundeslebensmittelschlüssel (BLS) 4.0 in December 2025 as open
data under CC BY 4.0: 7,140 foods with up to 138 components, every value with its provenance.

## Decision

- Each catalog entry maps to the BLS code of the food as bought (`packages/db/src/seed/bls-codes.ts`),
  e.g. "Blätterteig eifrei, roh", "Speisequark Halbfettstufe", "Schwein Kochschinken".
- `bun run nutrition:bls <BLS_4_0_Daten_2025_DE.xlsx>` generates `bls-nutrition.ts` with our seven
  values: ENERCC, PROT625, FAT, CHO (available carbohydrate, without fibre), SUGAR, FIBT, NACL.
  Protein, fat and fibre the BLS leaves empty count as 0 (fibre in cheese, fat in wine); any other gap
  fails the script. The 14 MB source file is not committed.
- Source order in the seed: BLS, then the hand-made estimate (ADR 0017), then USDA. USDA stays for
  what BLS 4.0 lacks, mainly dried spices, Asian sauces and fresh herbs.
- `nutrition_source` names the BLS code and food; the recipe view credits the Max Rubner-Institut as
  CC BY 4.0 requires.
- The catalog stays curated. The full BLS is not imported as ingredients: it contains dishes,
  preparation variants and technical names. Using it as a lookup for imported ingredients is #113.

## Consequences

- About 400 of 544 catalog entries carry BLS values; existing databases pick them up on the next
  seed run, household ingredients are untouched.
- Some figures rise (cocoa, pesto, hummus, frozen rösti with its frying fat), many processed meats
  and cheeses drop.
- When the BLS publishes a new version, download it, rerun the script and review the diff.
