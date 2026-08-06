import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";
import { buildServerDitheredFrames } from "@/lib/quiz/serverDither";

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

    /**
     * With the dither on, the clean image NEVER leaves this function.
     *
     * The browser used to be sent the picture and asked to noise it locally,
     * which protected a screenshot of the screen and nothing else: the Network
     * tab still held a pristine copy, one right-click from being saved. A team
     * never had to beat the flicker, only open the inspector.
     *
     * Now the frames are built here and only the frames are serialised. Each is
     * individually unreadable and no request returns anything better. The
     * per-team watermark is baked in BEFORE the frames are generated, so it
     * cannot be peeled off the top of a capture either.
     *
     * With the dither off the old shape is returned unchanged: the flag is a
     * deliberate accessibility trade, and switching it off has to leave a plain
     * legible image behind rather than no image at all.
     */
    if (process.env.NEXT_PUBLIC_QUIZ_DITHER === "1") {
      // Looked up rather than taken from the request: the watermark is the
      // traceability story, so the name burned into it has to come from the
      // session's team, not from anything the client could choose.
      const teams = await collections.teams();
      const team = await teams.findOne({ _id: new ObjectId(session.teamId) });
      const stamp = new Date().toLocaleTimeString("en-GB");
      const { frames, width, height } = await buildServerDitheredFrames(dataUrl, {
        watermark: { teamName: team?.name ?? "TEAM", sessionId, stamp },
      });
      return NextResponse.json(
        { frames, width, height, sessionId },
        {
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            Pragma: "no-cache",
          },
        }
      );
    }

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
