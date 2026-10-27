import { type PointerEvent, useRef } from "react";

/**
 * Helpers for transparent floating windows (toolbar, bubble). The window ignores the mouse by
 * default so clicks reach the apps underneath; interactive regions switch that off while hovered.
 */

let dragging = false;

const setIgnoreMouse = (ignore: boolean) => window.kadr.window.setIgnoreMouseEvents(ignore);

/** Spread onto every interactive region of a floating window. */
export const interactiveRegion = {
  onMouseEnter: () => setIgnoreMouse(false),
  onMouseLeave: () => {
    if (!dragging) setIgnoreMouse(true);
  },
};

/** Drags the whole window by a handle element (CSS app-region dragging would block hover events). */
export function useWindowDrag() {
  const offset = useRef<{ x: number; y: number } | null>(null);
  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (event.button !== 0) return;
      dragging = true;
      offset.current = { x: event.screenX - window.screenX, y: event.screenY - window.screenY };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      if (!offset.current) return;
      window.kadr.window.moveTo(
        Math.round(event.screenX - offset.current.x),
        Math.round(event.screenY - offset.current.y),
      );
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      dragging = false;
      offset.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
  };
}
