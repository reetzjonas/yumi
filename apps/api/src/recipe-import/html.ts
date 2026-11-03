import { RecipeImportError } from "./errors";

export interface HtmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: (HtmlNode | string)[];
}

const VOID = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);
const BLOCK = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "br",
  "dd",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "td",
  "th",
  "tr",
  "ul",
]);
const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  auml: "\u00e4",
  ouml: "\u00f6",
  uuml: "\u00fc",
  Auml: "\u00c4",
  Ouml: "\u00d6",
  Uuml: "\u00dc",
  szlig: "\u00df",
  eacute: "\u00e9",
  Eacute: "\u00c9",
  egrave: "\u00e8",
  agrave: "\u00e0",
  acirc: "\u00e2",
  ecirc: "\u00ea",
  ocirc: "\u00f4",
  ugrave: "\u00f9",
  frac12: "\u00bd",
  frac14: "\u00bc",
  frac34: "\u00be",
  deg: "\u00b0",
  ndash: "\u2013",
  mdash: "\u2014",
  hellip: "\u2026",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201c",
  rdquo: "\u201d",
  bull: "\u2022",
  middot: "\u00b7",
  times: "\u00d7",
  copy: "\u00a9",
  reg: "\u00ae",
  thinsp: " ",
  ensp: " ",
  emsp: " ",
};

export function decodeEntities(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi,
    (original, entity: string) => {
      if (!entity.startsWith("#")) return ENTITIES[entity] ?? original;
      const value =
        entity[1]?.toLowerCase() === "x"
          ? Number.parseInt(entity.slice(2), 16)
          : Number.parseInt(entity.slice(1), 10);
      return value > 0 &&
        value <= 0x10ffff &&
        !(value >= 0xd800 && value <= 0xdfff)
        ? String.fromCodePoint(value)
        : "\ufffd";
    },
  );
}

export function parseHtml(html: string): HtmlNode {
  const root: HtmlNode = { tag: "root", attrs: {}, children: [] };
  const stack = [root];
  let count = 0;
  new HTMLRewriter()
    .on("*", {
      element(element) {
        if (++count > 50_000 || stack.length > 128) {
          throw new RecipeImportError("response_too_large");
        }
        const node: HtmlNode = {
          tag: element.tagName,
          attrs: Object.fromEntries(element.attributes),
          children: [],
        };
        // HTMLRewriter reports explicit end tags only. Respect common omitted
        // end tags so adjacent microdata properties do not swallow each other.
        const closing =
          node.tag === "li"
            ? ["li"]
            : ["dt", "dd"].includes(node.tag)
              ? ["dt", "dd"]
              : node.tag === "tr"
                ? ["tr"]
                : ["td", "th"].includes(node.tag)
                  ? ["td", "th"]
                  : node.tag === "option"
                    ? ["option"]
                    : BLOCK.has(node.tag)
                      ? ["p"]
                      : [];
        for (let index = stack.length - 1; index > 0; index--) {
          const tag = stack[index]?.tag ?? "";
          if (closing.includes(tag)) {
            stack.length = index;
            break;
          }
          if (["ul", "ol", "dl", "table", "select"].includes(tag)) break;
        }
        stack[stack.length - 1]?.children.push(node);
        if (VOID.has(node.tag) || element.selfClosing) return;
        stack.push(node);
        element.onEndTag(() => {
          const index = stack.indexOf(node);
          if (index >= 1) stack.length = index;
        });
      },
    })
    .onDocument({
      text(chunk) {
        if (chunk.text) stack[stack.length - 1]?.children.push(chunk.text);
      },
    })
    .transform(html);
  return root;
}

export function nodes(root: HtmlNode): HtmlNode[] {
  const result: HtmlNode[] = [];
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (!node) break;
    result.push(node);
    for (let index = node.children.length - 1; index >= 0; index--) {
      const child = node.children[index];
      if (child && typeof child !== "string") stack.push(child);
    }
  }
  return result;
}

export function nodeText(node: HtmlNode, readable = false): string {
  if (
    readable &&
    (["script", "style", "noscript", "template", "nav", "footer"].includes(
      node.tag,
    ) ||
      "hidden" in node.attrs ||
      node.attrs["aria-hidden"] === "true")
  )
    return "";
  return node.children
    .map((child) => {
      if (typeof child === "string") return child;
      const value = nodeText(child, readable);
      return BLOCK.has(child.tag) ? ` ${value} ` : value;
    })
    .join("");
}

export function cleanText(value: string): string {
  const plain = value.includes("<") ? nodeText(parseHtml(value), true) : value;
  return decodeEntities(plain).replace(/\s+/g, " ").trim();
}

/** Plain text only, suitable as bounded input to a future AI extraction step. */
export function readableText(html: string): string {
  return cleanText(nodeText(parseHtml(html), true));
}
