/**
 * FontSizeAdjuster — user-facing control for adjusting the POS font size.
 *
 * Research finding: "Non-adjustable font size" is a top complaint about
 * Toast and Lightspeed (COMP-1 UX innovations, FORUM-1 pain point #12).
 * Restaurant staff with visual impairments or working in bright environments
 * need larger text. Touch POS terminals benefit from adjustable sizing.
 *
 * This component:
 *   - Provides 3 size presets: Small (default), Medium (1.15x), Large (1.3x)
 *   - Persists the choice in localStorage (per-terminal preference)
 *   - Applies a CSS custom property `--posr-font-scale` on the root element
 *   - All text in the app scales via `font-size: calc(1rem * var(--posr-font-scale))`
 *     (future: Tailwind plugin to apply this globally)
 *
 * Placement: shown in the Settings screen as a "Display" card.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const STORAGE_KEY = "posr-font-scale";
const VALID_SCALES = ["1", "1.15", "1.3"] as const;
type FontScale = (typeof VALID_SCALES)[number];

const SCALE_LABELS: Record<FontScale, string> = {
  "1": "Small",
  "1.15": "Medium",
  "1.3": "Large",
};

function getStoredScale(): FontScale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && VALID_SCALES.includes(stored as FontScale)) {
      return stored as FontScale;
    }
  } catch {
    // localStorage not available
  }
  return "1";
}

function applyScale(scale: FontScale) {
  document.documentElement.style.setProperty("--posr-font-scale", scale);
}

export function FontSizeAdjuster() {
  const { t } = useTranslation(["settings"]);
  const [scale, setScale] = useState<FontScale>(getStoredScale());

  useEffect(() => {
    applyScale(scale);
  }, [scale]);

  const handleChange = (newScale: FontScale) => {
    setScale(newScale);
    try {
      localStorage.setItem(STORAGE_KEY, newScale);
    } catch {
      // ignore
    }
  };

  return (
    <div className="p-5 rounded-xl bg-white shadow" data-testid="font-size-adjuster">
      <h2 className="text-xl font-semibold mb-1">
        {t("settings:display.fontSize", { defaultValue: "Font Size" })}
      </h2>
      <p className="text-sm text-neutral-500 mb-4">
        {t("settings:display.fontSizeDescription", {
          defaultValue: "Adjust text size for better visibility on your terminal.",
        })}
      </p>
      <div className="flex gap-3">
        {VALID_SCALES.map((s) => (
          <button
            key={s}
            onClick={() => handleChange(s)}
            className={`px-4 py-2 rounded-lg border-2 transition-all ${
              scale === s
                ? "border-primary bg-primary text-white font-semibold"
                : "border-neutral-300 bg-white text-neutral-700 hover:border-primary"
            }`}
            style={{ fontSize: `${Number(s) * 0.875}rem` }}
            aria-pressed={scale === s}
            aria-label={SCALE_LABELS[s]}
            data-testid={`font-size-${SCALE_LABELS[s].toLowerCase()}`}
          >
            A
          </button>
        ))}
      </div>
      <div className="mt-3 text-sm text-neutral-500">
        {t("settings:display.currentSize", { defaultValue: "Current" })}: <strong>{SCALE_LABELS[scale]}</strong>
      </div>
    </div>
  );
}
