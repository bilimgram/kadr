export interface MixedAudio {
  stream: MediaStream;
  dispose(): void;
}

/**
 * Mixes the audio tracks of several streams (e.g. microphone + system audio) into one track, because
 * `MediaRecorder` reliably records only a single audio track.
 */
export function mixAudioStreams(streams: readonly MediaStream[]): MixedAudio {
  const context = new AudioContext();
  const destination = context.createMediaStreamDestination();
  const sources = streams
    .filter((stream) => stream.getAudioTracks().length > 0)
    .map((stream) => {
      const source = context.createMediaStreamSource(stream);
      source.connect(destination);
      return source;
    });

  return {
    stream: destination.stream,
    dispose() {
      for (const source of sources) source.disconnect();
      void context.close();
    },
  };
}

/** Stops every track of the given streams (releases camera, mic and screen capture). */
export function stopStreams(...streams: Array<MediaStream | null | undefined>): void {
  for (const stream of streams) {
    for (const track of stream?.getTracks() ?? []) track.stop();
  }
}
