export type RecipeImportErrorCode =
  | "invalid_url"
  | "blocked_url"
  | "fetch_failed"
  | "timeout"
  | "response_too_large"
  | "redirect_limit"
  | "unsupported_content"
  | "no_recipe"
  | "invalid_recipe";

export class RecipeImportError extends Error {
  constructor(
    public readonly code: RecipeImportErrorCode,
    message: string = code,
  ) {
    super(message);
    this.name = "RecipeImportError";
  }
}

/** Keeps the already-fetched text available for an optional AI fallback. */
export class RecipeExtractionError extends RecipeImportError {
  constructor(
    code: "no_recipe" | "invalid_recipe",
    public readonly sourceUrl: string,
    public readonly readableText: string,
  ) {
    super(code);
  }
}
