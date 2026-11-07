import { BackgroundPicker, Button, SegmentedControl, type SegmentedOption } from "@kadr/ui";
import { ImagePlus } from "lucide-react";
import { useEffect, useState } from "react";
import type { AppSettingsPatch, CameraBackgroundSettings } from "../../../shared/api";

type BlurLevel = "light" | "medium" | "strong";

const BLUR_LEVELS: Record<BlurLevel, number> = { light: 0.3, medium: 0.6, strong: 1 };

const BLUR_OPTIONS: ReadonlyArray<SegmentedOption<BlurLevel>> = [
  { value: "light", label: "Light" },
  { value: "medium", label: "Medium" },
  { value: "strong", label: "Strong" },
];

const HINTS: Partial<Record<CameraBackgroundSettings["mode"], string>> = {
  remove:
    "Only you are shown, over your screen. Camera-only videos use the colour you picked last.",
  image: "Your image is kept on this computer.",
};

/** The blur level closest to a stored strength. */
function blurLevel(strength: number): BlurLevel {
  let best: BlurLevel = "medium";
  for (const level of Object.keys(BLUR_LEVELS) as BlurLevel[]) {
    if (Math.abs(BLUR_LEVELS[level] - strength) < Math.abs(BLUR_LEVELS[best] - strength)) {
      best = level;
    }
  }
  return best;
}

/** An object URL for the saved custom image (for the picker thumbnail), revoked when replaced. */
function useBackgroundImageUrl(revision: number | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (revision === null) {
      setUrl(null);
      return;
    }
    let active = true;
    let created: string | null = null;
    void window.kadr.background.getImage().then((image) => {
      if (!active) return;
      created = image
        ? URL.createObjectURL(new Blob([new Uint8Array(image.data)], { type: image.mimeType }))
        : null;
      setUrl(created);
    });
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [revision]);
  return url;
}

/** Camera background: none, blur, remove, colours or a custom image (needs on-device segmentation). */
export function BackgroundSettings({
  background,
  update,
}: {
  background: CameraBackgroundSettings;
  update(patch: AppSettingsPatch): void;
}) {
  const imageUrl = useBackgroundImageUrl(background.imageRevision);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<CameraBackgroundSettings>) =>
    update({ bubble: { background: { ...background, ...patch } } });

  const chooseImage = () => {
    setError(null);
    window.kadr.background
      .chooseImage()
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? cleanIpcError(reason.message) : String(reason)),
      );
  };

  const hint = HINTS[background.mode];
  return (
    <div className="k-field">
      <span className="k-field__label">Background</span>
      <BackgroundPicker
        mode={background.mode}
        presetId={background.presetId}
        imageUrl={imageUrl}
        onChange={(choice) =>
          set(choice.mode === "color" ? { mode: "color", presetId: choice.presetId } : choice)
        }
      />
      {background.mode === "blur" && (
        <SegmentedControl
          label="Blur strength"
          value={blurLevel(background.blur)}
          options={BLUR_OPTIONS}
          onChange={(level) => set({ blur: BLUR_LEVELS[level] })}
        />
      )}
      {hint && <p className="subview__note">{hint}</p>}
      <div className="subview__actions">
        <Button size="sm" icon={<ImagePlus className="k-icon" aria-hidden />} onClick={chooseImage}>
          {imageUrl ? "Change image…" : "Choose image…"}
        </Button>
      </div>
      {error && (
        <p className="subview__note" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Electron prefixes errors thrown in main ("Error invoking remote method …: Error: …"). */
function cleanIpcError(message: string): string {
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}
