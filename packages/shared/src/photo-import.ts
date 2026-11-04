export const PHOTO_IMPORT_MAX_COUNT = 5;
export const PHOTO_IMPORT_MAX_BYTES = 10 * 1024 * 1024;
export const PHOTO_IMPORT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type PhotoImportUploadError =
  | "photo_import_count"
  | "photo_import_type"
  | "photo_import_size";

/** Metadata checks shared by the picker and the upload boundary. */
export function photoImportUploadError(
  files: readonly { readonly size: number; readonly type: string }[],
): PhotoImportUploadError | null {
  if (files.length < 1 || files.length > PHOTO_IMPORT_MAX_COUNT)
    return "photo_import_count";
  if (
    files.some(
      (file) => !PHOTO_IMPORT_MIME_TYPES.some((type) => type === file.type),
    )
  )
    return "photo_import_type";
  if (files.some((file) => file.size < 1 || file.size > PHOTO_IMPORT_MAX_BYTES))
    return "photo_import_size";
  return null;
}
