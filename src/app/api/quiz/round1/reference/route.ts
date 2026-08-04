import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";

export const dynamic = "force-dynamic";

/**
 * The reference image teams must recreate.
 *
 * This endpoint is the ONLY route to that picture — there is no copy under
 * `public/`, so there is no path to guess and nothing to hotlink. What it
 * hands back is deliberately NOT the master: `referenceDisplayDataUrl` is a
 * downscaled, re-encoded copy, good enough to recreate from and useless as a
 * substitute for the original. The master (`referenceDataUrl`) stays on the
 * server for the vision judge and is never serialised into a response.
 *
 * Every hand-out is stamped with a fresh session id, logged against the team.
 * That id is burnt into the watermark the browser draws, so a leaked
 * screenshot names the team that was holding it — the honest protection here
 * is traceability, not prevention. A browser cannot stop an OS screenshot or
 * a phone camera, and nothing below pretends otherwise.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    // Same-origin gate. A hotlink from another site sends `cross-site`, and
    // pasting the URL straight into a tab sends `none` — both are refused, so
    // the only way to this image is the game page itself. Browsers that omit
    // the header fall back to the Referer/Origin check below.
    const fetchSite = req.headers.get("sec-fetch-site");
    if (fetchSite && fetchSite !== "same-origin") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!fetchSite) {
      const origin = req.headers.get("origin") ?? req.headers.get("referer") ?? "";
      const host = req.headers.get("host") ?? "";
      if (!origin || !host || !origin.includes(host)) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    }

    const challenges = await collections.challenges();
    const challenge = await challenges.findOne({ type: "quiz", "config.format": "prompt-image" });
    if (!challenge) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Display copy ONLY. There is deliberately no fallback to
    // `referenceDataUrl` here: a missing display copy means set-reference.ts
    // hasn't been re-run, and quietly serving the master instead would hand
    // teams the exact file this endpoint exists to withhold.
    const dataUrl = challenge.config.referenceDisplayDataUrl;
    if (!dataUrl) {
      console.error(
        "[quiz/round1/reference] no referenceDisplayDataUrl — re-run scripts/set-reference.ts. " +
          "Refusing to fall back to the full-resolution master."
      );
      return NextResponse.json({ error: "Reference image not ready" }, { status: 503 });
    }

    // Session id ties a screenshot back to who was holding it, and when.
    const sessionId = randomUUID().slice(0, 8).toUpperCase();
    console.log(
      `[reference-view] team=${session.teamId} session=${sessionId} at=${new Date().toISOString()}`
    );

    return NextResponse.json(
      { dataUrl, sessionId },
      {
        headers: {
          // Never let this sit in a disk cache, a proxy, or the back/forward
          // cache where it could be recovered after the viewing window shuts.
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          Pragma: "no-cache",
          Expires: "0",
          "X-Content-Type-Options": "nosniff",
        },
      }
    );
  } catch (err) {
    console.error("[quiz/round1/reference]", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
