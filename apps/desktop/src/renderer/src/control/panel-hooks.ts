import { type RefObject, useEffect, useRef, useState } from "react";

/** Whether the panel window is currently shown (reported by main). */
export function usePanelVisible(): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => window.kadr.panel.onVisibilityChange(setVisible), []);
  return visible;
}

/** Keeps the frameless panel window exactly as tall as its content. */
export function useFitWindowToContent(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const report = () =>
      window.kadr.panel.resize(Math.ceil(element.getBoundingClientRect().height));
    const observer = new ResizeObserver(report);
    observer.observe(element);
    report();
    return () => observer.disconnect();
  }, [ref]);
}

/**
 * Live microphone level for the meter under the microphone row (like Loom). Writes straight to the
 * meter element's style instead of React state, so it doesn't re-render the panel 60 times a second.
 * The microphone is only open while `active` (panel visible, idle, microphone on).
 */
export function useMicLevelMeter(deviceId: string | undefined, active: boolean) {
  const meterRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const setLevel = (level: number) => {
      if (meterRef.current) meterRef.current.style.transform = `scaleX(${level})`;
    };
    setLevel(0);
    if (!active) return;

    let cancelled = false;
    let frame = 0;
    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;

    navigator.mediaDevices
      .getUserMedia({ audio: deviceId ? { deviceId: { exact: deviceId } } : true })
      .then((s) => {
        if (cancelled) {
          for (const track of s.getTracks()) track.stop();
          return;
        }
        stream = s;
        context = new AudioContext();
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        context.createMediaStreamSource(s).connect(analyser);
        const samples = new Float32Array(analyser.fftSize);
        let smoothed = 0;
        const tick = () => {
          analyser.getFloatTimeDomainData(samples);
          let sum = 0;
          for (const sample of samples) sum += sample * sample;
          const rms = Math.sqrt(sum / samples.length);
          // Fast attack, slow release, like a hardware meter.
          const level = Math.min(1, rms * 5);
          smoothed = level > smoothed ? level : smoothed * 0.9 + level * 0.1;
          setLevel(smoothed);
          frame = requestAnimationFrame(tick);
        };
        tick();
      })
      .catch(() => setLevel(0));

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      for (const track of stream?.getTracks() ?? []) track.stop();
      void context?.close();
    };
  }, [deviceId, active]);

  return meterRef;
}
