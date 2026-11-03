import { parseUnit, type Unit } from "./units";

export interface ParsedIngredientLine {
  raw: string;
  quantity: number | null;
  /** upper bound of a range like "2-3" */
  quantityMax: number | null;
  unit: Unit | null;
  /** a measure we keep as text because it has no unit code ("Zehen", "Becher") */
  unitText: string | null;
  name: string;
  note: string | null;
  optional: boolean;
  /** 0..1; lines below ~0.7 should be reviewed or sent to the LLM fallback */
  confidence: number;
}

const FRACTION_GLYPHS: Record<string, string> = {
  "½": "1/2",
  "⅓": "1/3",
  "⅔": "2/3",
  "¼": "1/4",
  "¾": "3/4",
  "⅕": "1/5",
  "⅛": "1/8",
  "⅜": "3/8",
  "⅝": "5/8",
  "⅞": "7/8",
};

const NUM = String.raw`\d+(?:[.,]\d+)?`;
const QTY = String.raw`(?:\d+\s+\d+/\d+|\d+/\d+|${NUM})`;
const QUANTITY_RE = new RegExp(
  String.raw`^(${QTY})(?:\s*(?:-|–|—|bis|to)\s*(${QTY}))?`,
  "i",
);

const NUMBER_WORDS: Record<string, number> = {
  ein: 1,
  eine: 1,
  einen: 1,
  einem: 1,
  a: 1,
  an: 1,
  one: 1,
  zwei: 2,
  two: 2,
  drei: 3,
  three: 3,
  vier: 4,
  four: 4,
  fünf: 5,
  five: 5,
  halbe: 0.5,
  halber: 0.5,
  halbes: 0.5,
  halben: 0.5,
  half: 0.5,
};

const APPROX_RE = /^(?:ca\.?|circa|etwa|about|approx\.?|approximately)\s+/i;
const VAGUE_RE =
  /^(?:etwas|einige|ein paar|ein wenig|wenig|some|a few|a little|a bit of)\s+/i;
const BULLET_RE = /^[-–•*·]\s*/;

/** Units outside the unit codes that convert to one: cl -> 10 ml, oz -> 28.35 g. */
const SCALED_UNITS: Record<string, [Unit, number]> = {
  cl: ["ml", 10],
  dl: ["ml", 100],
  oz: ["g", 28.35],
  ounce: ["g", 28.35],
  ounces: ["g", 28.35],
  lb: ["g", 453.6],
  lbs: ["g", 453.6],
  pound: ["g", 453.6],
  pounds: ["g", 453.6],
};

const MEASURE_WORDS = new Set([
  "zehe",
  "zehen",
  "scheibe",
  "scheiben",
  "becher",
  "glas",
  "gläser",
  "stange",
  "stangen",
  "blatt",
  "blätter",
  "zweig",
  "zweige",
  "tropfen",
  "msp",
  "messerspitze",
  "handvoll",
  "würfel",
  "kugel",
  "kugeln",
  "clove",
  "cloves",
  "slice",
  "slices",
  "stick",
  "sticks",
  "sprig",
  "sprigs",
  "leaf",
  "leaves",
  "sheet",
  "sheets",
  "drop",
  "drops",
  "handful",
  "jar",
  "jars",
  "head",
  "heads",
]);

const MODIFIER_WORDS = new Set([
  "groß",
  "große",
  "großen",
  "großer",
  "großes",
  "klein",
  "kleine",
  "kleinen",
  "kleiner",
  "kleines",
  "mittelgroß",
  "mittelgroße",
  "mittelgroßen",
  "mittelgroßer",
  "mittlere",
  "mittleren",
  "mittlerer",
  "gestrichen",
  "gestrichene",
  "gestrichener",
  "gestr.",
  "gehäuft",
  "gehäufte",
  "gehäufter",
  "geh.",
  "knapp",
  "knappe",
  "knapper",
  "gut",
  "gute",
  "guter",
  "large",
  "small",
  "medium",
  "big",
  "heaped",
  "heaping",
  "level",
  "rounded",
  "scant",
  "generous",
]);

const NOTE_MARKER_RE =
  /\s+(?=(?:zum|zur|für|for|nach belieben|nach geschmack|to taste|optional)\b)/i;
const OPTIONAL_RE =
  /(?:^|[\s(,])(?:optional|evtl\.?|eventuell|nach belieben|if desired|if you like)(?=$|[\s),.])/i;

/** German recipe sites write optional plural endings as "Möhre(n)" or "Ei(er)". */
const PLURAL_SUFFIX_RE = /(\p{L})\((?:n|en|e|s|er|es|nen)\)(?=$|[\s,;.)])/gu;

