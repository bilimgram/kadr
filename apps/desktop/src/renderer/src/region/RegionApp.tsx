import { Button, cx, IconButton } from "@kadr/ui";
import { Maximize, X } from "lucide-react";
import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { Region, RegionContext } from "../../../shared/api";
import type { Point, Rect } from "../../../shared/placement";
import {
  ASPECT_PRESETS,
  type AspectPreset,
  CLICK_TOLERANCE,
  containsPoint,
  MIN_REGION_SIZE,
  moveRect,
  outputSize,
  RESIZE_HANDLES,
  type ResizeHandle,
  rectFromDrag,
  resizeRect,
  resizeTo,
  snapPoint,
  snapRect,
  withAspectRatio,
} from "../../../shared/region";

type Drag =
  | { kind: "draw"; anchor: Point; started: boolean }
  | { kind: "move"; origin: Point; start: Rect }
  | { kind: "resize"; handle: ResizeHandle; start: Rect };

const icon = { className: "k-icon", "aria-hidden": true } as const;
/** Space between the selection and the toolbar, and between the toolbar and the screen edge. */
const TOOLBAR_GAP = 12;

/** One overlay per display; it asks main which display it covers before drawing anything. */
export function RegionApp() {
  const [context, setContext] = useState<RegionContext | null>(null);
  useEffect(() => {
    void window.kadr.region.getContext().then(setContext);
  }, []);
  return context ? <RegionPicker context={context} /> : null;
}

/**
 * Full-screen area picker: drag to draw, drag inside to move, drag the handles to resize. Click
 * selects the whole display. Arrow keys move (Shift: 10 px), Alt+arrows resize, Enter records,
 * Escape cancels. Coordinates are CSS pixels of this overlay, which are the display's DIPs.
 */
