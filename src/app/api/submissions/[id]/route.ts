import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";

/**
 * Poll a submission's status. Used by the code event while the judge runs.
 * Scoped to the caller's own team so submissions aren't readable across teams.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Bad id" }, { status: 400 });
    }

    const subs = await collections.submissions();
    const doc = await subs.findOne({
      _id: new ObjectId(id),
      teamId: new ObjectId(session.teamId),
    });
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({
      id,
      status: doc.status,
      verdict: doc.verdict ?? null,
      receivedAt: doc.receivedAt,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("[submissions] unexpected", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
