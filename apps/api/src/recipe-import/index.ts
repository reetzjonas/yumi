import { TextDecoder } from "node:util";
import { RecipeImportError } from "./errors";
import { type ExtractedRecipe, extractRecipe } from "./extract";
import { fetchResource, type RecipeHttpTransport } from "./transport";

export type { RecipeImportErrorCode } from "./errors";
export { RecipeExtractionError, RecipeImportError } from "./errors";
export {
  durationMinutes,
  type ExtractedRecipe,
  extractRecipe,
  type RecipeImportDraft,
} from "./extract";
export { readableText } from "./html";

export interface ImportedRecipeImage {
  bytes: Uint8Array;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  sourceUrl: string;
}

export interface ImportedRecipe extends Omit<ExtractedRecipe, "imageUrl"> {
  image: ImportedRecipeImage | null;
  warnings: string[];
}

export async function downloadRecipeImage(
  url: string,
  transport?: RecipeHttpTransport,
): Promise<ImportedRecipeImage> {
  const resource = await fetchResource(
    url,
    {
      maxBytes: 10 * 1024 * 1024,
      accept: "image/jpeg, image/png, image/webp",
    },
    transport,
  );
  const bytes = resource.bytes;
  const declared = resource.headers
    .get("content-type")
    ?.split(";")[0]
    ?.trim()
    .toLowerCase();
  const signature = Buffer.from(bytes);
  const mimeType =
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      ? "image/jpeg"
      : signature
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ? "image/png"
        : signature.toString("ascii", 0, 4) === "RIFF" &&
            signature.toString("ascii", 8, 12) === "WEBP"
          ? "image/webp"
          : null;
  if (!mimeType || declared !== mimeType) {
    throw new RecipeImportError("unsupported_content");
  }
  return { bytes, mimeType, sourceUrl: resource.sourceUrl };
}

/** Produces review data only. It never writes recipes or image files. */
export async function importRecipe(
  url: string,
  transport?: RecipeHttpTransport,
): Promise<ImportedRecipe> {
  const resource = await fetchResource(
    url,
    {
      maxBytes: 2 * 1024 * 1024,
      accept: "text/html, application/xhtml+xml",
    },
    transport,
  );
  const contentType = resource.headers
    .get("content-type")
    ?.split(";")[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== "text/html" && contentType !== "application/xhtml+xml") {
    throw new RecipeImportError("unsupported_content");
  }
  const charset =
    resource.headers
      .get("content-type")
      ?.match(/charset=["']?([^;"'\s]+)/i)?.[1] ?? "utf-8";
  let html: string;
  try {
    html = new TextDecoder(charset).decode(resource.bytes);
  } catch {
    throw new RecipeImportError("unsupported_content");
  }
  const { imageUrl, ...extracted } = extractRecipe(html, resource.sourceUrl);
  let image: ImportedRecipeImage | null = null;
  const warnings: string[] = [];
  if (imageUrl) {
    try {
      image = await downloadRecipeImage(imageUrl, transport);
    } catch (error) {
      if (!(error instanceof RecipeImportError)) throw error;
      warnings.push(`image_${error.code}`);
    }
  }
  return { ...extracted, image, warnings };
}