function RegionPicker({ context }: { context: RegionContext }) {
  const bounds: Rect = { x: 0, y: 0, width: context.bounds.width, height: context.bounds.height };
  const toLocal = (region: Region): Rect => ({
    x: region.x - context.bounds.x,
    y: region.y - context.bounds.y,
    width: region.width,
    height: region.height,
  });
  const toRegion = (rect: Rect): Region => ({
    displayId: context.displayId,
    x: Math.round(rect.x + context.bounds.x),
    y: Math.round(rect.y + context.bounds.y),
    // A selection just being drawn can be thinner than a pixel; main validates the final size.
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  });

  const [selection, setSelection] = useState<Rect | null>(() =>
    context.selection ? toLocal(context.selection) : null,
  );
  // The latest selection for pointer handlers, which outlive a render.
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const [elsewhere, setElsewhere] = useState<Region | null>(null);
  const [aspect, setAspect] = useState<AspectPreset>("free");
  const [pointer, setPointer] = useState<Point | null>(null);
  const [dragging, setDragging] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const drag = useRef<Drag | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const instructionsId = useId();
  const ratio = ASPECT_PRESETS.find((preset) => preset.id === aspect)?.ratio ?? null;

  useEffect(() => rootRef.current?.focus(), []);

  // Another display took the selection: this one clears its own.
  useEffect(
    () =>
      window.kadr.region.onChange((region) => {
        if (region?.displayId === context.displayId) return;
        setElsewhere(region);
        if (region) setSelection(null);
      }),
    [context.displayId],
  );

  /** Settles a selection: shared with the other displays and announced to screen readers. */
  const commit = (rect: Rect | null) => {
    setSelection(rect);
    window.kadr.region.update(rect ? toRegion(rect) : null);
    if (rect) {
      const size = outputSize(rect, context.scaleFactor);
      setAnnouncement(`Selected ${size.width} by ${size.height} pixels`);
    }
  };
  const confirm = () => {
    const target = selectionRef.current ? toRegion(selectionRef.current) : elsewhere;
    if (target) window.kadr.region.confirm(target);
  };
  const cancel = () => window.kadr.region.cancel();

  const localPoint = (event: PointerEvent) => ({ x: event.clientX, y: event.clientY });

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const point = localPoint(event);
    const handle = (event.target as HTMLElement).dataset.handle as ResizeHandle | undefined;
    const current = selectionRef.current;
    if (current && handle) drag.current = { kind: "resize", handle, start: current };
    else if (current && containsPoint(current, point)) {
      drag.current = { kind: "move", origin: point, start: current };
    } else {
      drag.current = { kind: "draw", anchor: snapPoint(point, bounds), started: false };
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  /** The selection a drag produces at `point`; `final` applies the minimum size. */
  const dragTo = (current: Drag, point: Point, final: boolean): Rect => {
    switch (current.kind) {
      case "draw":
        return rectFromDrag(
          current.anchor,
          snapPoint(point, bounds),
          bounds,
          ratio,
          final ? MIN_REGION_SIZE : 0,
        );
      case "move":
        return snapRect(
          moveRect(current.start, point.x - current.origin.x, point.y - current.origin.y, bounds),
          bounds,
        );
      case "resize":
        return resizeRect(current.start, current.handle, snapPoint(point, bounds), bounds, ratio);
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const point = localPoint(event);
    setPointer(point);
    const current = drag.current;
    if (!current) return;
    if (current.kind === "draw" && !current.started) {
      const distance = Math.hypot(point.x - current.anchor.x, point.y - current.anchor.y);
      if (distance < CLICK_TOLERANCE) return;
      current.started = true;
      // Pickers on other displays drop their selection as soon as a new one starts here.
      const rect = dragTo(current, point, false);
      window.kadr.region.update(toRegion(rect));
      setSelection(rect);
      return;
    }
    setSelection(dragTo(current, point, false));
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!current) return;
    // A click without a drag selects the whole display.
    if (current.kind === "draw" && !current.started) commit(bounds);
    else commit(dragTo(current, localPoint(event), true));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const inField = target instanceof HTMLInputElement;
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.preventDefault();
      cancel();
      return;
    }
    if (event.key === "Enter") {
      // Buttons and fields handle their own Enter.
      if (inField || target instanceof HTMLButtonElement) return;
      event.preventDefault();
      confirm();
      return;
    }
    if (inField) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      commit(bounds);
      return;
    }
    const step = event.shiftKey ? 10 : 1;
    const delta: Record<string, Point> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };
    const move = delta[event.key];
    const current = selectionRef.current;
    if (!move || !current) return;
    event.preventDefault();
    commit(
      event.altKey
        ? resizeTo(current, current.width + move.x, current.height + move.y, bounds)
        : moveRect(current, move.x, move.y, bounds),
    );
  };

  const chooseAspect = (next: AspectPreset) => {
    setAspect(next);
    const nextRatio = ASPECT_PRESETS.find((preset) => preset.id === next)?.ratio ?? null;
    const current = selectionRef.current;
    if (current && nextRatio) commit(withAspectRatio(current, nextRatio, bounds));
  };

  /** Typed sizes are in video pixels; the selection is in DIPs. */
  const setSize = (dimension: "width" | "height", pixels: number) => {
    const current = selectionRef.current;
    if (!current || !Number.isFinite(pixels) || pixels <= 0) return;
    const dips = pixels / context.scaleFactor;
    let width = dimension === "width" ? dips : current.width;
    let height = dimension === "height" ? dips : current.height;
    if (ratio && dimension === "width") height = width / ratio;
    if (ratio && dimension === "height") width = height * ratio;
    commit(resizeTo(current, width, height, bounds));
  };

  const size = selection ? outputSize(selection, context.scaleFactor) : null;
  const showGuides = !selection && !dragging && pointer !== null;
  const showToolbar = selection !== null && !dragging;

  return (
    <div
      ref={rootRef}
      className={cx("region", selection && "region--selected")}
      role="application"
      aria-label="Select the area to record"
      aria-describedby={instructionsId}
      tabIndex={-1}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => setPointer(null)}
      onKeyDown={onKeyDown}
    >
      <p id={instructionsId} className="k-sr-only">
        Drag to select an area, or click to select the whole screen. Arrow keys move the area, Alt
        with arrow keys resizes it. Press Enter to start recording or Escape to cancel.
      </p>
      <p className="k-sr-only" role="status">
        {announcement}
      </p>

      {showGuides && (
        <>
          <span className="region__guide region__guide--x" style={{ left: pointer.x }} />
          <span className="region__guide region__guide--y" style={{ top: pointer.y }} />
        </>
      )}

      {selection ? (
        <div
          className="region__selection"
          style={{
            left: selection.x,
            top: selection.y,
            width: selection.width,
            height: selection.height,
          }}
        >
          {size && (
            <span
              className={cx("region__size", selection.y < 32 && "region__size--inside")}
              aria-hidden="true"
            >
              {size.width} × {size.height}
            </span>
          )}
          {RESIZE_HANDLES.map((handle) => (
            <span
              key={handle}
              data-handle={handle}
              className={`region__handle region__handle--${handle}`}
              aria-hidden="true"
            />
          ))}
        </div>
      ) : (
        !dragging && (
          <div className="region__hint" aria-hidden="true">
            {elsewhere ? (
              <span>The area is on another screen. Drag here to pick one on this screen.</span>
            ) : (
              <span>Drag to select an area · Click to record the whole screen</span>
            )}
            <span className="region__hint-keys">Esc to cancel</span>
          </div>
        )
      )}

      {showToolbar && size && (
        <RegionToolbar
          selection={selection}
          bounds={bounds}
          size={size}
          aspect={aspect}
          onAspectChange={chooseAspect}
          onSizeChange={setSize}
          onSelectAll={() => commit(bounds)}
          onCancel={cancel}
          onConfirm={confirm}
        />
      )}
    </div>
  );
}

