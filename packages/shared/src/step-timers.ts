const NUMBER = String.raw`\d+(?:[.,]\d+)?`;
const UNIT = String.raw`stunden?|hours?|(?:std|hrs?|h)\.?|minuten?|minutes?|(?:mins?|m)\.?|sekunden?|seconds?|(?:sek|secs?|s)\.?`;
const DURATION = new RegExp(
  String.raw`(?<![\p{L}\p{N}_.,/+\-–—−])(${NUMBER})(?:\s*(?:[-–—]|bis|to)\s*(${NUMBER}))?\s*(${UNIT})(?![\p{L}\p{N}_])`,
  "giu",
);
const MAX_SECONDS = 7 * 24 * 60 * 60;

/**
 * Detect numeric German/English durations, preserving their text as labels.
 * Ranges use the upper bound. Adjacent, descending units form one duration.
 * Results are rounded to whole seconds; only 1 second through 7 days is valid.
 */
export function detectStepTimers(
  text: string,
): { readonly seconds: number; readonly label: string }[] {
  // Mutable while collecting the components of each duration.
  const durations: {
    seconds: number;
    start: number;
    end: number;
    factor: number;
  }[] = [];

  for (const match of text.matchAll(DURATION)) {
    const [label, rawLower, rawUpper, rawUnit] = match;
    if (rawLower === undefined || rawUnit === undefined) continue;

    const unit = rawUnit.toLowerCase();
    const factor =
      unit.startsWith("h") || unit.startsWith("st")
        ? 3600
        : unit.startsWith("m")
          ? 60
          : 1;
    const lower = Number(rawLower.replace(",", "."));
    const upper = Number((rawUpper ?? rawLower).replace(",", "."));
    const seconds = lower <= upper ? upper * factor : Number.NaN;
    const end = match.index + label.length;
    const previous = durations.at(-1);

    if (
      previous &&
      factor < previous.factor &&
      /^\s*(?:(?:und|and|,)\s*)?$/iu.test(text.slice(previous.end, match.index))
    ) {
      previous.seconds += seconds;
      previous.end = end;
      previous.factor = factor;
    } else {
      durations.push({ seconds, start: match.index, end, factor });
    }
  }

  return durations.flatMap(({ seconds, start, end }) => {
    const rounded = Math.round(seconds);
    return rounded >= 1 && rounded <= MAX_SECONDS
      ? [{ seconds: rounded, label: text.slice(start, end) }]
      : [];
  });
}
