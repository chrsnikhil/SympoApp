import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { SHIFTVERSE_DURATION_MS } from "@/lib/config";
import { claimSlot } from "@/lib/shiftverse/slot";

/**
 * Per-team attempt limiting.
 *
 * The answer is a dictionary word and the response is a boolean oracle, so an
 * unthrottled endpoint is a wordlist away from solved. This is in-memory and
 * therefore per-replica — a determined attacker spread across replicas gets
 * more attempts than the number below suggests. It is a speed bump on a
 * scripted attack, not a proof; the real defence is that a wrong guess costs
 * the team an attempt they can see running out.
 */
const ATTEMPT_WINDOW_MS = 60_000;
const MAX_ATTEMPTS_PER_WINDOW = 10;

interface AttemptRecord {
  count: number;
  resetAt: number;
}

/**
 * Pure attempt-limiting decision. Split out from the Map-backed lookup below
 * so the window/reset boundary is unit-testable by passing "now" straight in,
 * rather than mocking Date.now or letting state leak between test cases.
 *
 * `record` is what the caller has on file for this key (undefined on a first
 * sighting); the return value is both the verdict and the record to store.
 */
export function evaluateAttempt(
  record: AttemptRecord | undefined,
  now: number
): { limited: boolean; record: AttemptRecord } {
  if (!record || now > record.resetAt) {
    return { limited: false, record: { count: 1, resetAt: now + ATTEMPT_WINDOW_MS } };
  }
  const count = record.count + 1;
  return { limited: count > MAX_ATTEMPTS_PER_WINDOW, record: { count, resetAt: record.resetAt } };
}

const attempts = new Map<string, AttemptRecord>();

function tooManyAttempts(key: string): boolean {
  const { limited, record } = evaluateAttempt(attempts.get(key), Date.now());
  attempts.set(key, record);
  return limited;
}

/**
 * Pure expiry decision, split out for the same reason as `evaluateAttempt`:
 * the SHIFTVERSE_DURATION_MS boundary needs testing at exactly the cutoff,
 * not just informally either side of it.
 *
 * A `startTime` of 0 (never stamped) is treated as "just started" rather than
 * as epoch zero — otherwise every unstamped board would read as expired.
 */
export function isBoardExpired(startTime: number, now: number): boolean {
  const started = startTime > 0 ? startTime : now;
  return now - started > SHIFTVERSE_DURATION_MS;
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const teamId = new ObjectId(session.teamId);

    if (tooManyAttempts(session.teamId)) {
      return NextResponse.json({ error: "Too many guesses — wait a moment." }, { status: 429 });
    }

    let body: { guessedWord?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Malformed request" }, { status: 400 });
    }

    const guessed = typeof body.guessedWord === "string" ? body.guessedWord.trim() : "";
    if (!guessed || guessed.length > 64) {
      return NextResponse.json({ error: "guessedWord is required" }, { status: 400 });
    }

    const slot = await claimSlot(teamId);
    if (!slot) return NextResponse.json({ error: "No puzzle claimed" }, { status: 404 });

    // Server clock decides, not the client's. A board served 20 minutes ago is
    // closed regardless of what the browser believes.
    if (isBoardExpired(slot.startTime, Date.now())) {
      return NextResponse.json({ correct: false, expired: true }, { status: 200 });
    }

    const correct = guessed.toUpperCase() === slot.plaintextWord.toUpperCase();

    // The plaintext is returned ONLY on a correct guess. Returning it on a
    // miss would hand the answer to anyone willing to guess once.
    return NextResponse.json(correct ? { correct, decryptedWord: slot.plaintextWord } : { correct });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("[shiftverse/guess]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
