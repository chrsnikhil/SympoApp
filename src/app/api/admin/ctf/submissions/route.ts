import { NextResponse } from "next/server";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";

export async function GET() {
  try {
    const session = await requireSession();
    if (session.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const subsCollection = await collections.submissionsCtf();
    const teamsCollection = await collections.teamsCtf();
    const challengesCollection = await collections.challengesCtf();

    const subs = await subsCollection.find({}).sort({ receivedAt: -1 }).toArray();
    const teams = await teamsCollection.find({}).toArray();
    const challenges = await challengesCollection.find({}).toArray();

    const teamMap = new Map(teams.map((t) => [t._id!.toString(), t.name]));
    const challengeMap = new Map(challenges.map((c) => [c._id!.toString(), c.title]));

    const submissionsList = subs.map((s) => ({
      id: s._id!.toString(),
      teamId: s.teamId.toString(),
      teamName: teamMap.get(s.teamId.toString()) ?? "Unknown Team",
      challengeId: s.challengeId.toString(),
      challengeTitle: challengeMap.get(s.challengeId.toString()) ?? "Unknown Challenge",
      receivedAt: s.receivedAt,
      status: s.status,
      correct: s.verdict?.correct ?? false,
      points: s.verdict?.points ?? 0,
      meta: s.verdict?.meta,
    }));

    return NextResponse.json({ submissions: submissionsList });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to fetch submissions" }, { status: 500 });
  }
}
