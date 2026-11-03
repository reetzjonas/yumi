import { z } from "zod";
import { unitSchema } from "./units";

export const recurringItemInputSchema = z.object({
  label: z.string().trim().min(1).max(200),
  ingredientId: z.uuid().nullable().default(null),
  quantity: z.number().positive().max(1_000_000).nullable().default(null),
  unit: unitSchema.nullable().default(null),
  categoryId: z.uuid().nullable().default(null),
  /** 0 = Sunday ... 6 = Saturday */
  weekday: z.number().int().min(0).max(6),
  intervalWeeks: z.number().int().min(1).max(12).default(1),
});

const DAY_MS = 86_400_000;
const toMs = (date: string) => Date.parse(`${date}T00:00:00Z`);
const toDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The first date on or after `from` (YYYY-MM-DD) that falls on `weekday`. */
export function firstOccurrence(from: string, weekday: number) {
  const start = toMs(from);
  const offset = (weekday - new Date(start).getUTCDay() + 7) % 7;
  return toDate(start + offset * DAY_MS);
}

/** Moves a due date forward in whole intervals until it lies after `today`; missed runs collapse into one. */
export function advanceDue(due: string, intervalWeeks: number, today: string) {
  const step = intervalWeeks * 7 * DAY_MS;
  const passed = Math.floor((toMs(today) - toMs(due)) / step) + 1;
  return toDate(toMs(due) + Math.max(passed, 1) * step);
}
