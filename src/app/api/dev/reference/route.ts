import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";

/**
 * Serve the Round 1 reference image to the dither preview — DEVELOPMENT ONLY.
 *
 * The preview exists to tune the dither, and tuning it against a sample image
 * says little about how it behaves on the one image the effect actually
 * protects. But the reference is deliberately kept out of `public/`
 * (`set-reference.ts` is explicit about why: a file there is downloadable by
 * anyone who guesses the path), so the preview cannot just reference a URL.
 *
 * This route closes that gap without reopening the hole: in production it does
 * not serve, it 404s — the same response as a route that does not exist. So on
 * the deployed site there is no path that returns the reference, which is the
 * property `set-reference.ts` was protecting. Locally, where the file is
 * already sitting on the developer's own disk, serving it costs nothing.
 *
 * The filename is fixed rather than taken from a query parameter. A parameter
 * would be a path-traversal question to answer, and a preview page tuning one
 * image does not need to name arbitrary files.
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }

  // The display copy, not the master — it is what teams actually see, so it is
  // what the dither has to remain legible over.
  for (const [name, type] of [
    ["image-1.jpeg", "image/jpeg"],
    ["image-1.png", "image/png"],
  ] as const) {
    try {
      const bytes = await readFile(join(process.cwd(), "private", "reference", name));
      return new NextResponse(new Uint8Array(bytes), {
        headers: { "content-type": type, "cache-control": "no-store" },
      });
    } catch {
      // Try the next candidate; a missing file here is normal on a machine
      // that has not run set-reference.ts.
    }
  }

  return new NextResponse(
    "No reference image on disk. Expected private/reference/image-1.jpeg (or .png).",
    { status: 404 }
  );
}
