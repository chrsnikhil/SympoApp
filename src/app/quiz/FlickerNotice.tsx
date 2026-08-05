"use client";

import { useDitherSetting } from "./useDitherSetting";

/**
 * Photosensitivity warning and the opt-out that goes with it.
 *
 * Temporal dithering works by alternating frames at the display's refresh rate,
 * which is far above WCAG 2.3.1's three-flashes-per-second limit. Content like
 * that is shippable — films and games do it — but only with informed consent,
 * which means the warning has to be visible BEFORE the images appear, stated
 * plainly, and the way out has to be one click with no explanation asked for.
 *
 * Renders nothing when the coordinator's flag is off, so the normal
 * configuration carries no warning about an effect nobody is seeing.
 */
export default function FlickerNotice({ className }: { className?: string }) {
  const { ditherOffered, optedOut, setOptedOut } = useDitherSetting();

  if (!ditherOffered) return null;

  return (
    <div
      className={`panel border-2 border-comic-yellow/60 bg-ink-black/80 p-3 ${className ?? ""}`}
      role="region"
      aria-label="Photosensitivity notice"
    >
      <p className="font-comic text-sm text-comic-yellow">
        Heads up: images on this screen flicker rapidly.
      </p>
      <p className="mt-1 text-xs leading-relaxed text-paper-white/70">
        {optedOut
          ? "Flicker is off for this device. Images are shown normally."
          : "This is a deliberate anti-screenshot effect. If you are sensitive to flashing light, or it is uncomfortable for any reason, turn it off — there is no penalty and nothing about the game changes."}
      </p>
      <button
        type="button"
        onClick={() => setOptedOut(!optedOut)}
        className="comic-btn mt-2 px-3 py-1.5 text-xs"
      >
        {optedOut ? "Turn flicker back on" : "Turn off flicker"}
      </button>
    </div>
  );
}
