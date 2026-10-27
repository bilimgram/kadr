/** Request selected devices; a camera failure must not also silence the microphone. */
export async function requestUserMedia(
  request: (constraints: MediaStreamConstraints) => Promise<MediaStream>,
  options: { withCamera: boolean; withMicrophone: boolean },
): Promise<MediaStream | null> {
  if (!options.withCamera && !options.withMicrophone) return null;
  const audio = { echoCancellation: true, noiseSuppression: true };
  try {
    return await request({
      video: options.withCamera ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      audio: options.withMicrophone ? audio : false,
    });
  } catch {
    if (!options.withCamera || !options.withMicrophone) return null;
    return request({ video: false, audio }).catch(() => null);
  }
}
