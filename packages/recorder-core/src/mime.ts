/** Container/codec candidates in order of preference. MP4 first: it plays everywhere. */
export const RECORDING_MIME_CANDIDATES = [
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
] as const;

/** Picks the first MIME type the current browser's `MediaRecorder` supports. */
export function pickMimeType(
  isTypeSupported: (type: string) => boolean = (type) => MediaRecorder.isTypeSupported(type),
  candidates: readonly string[] = RECORDING_MIME_CANDIDATES,
): string {
  const supported = candidates.find((type) => isTypeSupported(type));
  if (!supported) throw new Error("No supported recording format found");
  return supported;
}

/** File extension for a recording MIME type. */
export function extensionForMimeType(mimeType: string): "mp4" | "webm" {
  return mimeType.startsWith("video/mp4") ? "mp4" : "webm";
}
