const MAX_URL_LENGTH = 2000;
const MAX_TEXT_LENGTH = 10_000;

function httpUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const candidate = value.trim();
  if (
    candidate.length > MAX_URL_LENGTH ||
    !/^https?:\/\//i.test(candidate) ||
    /[\s\p{Cc}]/u.test(candidate)
  )
    return undefined;
  try {
    const url = new URL(candidate);
    if (!url.hostname || url.username || url.password) return undefined;
    return url.href.length <= MAX_URL_LENGTH ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** Share metadata is untrusted. Only the source URL enters the import form. */
export function shareTargetSearch(search: Record<string, unknown>): {
  url?: string;
} {
  const url = httpUrl(search.url);
  if (url) return { url };
  if (
    typeof search.text === "string" &&
    search.text.length <= MAX_TEXT_LENGTH
  ) {
    const textUrl = httpUrl(search.text);
    if (textUrl) return { url: textUrl };
    // Android share intents often put the page URL alongside prose in text.
    for (const match of search.text.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
      const candidate = httpUrl(match[0].replace(/[.,!?;:)\]}]+$/, ""));
      if (candidate) return { url: candidate };
    }
  }
  // Some senders place only the URL in title; never treat a page title as data.
  const titleUrl = httpUrl(search.title);
  return { url: titleUrl };
}
