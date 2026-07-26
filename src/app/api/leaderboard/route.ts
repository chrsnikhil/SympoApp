import { NextResponse } from "next/server";
import { EVENTS, LEADERBOARD_REFRESH_MS, eventFromHost, type EventKey } from "@/lib/config";
import { readSnapshot } from "@/lib/leaderboard/materialize";

/**
 * Serve the materialized leaderboard.
 *
 * Reads one pre-aggregated document, so 500 clients polling every 5s costs a
 * fraction of a query per second rather than 100 aggregations. The
 * Cache-Control matches the refresh interval so intermediaries can absorb
 * repeat hits too.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const requested = url.searchParams.get("event");
  const hostEvent = eventFromHost(request.headers.get("host"));

  const event: EventKey | "overall" =
    requested === "overall"
      ? "overall"
      : (EVENTS as readonly string[]).includes(requested ?? "")
        ? (requested as EventKey)
        : (hostEvent ?? "overall");

  const snapshot = await readSnapshot(event);

  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": `public, max-age=${Math.floor(LEADERBOARD_REFRESH_MS / 1000)}, stale-while-revalidate=10`,
    },
  });
}