function normalize(line: string) {
  let text = line.normalize("NFC").replace(/⁄/g, "/");
  for (const [glyph, fraction] of Object.entries(FRACTION_GLYPHS)) {
    text = text.replaceAll(glyph, ` ${fraction}`);
  }
  return text.replace(/\s+/g, " ").trim().replace(BULLET_RE, "");
}

function parseNumber(text: string): number | null {
  const parts = text.trim().split(/\s+/);
  let total = 0;
  for (const part of parts) {
    if (part.includes("/")) {
      const [num, den] = part.split("/").map(Number);
      if (!num || !den) return null;
      total += num / den;
    } else {
      total += Number(part.replace(",", "."));
    }
  }
  return Number.isFinite(total) ? total : null;
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}

/**
 * Rule-based parser for one recipe ingredient line, German or English:
 * "200 g Mehl, gesiebt", "1 1/2 EL Öl", "2-3 Zwiebeln", "Salz".
 * The name is not matched to the catalog here; that needs the database.
 */
export function parseIngredientLine(line: string): ParsedIngredientLine {
  let rest = normalize(line);
  const notes: string[] = [];
  let quantity: number | null = null;
  let quantityMax: number | null = null;
  let unit: Unit | null = null;
  let unitText: string | null = null;

  const optional = OPTIONAL_RE.test(rest);
  rest = rest.replace(PLURAL_SUFFIX_RE, "$1");
  rest = rest.replace(/\(([^)]*)\)/g, (_, inner: string) => {
    if (inner.trim()) notes.push(inner.trim());
    return " ";
  });
  rest = rest.replace(/\s+/g, " ").trim().replace(APPROX_RE, "");
  const vague = rest.match(VAGUE_RE);
  if (vague) {
    notes.push(vague[0].trim());
    rest = rest.slice(vague[0].length);
  }

  const match = rest.match(QUANTITY_RE);
  if (match?.[1]) {
    quantity = parseNumber(match[1]);
    quantityMax = match[2] ? parseNumber(match[2]) : null;
    rest = rest.slice(match[0].length).trim();
  } else {
    const word = rest.split(" ", 1)[0]?.toLowerCase() ?? "";
    const value = NUMBER_WORDS[word];
    if (value !== undefined && rest.includes(" ")) {
      quantity = value;
      rest = rest.slice(word.length).trim();
    }
  }

  const takeWord = () => {
    const word = rest.match(/^[\p{L}]+\.?(?=[\s,(]|$)/u)?.[0];
    return word ?? null;
  };
  const consume = (word: string) => {
    rest = rest.slice(word.length).trim();
  };

  for (let word = takeWord(); word; word = takeWord()) {
    const lower = word.toLowerCase();
    if (MODIFIER_WORDS.has(lower)) {
      notes.push(word);
      consume(word);
      continue;
    }
    if (unit || unitText) break;
    const scaled = SCALED_UNITS[lower.replace(/\.$/, "")];
    const parsed = parseUnit(word);
    if (parsed) {
      unit = parsed;
    } else if (scaled) {
      unit = scaled[0];
      if (quantity !== null) quantity = round(quantity * scaled[1]);
      if (quantityMax !== null) quantityMax = round(quantityMax * scaled[1]);
    } else if (MEASURE_WORDS.has(lower.replace(/\.$/, ""))) {
      unitText = word;
    } else {
      break;
    }
    consume(word);
  }
  rest = rest.replace(/^(?:of|von)\s+/i, "");

  const comma = rest.indexOf(",");
  if (comma >= 0) {
    notes.push(rest.slice(comma + 1).trim());
    rest = rest.slice(0, comma);
  }
  const markerAt = rest.search(NOTE_MARKER_RE);
  if (markerAt >= 0) {
    notes.push(rest.slice(markerAt).trim());
    rest = rest.slice(0, markerAt);
  }
  const name = rest.replace(/\s+/g, " ").trim();

  const note = notes.filter(Boolean).join(", ") || null;
  return {
    raw: line,
    quantity,
    quantityMax,
    unit,
    unitText,
    name,
    note,
    optional,
    confidence: confidenceOf(name, quantity, unit, unitText),
  };
}

function confidenceOf(
  name: string,
  quantity: number | null,
  unit: Unit | null,
  unitText: string | null,
) {
  if (!name) return 0;
  let score = 1;
  if (quantity === null && unit === null) score -= 0.15;
  if (unitText) score -= 0.3;
  if (/\d/.test(name)) score -= 0.4;
  if (/\s(?:und|and|oder|or)\s|\//i.test(name)) score -= 0.3;
  if (name.split(" ").length > 4) score -= 0.2;
  return Math.max(0, Math.round(score * 100) / 100);
}
