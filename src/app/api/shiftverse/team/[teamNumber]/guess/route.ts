import { NextRequest, NextResponse } from 'next/server';
import { collections } from '@/lib/db/client';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ teamNumber: string }> }
) {
  try {
    const { teamNumber: teamNumStr } = await params;
    const teamNumber = parseInt(teamNumStr, 10);

    if (isNaN(teamNumber) || teamNumber < 1 || teamNumber > 40) {
      return NextResponse.json({ error: 'Invalid team number.' }, { status: 400 });
    }

    const body = await request.json();
    const { guessedWord } = body;

    if (!guessedWord || typeof guessedWord !== 'string') {
      return NextResponse.json({ error: 'guessedWord is required and must be a string.' }, { status: 400 });
    }

    const coll = await collections.shiftverseTeams();
    const team = await coll.findOne({ teamNumber });

    if (!team) {
      return NextResponse.json({ error: 'Team not found.' }, { status: 404 });
    }

    const correct = guessedWord.toUpperCase() === team.plaintextWord.toUpperCase();

    if (correct) {
      return NextResponse.json({ correct, decryptedWord: team.plaintextWord });
    }

    return NextResponse.json({ correct });
  } catch (error) {
    console.error('Error checking guess:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
