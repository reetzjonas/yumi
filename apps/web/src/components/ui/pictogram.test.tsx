import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Pictogram } from "./pictogram";

test.each([
  ["🍎", "🍋", "1f34e.svg"],
  ["unknown", "🍋", "1f34b.svg"],
  [null, "🍋", "1f34b.svg"],
  ["unknown", "unknown", "1f9fa.svg"],
  [null, null, "1f9fa.svg"],
] as const)(
  "Pictogram(%s, %s) uses the first bundled key",
  (icon, fallback, file) => {
    const html = renderToStaticMarkup(
      <Pictogram icon={icon} fallback={fallback} />,
    );

    expect(html).toContain(`src="/pictograms/${file}"`);
  },
);

test("pictograms are decorative, sized images with lazy loading", () => {
  const html = renderToStaticMarkup(
    <Pictogram icon="🍎" size={44} className="example" />,
  );

  for (const attribute of [
    'alt=""',
    'aria-hidden="true"',
    'width="44"',
    'height="44"',
    'loading="lazy"',
    'draggable="false"',
    'class="pictogram example"',
  ])
    expect(html).toContain(attribute);
});
