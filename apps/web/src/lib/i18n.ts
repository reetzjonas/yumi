import { m } from "@/paraglide/messages";
import { getLocale, type Locale, setLocale } from "@/paraglide/runtime";

export { getLocale, type Locale, setLocale };

// Paraglide persists the override and reloads the same URL, so the complete
// document (including route content and metadata) uses the selected locale.
export function useLocale() {
  return { locale: getLocale(), setLocale };
}

export function formatDate(
  value: Date | number,
  options?: Intl.DateTimeFormatOptions,
  locale: Locale = getLocale(),
) {
  return new Intl.DateTimeFormat(locale, options).format(value);
}

export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
  locale: Locale = getLocale(),
) {
  return new Intl.NumberFormat(locale, options).format(value);
}

export function translateApiError(
  code: string,
  locale: Locale = getLocale(),
): string {
  const options = { locale };
  switch (code) {
    case "unauthorized":
      return m["errors.unauthorized"]({}, options);
    case "no_active_household":
      return m["errors.no_active_household"]({}, options);
    case "not_a_member":
      return m["errors.not_a_member"]({}, options);
    case "forbidden":
      return m["errors.forbidden"]({}, options);
    case "not_found":
      return m["errors.not_found"]({}, options);
    case "invite_invalid":
      return m["errors.invite_invalid"]({}, options);
    case "invalid_input":
      return m["errors.invalid_input"]({}, options);
    case "invalid_ingredient":
      return m["errors.invalid_ingredient"]({}, options);
    case "invalid_category":
      return m["errors.invalid_category"]({}, options);
    case "invalid_image":
      return m["errors.invalid_image"]({}, options);
    case "image_too_large":
      return m["errors.image_too_large"]({}, options);
    case "internal_error":
      return m["errors.internal_error"]({}, options);
    default:
      return m["errors.generic"]({}, options);
  }
}
