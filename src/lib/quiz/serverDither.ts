import sharp from "sharp";
import {
  compressRange,
  ditherFrames,
  DEFAULT_DITHER_AMPLITUDE,
  DEFAULT_RANGE_FLOOR,
  DEFAULT_FRAME_COUNT,
  DEFAULT_DECOY_BLOCK,
} from "./temporalDither";

/**
 * Generate the dither frames on the SERVER, so a clean image never reaches the
 * browser at all.
 *
 * WHY THIS EXISTS. The dither used to be applied in the browser, to an image
 * the server had already sent in the clear: `/api/quiz/round1/reference`
 * returned the picture as a data URL and the canvas noised it afterwards. That
 * protects a screenshot of the screen and nothing else — DevTools' Network tab
 * still held a pristine copy, one right-click from being saved. A team never
 * had to beat the flicker; they had to open the inspector.
 *
 * Moving generation here closes it. The client is sent only the finished
 * frames, each of which is individually unreadable, and there is no request
 * that returns anything better. The clean pixels exist on the server and are
 * discarded before the response is written.
 *
 * The frame maths is unchanged — `compressRange` and `ditherFrames` are the
 * same functions the browser was running, operating on the same
 * `Uint8ClampedArray`. They were already free of any DOM dependency, so this is
 * a change of WHERE the work happens, not WHAT it computes. A frame set built
 * here averages to the image exactly as one built in the browser did.
 *
 * COST, stated plainly. The response carries `frameCount` images instead of
 * one, so roughly double the bytes at the default of 2. Generation is real CPU
 * per request, which is why callers cache — see the route. PNG, not JPEG:
 * the frames are high-frequency noise, which is the worst case for a DCT codec
 * both in size and in fidelity, and lossy artefacts would break the property
 * that the frames average back to the image.
 */

export interface ServerDitherResult {
  /** PNG data URLs, in cycle order. Each is individually unreadable. */
  frames: string[];
  width: number;
  height: number;
}

export interface ServerDitherOptions {
  amplitude?: number;
  rangeFloor?: number;
  frameCount?: 2 | 3;
  blockSize?: number;
  /** Longest edge, in px. Smaller is faster and lighter; the display copy is
   *  already downscaled, so this is a second bound rather than the main one. */
  maxEdge?: number;
  /** Baked into the pixels BEFORE dithering — see `watermarkSvg`. */
  watermark?: { teamName: string; sessionId: string; stamp: string };
}

/**
 * The traceability layer, tiled across the image.
 *
 * Composited into the pixels BEFORE the frames are generated, which is the
 * whole point: a watermark drawn over finished frames would be the one clean,
 * perfectly legible thing in an otherwise unreadable capture — trivially
 * located and painted out. Baked in first, it is dithered along with
 * everything else and cannot be separated from the image it marks.
 *
 * Diagonal, varied in size and offset, at low opacity: legible enough in the
 * averaged image to identify a leak, quiet enough not to fight the artwork the
 * team is being asked to study.
 */
function watermarkSvg(width: number, height: number, text: string): Buffer {
  const cols = 4;
  const rows = 6;
  const cells: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Offset alternate rows so the grid does not read as a grid, which would
      // make it easy to predict and mask.
      const x = ((c + (r % 2 ? 0.5 : 0)) / cols) * width;
      const y = ((r + 0.5) / rows) * height;
      const size = Math.max(11, Math.round(width / 46));
      cells.push(
        `<text x="${x.toFixed(0)}" y="${y.toFixed(0)}" transform="rotate(-24 ${x.toFixed(0)} ${y.toFixed(0)})" ` +
          `font-family="monospace" font-size="${size}" fill="#ffffff" fill-opacity="0.30" ` +
          `stroke="#000000" stroke-opacity="0.18" stroke-width="0.6">${text}</text>`
      );
    }
  }
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${cells.join("")}</svg>`
  );
}

/** SVG text is markup — a team name is user-controlled and must not be able to close a tag. */
function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (ch) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[ch] as string
  );
}

export async function buildServerDitheredFrames(
  imageDataUrl: string,
  opts: ServerDitherOptions = {}
): Promise<ServerDitherResult> {
  const {
    amplitude = DEFAULT_DITHER_AMPLITUDE,
    rangeFloor = DEFAULT_RANGE_FLOOR,
    frameCount = DEFAULT_FRAME_COUNT as 2 | 3,
    blockSize = DEFAULT_DECOY_BLOCK,
    maxEdge = 900,
    watermark,
  } = opts;

  const base64 = imageDataUrl.replace(/^data:[^,]+,/, "");
  const input = Buffer.from(base64, "base64");

  // Resize first so the watermark can be sized against the final dimensions.
  const resized = await sharp(input)
    .rotate()
    .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true });

  let composited = sharp(resized.data);
  if (watermark) {
    const text = escapeXml(
      `${watermark.teamName} · ${watermark.stamp} · ${watermark.sessionId}`
    );
    composited = sharp(
      await composited
        .composite([{ input: watermarkSvg(resized.info.width, resized.info.height, text), top: 0, left: 0 }])
        .toBuffer()
    );
  }

  // Decode to raw RGBA — the exact layout the dither maths expects, and the
  // same one a canvas hands back from getImageData.
  const { data, info } = await composited.ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);

  // Compression first, then frames — the same order the browser used. Without
  // it the extremes have no room to be perturbed and survive in every frame,
  // which is exactly how structure leaked through an earlier version.
  compressRange(pixels, rangeFloor);

  const frames = ditherFrames(pixels, {
    width: info.width,
    height: info.height,
    amplitude,
    frameCount,
    blockSize,
    rangeFloor,
  });

  const encoded = await Promise.all(
    frames.map(async (frame) => {
      const png = await sharp(Buffer.from(frame.buffer, frame.byteOffset, frame.byteLength), {
        raw: { width: info.width, height: info.height, channels: 4 },
      })
        // Level 6 rather than max: these are noise, so extra effort buys very
        // little size and costs latency on a request a team is waiting on.
        .png({ compressionLevel: 6 })
        .toBuffer();
      return `data:image/png;base64,${png.toString("base64")}`;
    })
  );

  return { frames: encoded, width: info.width, height: info.height };
}
