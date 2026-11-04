import { describe, expect, test } from "bun:test";
import { detectStepTimers } from "./step-timers";

describe("detectStepTimers", () => {
  test.each([
    ["Für 20 Minuten backen.", 1200, "20 Minuten"],
    ["Eine Minute rühren, dann 1 Minute warten.", 60, "1 Minute"],
    ["Cook for 12 minutes.", 720, "12 minutes"],
    ["Wait 1 minute.", 60, "1 minute"],
    ["30 Sekunden schlagen.", 30, "30 Sekunden"],
    ["1 Sekunde warten.", 1, "1 Sekunde"],
    ["Rest for 45 seconds.", 45, "45 seconds"],
    ["Wait 1 second.", 1, "1 second"],
    ["2 Stunden gehen lassen.", 7200, "2 Stunden"],
    ["1 Stunde ruhen lassen.", 3600, "1 Stunde"],
    ["Bake for 2 hours.", 7200, "2 hours"],
    ["Rest 1 hour.", 3600, "1 hour"],
    ["1,5 Std. ruhen lassen.", 5400, "1,5 Std."],
    ["Rest 0.5 hrs.", 1800, "0.5 hrs."],
    ["2 hr simmer.", 7200, "2 hr"],
    ["10min bei 180 °C backen.", 600, "10min"],
    ["10 MIN. backen.", 600, "10 MIN."],
    ["Wait 2 mins.", 120, "2 mins."],
    ["15 Sek. rühren.", 15, "15 Sek."],
    ["10 sec. stir.", 10, "10 sec."],
    ["Wait 2 secs.", 2, "2 secs."],
    ["2 h kühlen.", 7200, "2 h"],
    ["Wait 3 m.", 180, "3 m."],
    ["Wait 5 s.", 5, "5 s."],
    ["0,025 Minuten warten.", 2, "0,025 Minuten"],
    ["2\u00a0Minuten ruhen.", 120, "2\u00a0Minuten"],
    ["168 hours ferment.", 604800, "168 hours"],
  ])("detects numeric durations in %p", (text, seconds, label) => {
    expect(detectStepTimers(text)).toEqual([{ seconds, label }]);
  });

  test.each([
    ["15–20 Minuten backen.", 1200, "15–20 Minuten"],
    ["1-2 hours rest.", 7200, "1-2 hours"],
    ["15 — 20 seconds stir.", 20, "15 — 20 seconds"],
    ["1 bis 2 Stunden kühlen.", 7200, "1 bis 2 Stunden"],
    ["10 to 15 mins.", 900, "10 to 15 mins."],
    ["0,5–1,5 Stunden ruhen.", 5400, "0,5–1,5 Stunden"],
  ])("uses the upper range bound in %p", (text, seconds, label) => {
    expect(detectStepTimers(text)).toEqual([{ seconds, label }]);
  });

  test.each([
    ["Rest 1 hour 30 minutes.", 5400, "1 hour 30 minutes"],
    ["1 Stunde und 15 Minuten ruhen.", 4500, "1 Stunde und 15 Minuten"],
    ["Wait 2 minutes and 30 seconds.", 150, "2 minutes and 30 seconds"],
    ["1 h, 20 min, 15 sec. kochen.", 4815, "1 h, 20 min, 15 sec."],
    ["1–2 hours 10 minutes rest.", 7800, "1–2 hours 10 minutes"],
    ["0 hours 5 minutes rest.", 300, "0 hours 5 minutes"],
    ["0.01 minutes 0.4 seconds wait.", 1, "0.01 minutes 0.4 seconds"],
  ])("combines descending units in %p", (text, seconds, label) => {
    expect(detectStepTimers(text)).toEqual([{ seconds, label }]);
  });

  test.each([
    [
      "10 Minuten backen, dann 5 Minuten ruhen lassen.",
      [
        { seconds: 600, label: "10 Minuten" },
        { seconds: 300, label: "5 Minuten" },
      ],
    ],
    [
      "Cook 1 hour, then rest 30 minutes.",
      [
        { seconds: 3600, label: "1 hour" },
        { seconds: 1800, label: "30 minutes" },
      ],
    ],
    [
      "Wait 5 minutes or 10 minutes.",
      [
        { seconds: 300, label: "5 minutes" },
        { seconds: 600, label: "10 minutes" },
      ],
    ],
    [
      "Stir 30 seconds and 2 minutes.",
      [
        { seconds: 30, label: "30 seconds" },
        { seconds: 120, label: "2 minutes" },
      ],
    ],
  ])("keeps separate durations in %p", (text, expected) => {
    expect(detectStepTimers(text)).toEqual(expected);
  });

  test.each([
    "",
    "200 g Mehl, 2 EL Öl, 150 ml Milch und 3 Eier.",
    "2 tbsp oil, 4 cups flour, 1 pinch salt.",
    "Bei 180 °C goldbraun backen.",
    "10 minutesauce und 2 Stundenlohn.",
    "Vitamin B12min und abc10 min.",
    "0 Sekunden warten.",
    "0 hours 0 minutes.",
    "0.001 seconds.",
    "-5 Minuten warten.",
    "−5 minutes.",
    "+5 minutes.",
    "1/2 hour.",
    "1.2.3 minutes.",
    "1,000,000 minutes.",
    "1e3 minutes.",
    "20–15 Minuten.",
    "169 hours.",
    "168 hours 1 second.",
    "999999999999999999999999999999 hours.",
  ])("ignores non-durations and invalid durations in %p", (text) => {
    expect(detectStepTimers(text)).toEqual([]);
  });

  test("keeps a valid duration after an invalid one", () => {
    expect(
      detectStepTimers("999999 hours backen, dann 5 Minuten ruhen."),
    ).toEqual([{ seconds: 300, label: "5 Minuten" }]);
  });
});
