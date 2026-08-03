import { NextResponse } from "next/server";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { eventFromHost, EVENTS, type EventKey } from "@/lib/config";
import { submit } from "@/lib/submission/pipeline";

/**
 * The single submission endpoint for all four events.
 *
 * The event is taken from the Host header, not the request body — a client
 * can't submit a CTF flag against a quiz challenge by editing JSON.
 */
export async function POST(request: Request) {
  try {
    const session = await requireSession();

    const hostEvent = eventFromHost(request.headers.get("host"));
    const body = (await request.json()) as {
      event?: string;
      challengeSlug?: string;
      payload?: string;
    };

    // Host wins; body.event is only a fallback for local dev on one origin.
    const event: EventKey | null =
      hostEvent ?? ((EVENTS as readonly string[]).includes(body.event ?? "") ? (body.event as EventKey) : null);

    if (!event) return NextResponse.json({ error: "Unknown event" }, { status: 400 });
    if (!body.challengeSlug || typeof body.payload !== "string") {
      return NextResponse.json({ error: "Missing challengeSlug or payload" }, { status: 400 });
    }

    const outcome = await submit({
      event,
      challengeSlug: body.challengeSlug,
      payload: body.payload,
      session,
    });

    if (!outcome.ok) {
      return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    }
    return NextResponse.json(outcome, { status: outcome.status });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("[submit] unexpected", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
