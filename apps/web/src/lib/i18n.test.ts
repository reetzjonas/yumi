import { describe, expect, test } from "bun:test";
import de from "../../messages/de.json";
import en from "../../messages/en.json";
import { formatDate, formatNumber, translateApiError } from "./i18n";

describe("locale messages", () => {
  test("every message exists in both locales", () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
    for (const message of [...Object.values(de), ...Object.values(en)]) {
      expect(message.trim().length).toBeGreaterThan(0);
    }
  });

  test("known API error codes resolve in both locales", () => {
    const codes = [
      "unauthorized",
      "no_active_household",
      "not_a_member",
      "forbidden",
      "not_found",
      "invite_invalid",
      "invalid_input",
      "internal_error",
    ] as const;
    for (const code of codes) {
      expect(translateApiError(code, "de")).toBe(de[`errors.${code}`]);
      expect(translateApiError(code, "en")).toBe(en[`errors.${code}`]);
    }
  });

  test("unknown API error codes use the generic translated message", () => {
    for (const code of ["unknown", "__proto__", "constructor"]) {
      expect(translateApiError(code, "de")).toBe(de["errors.generic"]);
      expect(translateApiError(code, "en")).toBe(en["errors.generic"]);
    }
  });
});

test("Intl helpers use the requested locale", () => {
  expect(formatNumber(1234.5, {}, "de")).toBe("1.234,5");
  expect(formatNumber(1234.5, {}, "en")).toBe("1,234.5");
  const date = new Date("2026-11-03T12:00:00Z");
  const options = { month: "long", timeZone: "UTC" } as const;
  expect(formatDate(date, options, "de")).toBe("November");
  expect(formatDate(date, { ...options, month: "short" }, "en")).toBe("Nov");
});
