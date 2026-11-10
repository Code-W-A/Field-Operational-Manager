/** Physical bytes per photo; decimal MB, inclusive. */
export const MAX_PHOTO_BYTES = 10_000_000;
export const LEGACY_FILE_BYTES = 3_000_000;
export const PHOTO_TOO_LARGE_MESSAGE = "Alege o fotografie de cel mult 10 MB.";
export function fileSizeLimit(contentType: string) {
  return contentType === "image/jpeg" || contentType === "image/png"
    ? MAX_PHOTO_BYTES
    : LEGACY_FILE_BYTES;
}
