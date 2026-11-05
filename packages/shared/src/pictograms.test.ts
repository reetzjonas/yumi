import { expect, test } from "bun:test";
import { pictogramFile } from "./pictograms";

test.each([
  ["🍎", "1f34e.svg"],
  ["🌶️", "1f336.svg"],
  ["🌶", "1f336.svg"],
  ["☕️", "2615.svg"],
  ["🧺", "1f9fa.svg"],
  ["💧", "1f4a7.svg"],
  ["unsupported", null],
  ["", null],
  [null, null],
  [undefined, null],
] as const)("pictogramFile(%s) resolves only bundled keys", (emoji, file) => {
  expect(pictogramFile(emoji)).toBe(file);
});
