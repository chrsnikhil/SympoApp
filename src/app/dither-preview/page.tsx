"use client";

import { useState } from "react";
import DitheredImage from "@/app/quiz/DitheredImage";
import {
  DEFAULT_DECOY_BLOCK,
  DEFAULT_DITHER_AMPLITUDE,
  DEFAULT_FRAME_COUNT,
  DEFAULT_RANGE_FLOOR,
} from "@/lib/quiz/temporalDither";

/**
 * DEV-ONLY preview for judging the temporal dither by eye.
 *
 * The effect cannot be evaluated from a description or a screenshot — the whole
 * point is that a screenshot does not show what a person sees. This renders the
 * same component the quiz uses, with the amplitude on a slider, so the flicker
 * can be judged on a real display at a real refresh rate before deciding
 * whether it ships.
 *
 * Returns 404 outside development. It is a tuning tool, not a feature, and it
 * should not exist on the deployed site.
 *
 * Lives at the root rather than under /quiz deliberately: proxy.ts gates
 * /quiz/* behind a session, and needing to log in to adjust a slider defeats
 * the point of a tuning tool.
 */
export default function DitherPreview() {
  const [amplitude, setAmplitude] = useState(DEFAULT_DITHER_AMPLITUDE);
  const [on, setOn] = useState(true);
  const [rangeFloor, setRangeFloor] = useState(DEFAULT_RANGE_FLOOR);
  const [frameCount, setFrameCount] = useState<2 | 3>(DEFAULT_FRAME_COUNT as 2 | 3);
  const [blockSize, setBlockSize] = useState(DEFAULT_DECOY_BLOCK);
  const [src, setSrc] = useState("/quiz/card-1.jpeg");

  if (process.env.NODE_ENV !== "development") {
    return <p className="p-8 font-comic text-paper-white">Not found.</p>;
  }

  const samples = [
    ["Card art (photo-ish)", "/quiz/card-1.jpeg"],
    ["Comic panel (flat colour)", "/quiz/directive-1-comic.png"],
    ["Connections tile (line art)", "/quiz/p2-a.png"],
    ["Reference-style photo", "/comic-page-bg.jpg"],
  ] as const;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8 text-paper-white">
      <div>
        <h1 className="display-title text-3xl">Temporal dither preview</h1>
        <p className="mt-2 text-sm text-paper-white/60">
          Dev-only. Judge the flicker on a real screen, then try a screenshot —
          PrintScreen should capture noise, not the picture.
        </p>
      </div>

      <div className="panel space-y-4 p-4">
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />
          Dither on
        </label>

        <label className="block text-sm">
          Amplitude: <span className="font-mono text-comic-yellow">{amplitude}</span>
          <span className="ml-2 text-xs text-paper-white/50">
            (higher = better hidden in one frame, heavier flicker)
          </span>
          <input
            type="range"
            min={0}
            max={127}
            value={amplitude}
            onChange={(e) => setAmplitude(Number(e.target.value))}
            className="mt-1 w-full"
          />
        </label>

        <label className="block text-sm">
          Range floor: <span className="font-mono text-comic-yellow">{rangeFloor}</span>
          <span className="ml-2 text-xs text-paper-white/50">
            (lifts blacks / drops whites so the extremes can be hidden — costs contrast)
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={rangeFloor}
            onChange={(e) => setRangeFloor(Number(e.target.value))}
            className="mt-1 w-full"
          />
        </label>

        <label className="block text-sm">
          Frames per cycle: <span className="font-mono text-comic-yellow">{frameCount}</span>
          <span className="ml-2 text-xs text-paper-white/50">
            (3 hides more per frame; 2 flickers at 30Hz instead of 20Hz)
          </span>
          <input
            type="range"
            min={2}
            max={3}
            value={frameCount}
            onChange={(e) => setFrameCount(Number(e.target.value) === 2 ? 2 : 3)}
            className="mt-1 w-full"
          />
        </label>

        <label className="block text-sm">
          Decoy cell size: <span className="font-mono text-comic-yellow">{blockSize}px</span>
          <span className="ml-2 text-xs text-paper-white/50">
            (bigger cells hide coarse structure better but shimmer as visible patches)
          </span>
          <input
            type="range"
            min={4}
            max={48}
            value={blockSize}
            onChange={(e) => setBlockSize(Number(e.target.value))}
            className="mt-1 w-full"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          {samples.map(([label, path]) => (
            <button
              key={path}
              type="button"
              onClick={() => setSrc(path)}
              className={`comic-btn px-3 py-1.5 text-xs ${src === path ? "bg-comic-yellow text-ink-black" : ""}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="panel p-4">
        <DitheredImage
          src={src}
          alt="Dither preview"
          dither={on}
          amplitude={amplitude}
          rangeFloor={rangeFloor}
          frameCount={frameCount}
          blockSize={blockSize}
          maxHeight={420}
        />
      </div>

      <div className="panel p-4 text-xs leading-relaxed text-paper-white/60">
        <p className="mb-2 font-comic text-sm text-comic-yellow">What to check</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Is the flicker tolerable for an 8-minute round? Look away and back.</li>
          <li>Can you still read fine detail — the thing Image Replication asks teams to reproduce?</li>
          <li>Press PrintScreen and paste somewhere. It should be noise.</li>
          <li>Take two screenshots and average them in any editor. The image comes back — that is the known limit.</li>
          <li>Try it at a low amplitude (~10). Readable in a single capture, which is why the safe band is not useful.</li>
          <li>
            Range floor 0 vs 40 vs 80 on the comic panel. At 0 the panel borders and black
            gutters survive every amplitude — they sit at 0/255 and cannot be moved. Raising
            it gives them headroom, at the cost of visible contrast.
          </li>
        </ul>
      </div>
    </div>
  );
}
