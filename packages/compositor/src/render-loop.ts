/**
 * Starts a fixed-rate render loop and returns a function that stops it.
 *
 * The loop is driven by a Web Worker timer because browsers pause `requestAnimationFrame` and
 * throttle main-thread timers in hidden tabs, which would freeze a recording as soon as the user
 * switches to the app they are recording.
 */
export function startRenderLoop(fps: number, onFrame: (nowMs: number) => void): () => void {
  const intervalMs = 1000 / fps;

  if (typeof Worker === "undefined") {
    const id = setInterval(() => onFrame(performance.now()), intervalMs);
    return () => clearInterval(id);
  }

  const source = `setInterval(() => postMessage(0), ${intervalMs});`;
  const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  const worker = new Worker(url);
  worker.onmessage = () => onFrame(performance.now());

  return () => {
    worker.terminate();
    URL.revokeObjectURL(url);
  };
}
