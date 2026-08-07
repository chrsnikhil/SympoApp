import { NextResponse } from "next/server";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    if (session.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const url = new URL(request.url);
    const format = url.searchParams.get("format") ?? "csv";

    const subsCollection = await collections.submissionsCtf();
    const teamsCollection = await collections.teamsCtf();
    const challengesCollection = await collections.challengesCtf();

    const subs = await subsCollection.find({}).sort({ receivedAt: 1 }).toArray();
    const teams = await teamsCollection.find({}).toArray();
    const challenges = await challengesCollection.find({}).toArray();

    const teamMap = new Map(teams.map((t) => [t._id!.toString(), t.name]));
    const challengeMap = new Map(challenges.map((c) => [c._id!.toString(), c.title]));

    const records = subs.map((s) => ({
      submissionId: s._id!.toString(),
      receivedAt: s.receivedAt.toISOString(),
      teamId: s.teamId.toString(),
      teamName: teamMap.get(s.teamId.toString()) ?? "Unknown",
      challengeId: s.challengeId.toString(),
      challengeTitle: challengeMap.get(s.challengeId.toString()) ?? "Unknown",
      correct: s.verdict?.correct ? "YES" : "NO",
      points: s.verdict?.points ?? 0,
    }));

    if (format === "json") {
      return new Response(JSON.stringify(records, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": 'attachment; filename="ctf-submissions.json"',
        },
      });
    }

    // CSV Format
    const headers = ["Submission ID", "Timestamp", "Team ID", "Team Name", "Challenge ID", "Challenge Title", "Correct", "Points"];
    const rows = records.map((r) => [
      r.submissionId,
      r.receivedAt,
      r.teamId,
      `"${r.teamName.replace(/"/g, '""')}"`,
      r.challengeId,
      `"${r.challengeTitle.replace(/"/g, '""')}"`,
      r.correct,
      r.points,
    ]);

    const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");

    return new Response(csvContent, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="ctf-submissions.csv"',
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
