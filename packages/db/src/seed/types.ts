import type { Unit } from "@yumi/shared";
import type { CategoryKey } from "./categories";

export type SeedIngredient = {
  key: string;
  de: string;
  en: string;
  category: CategoryKey;
  unit: Unit;
  synonyms?: string[];
  densityGPerMl?: number;
  pieceWeightG?: number;
  packs?: Array<[quantity: number, unit: Unit]>;
  icon?: string;
};
