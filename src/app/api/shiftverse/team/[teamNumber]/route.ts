import { NextRequest, NextResponse } from 'next/server';
import { collections } from '@/lib/db/client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamNumber: string }> }
) {
  try {
    const { teamNumber: teamNumStr } = await params;
    const teamNumber = parseInt(teamNumStr, 10);

    if (isNaN(teamNumber) || teamNumber < 1 || teamNumber > 40) {
      return NextResponse.json({ error: 'Invalid team number. Must be between 1 and 40.' }, { status: 400 });
    }

    const coll = await collections.shiftverseTeams();
    const team = await coll.findOne({ teamNumber });

    if (!team) {
      return NextResponse.json({ error: 'Team not found. Please run the seed script first.' }, { status: 404 });
    }

    const startTime = (team.startTime && team.startTime > 0) ? team.startTime : Date.now();
    const perLetterGuesses = Array.from(
      { length: team.encryptedWord.length },
      () => Math.floor(Math.random() * 26) + 1
    );

    await coll.updateOne(
      { teamNumber },
      { $set: { perLetterGuesses, startTime } }
    );

    return NextResponse.json({
      teamNumber: team.teamNumber,
      encryptedWord: team.encryptedWord,
      perLetterGuesses,
      startTime,
    });
  } catch (error) {
    console.error('Error fetching team:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
