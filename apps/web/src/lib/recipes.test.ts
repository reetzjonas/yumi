import { expect, test } from "bun:test";
import type { Locale } from "./i18n";
import { cookedAgoLabel } from "./recipes";

const now = new Date(2026, 10, 4, 18, 0);
const daysAgo = (days: number) =>
  new Date(2026, 10, 4 - days, 9, 30).toISOString();

const cases: [string | null, Locale, string][] = [
  [null, "de", "noch nie gekocht"],
  [daysAgo(0), "de", "heute gekocht"],
  [daysAgo(1), "de", "gestern gekocht"],
  [daysAgo(6), "de", "vor 6 Tagen gekocht"],
  [daysAgo(14), "de", "vor 2 Wochen gekocht"],
  [daysAgo(120), "de", "vor 4 Monaten gekocht"],
  [daysAgo(400), "de", "letztes Jahr gekocht"],
  [daysAgo(14), "en", "Cooked 2 weeks ago"],
  [daysAgo(1), "en", "Cooked yesterday"],
];

test("cookedAgoLabel is relative to today in both locales", () => {
  for (const [cookedAt, locale, expected] of cases) {
    expect(String(cookedAgoLabel(cookedAt, now, locale))).toBe(expected);
  }
});
