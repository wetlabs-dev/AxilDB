/** Shared browser/server limits. Sharp still validates the actual file contents. */
export const MAX_PHOTO_BYTES = 25 * 1024 * 1024
export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/tiff,image/avif'
export const SUPPORTED_PHOTO_TYPES = new Set(PHOTO_ACCEPT.split(','))
export const photoUploadErrors: Record<string, string> = {
  missing_photo: 'Choose an image file.', unsupported_format: 'Choose a JPEG, PNG, WebP, GIF, TIFF or AVIF image.',
  too_large: 'Choose an image smaller than 25 MB.', processing_failed: 'This image could not be processed. Try a supported image file.',
  upload_failed: 'The photo could not be saved. Your selection has been kept; try again.',
  historical_record_read_only: 'This plant is unavailable or read-only.',
}
