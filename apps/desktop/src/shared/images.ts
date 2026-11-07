/** Image types accepted as a camera background, identified by their first bytes. */
export type BackgroundImageType = "image/png" | "image/jpeg" | "image/webp";

/** Largest background image Kadr accepts (a 4K photo is well under this). */
export const MAX_BACKGROUND_IMAGE_BYTES = 20 * 1024 * 1024;

/** The image type of `bytes` from its signature, or null for anything else. */
export function detectImageType(bytes: Uint8Array): BackgroundImageType | null {
  const startsWith = (signature: number[], offset = 0) =>
    signature.every((byte, index) => bytes[offset + index] === byte);
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  // "RIFF" <size> "WEBP"
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }
  return null;
}