function RegionToolbar({
  selection,
  bounds,
  size,
  aspect,
  onAspectChange,
  onSizeChange,
  onSelectAll,
  onCancel,
  onConfirm,
}: {
  selection: Rect;
  bounds: Rect;
  size: { width: number; height: number };
  aspect: AspectPreset;
  onAspectChange(aspect: AspectPreset): void;
  onSizeChange(dimension: "width" | "height", pixels: number): void;
  onSelectAll(): void;
  onCancel(): void;
  onConfirm(): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [toolbarSize, setToolbarSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () =>
      setToolbarSize({ width: element.offsetWidth, height: element.offsetHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Below the selection when there is room, else above it, else inside its bottom edge.
  const below = selection.y + selection.height + TOOLBAR_GAP;
  const above = selection.y - TOOLBAR_GAP - toolbarSize.height;
  const top =
    below + toolbarSize.height <= bounds.height - TOOLBAR_GAP
      ? below
      : above >= TOOLBAR_GAP
        ? above
        : selection.y + selection.height - toolbarSize.height - TOOLBAR_GAP;
  const centered = selection.x + selection.width / 2 - toolbarSize.width / 2;
  const left = Math.min(
    Math.max(centered, TOOLBAR_GAP),
    bounds.width - toolbarSize.width - TOOLBAR_GAP,
  );

  return (
    <div
      ref={ref}
      className="region-toolbar"
      role="toolbar"
      aria-label="Recording area"
      style={{ left, top, visibility: toolbarSize.width ? "visible" : "hidden" }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <fieldset className="region-toolbar__group">
        <legend className="k-sr-only">Aspect ratio</legend>
        {ASPECT_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="region-toolbar__aspect"
            aria-pressed={aspect === preset.id}
            onClick={() => onAspectChange(preset.id)}
          >
            {preset.label}
          </button>
        ))}
      </fieldset>
      <div className="region-toolbar__size">
        <SizeField
          label="Width in pixels"
          value={size.width}
          onCommit={(v) => onSizeChange("width", v)}
        />
        <span aria-hidden="true">×</span>
        <SizeField
          label="Height in pixels"
          value={size.height}
          onCommit={(v) => onSizeChange("height", v)}
        />
      </div>
      <IconButton
        label="Whole screen"
        tooltip="top"
        icon={<Maximize {...icon} />}
        onClick={onSelectAll}
      />
      <span className="region-toolbar__divider" aria-hidden="true" />
      <IconButton label="Cancel · Esc" tooltip="top" icon={<X {...icon} />} onClick={onCancel} />
      <Button
        variant="primary"
        size="sm"
        className="region-toolbar__record"
        icon={<span className="record-dot" aria-hidden="true" />}
        onClick={onConfirm}
      >
        Record
      </Button>
    </div>
  );
}

/** A pixel-size field that applies on Enter or when it loses focus. */
function SizeField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit(value: number): void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);
  const apply = () => {
    setEditing(false);
    const parsed = Number.parseInt(draft, 10);
    if (parsed !== value) onCommit(parsed);
  };
  return (
    <input
      className="region-toolbar__input"
      type="number"
      inputMode="numeric"
      min={2}
      step={2}
      aria-label={label}
      value={editing ? draft : String(value)}
      onFocus={() => {
        setEditing(true);
        setDraft(String(value));
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={apply}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          apply();
        }
      }}
    />
  );
}
