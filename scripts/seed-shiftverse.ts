import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { caesarEncrypt } from '../src/lib/cipher';
import { collections, ensureIndexes } from '../src/lib/db/client';

/**
 * The puzzle words live outside the repository.
 *
 * They used to be a literal array in this file, on a PUBLIC GitHub repo - forty
 * plaintext answers, readable by anyone who found the repo, which is forty
 * solved puzzles. Reading them from an ignored file means the repo carries the
 * seeding logic and the shape, and the answers travel to the event machine
 * separately.
 *
 * NOTE: the words that were committed here are in this repository's git
 * history and cannot be unpublished by deleting them from HEAD. Treat every
 * word that was ever committed as burned and generate fresh ones for the live
 * event - see private/shiftverse/words.example.json for the format.
 */
const WORDS_PATH = join(process.cwd(), 'private', 'shiftverse', 'words.json');

if (!existsSync(WORDS_PATH)) {
  console.error(
    [
      "",
      `  Missing ${WORDS_PATH}`,
      "",
      "  The puzzle words are not committed — this repo is public.",
      "  Copy private/shiftverse/words.example.json to words.json and fill it in.",
      "",
    ].join("\n")
  );
  process.exit(1);
}

const TEAMS: { teamNumber: number; word: string }[] = JSON.parse(readFileSync(WORDS_PATH, 'utf8'));

if (!Array.isArray(TEAMS) || TEAMS.length === 0) {
  console.error(`\n  ${WORDS_PATH} parsed but held no teams.\n`);
  process.exit(1);
}

// A duplicate teamNumber silently gives two teams the same board. The unique
// index would reject the seed partway through with a less obvious error, so
// catch it here, where the message can name the offender.
const duplicates = TEAMS.map((t) => t.teamNumber).filter((n, i, all) => all.indexOf(n) !== i);
if (duplicates.length > 0) {
  console.error(`\n  Duplicate teamNumber(s) in ${WORDS_PATH}: ${[...new Set(duplicates)].join(", ")}\n`);
  process.exit(1);
}

/**
 * Random, 1..25 — deliberately independent of `teamNumber`. Never 0 (a zero
 * shift leaves the word in clear). It used to just equal `teamNumber`, and
 * `teamNumber` is returned as-is by `/api/shiftverse/state` for the UI's
 * cosmetic "DIMENSION #N" label — so `shiftKey === teamNumber` meant
 * `applyShiftToLetter(encryptedWord, teamNumber)` decrypted the board from
 * that response alone, no guess endpoint required.
 */
function randomShiftKey(): number {
  return 1 + Math.floor(Math.random() * 25);
}

async function seed() {
  const coll = await collections.shiftverseTeams();
  await coll.deleteMany({});
  console.log('Cleared existing shiftverse teams.');

  // Indexes AFTER the delete and BEFORE the insert, and that order is not
  // arbitrary: Cosmos refuses to build a unique index on a collection that
  // already holds documents, so a seed that inserted first would leave
  // shiftverse_teams.number silently uncreated — and ensureIndexes only warns
  // on failure, so nothing would look wrong until two teams shared a board.
  await ensureIndexes();
  console.log('Ensured indexes on an empty collection.');

  const teamDocs = TEAMS.map(({ teamNumber, word }) => {
    const shiftKey = randomShiftKey();
    const encryptedWord = caesarEncrypt(word, shiftKey);
    // Deliberately logs neither the plaintext word nor the shift key. This runs
    // on the coordinator's machine, often on a projector or with someone
    // watching, and printing all forty answers to a terminal undoes the point
    // of keeping them out of the repo. The ciphertext is what teams already
    // see, so it is safe to show and still confirms the seed did something.
    console.log(`Team ${String(teamNumber).padStart(2, '0')}: → "${encryptedWord}"`);

    return {
      teamNumber,
      teamId: null,
      claimedAt: null,
      plaintextWord: word,
      encryptedWord,
      shiftKey,
      perLetterGuesses: Array.from({ length: encryptedWord.length }, () => 0),
      startTime: 0,
    };
  });

  await coll.insertMany(teamDocs);
  console.log(`\nSeeded ${teamDocs.length} shiftverse teams successfully.`);

  // The pipeline resolves a challenge by {type, slug} before grading a guess —
  // without this row every shiftverse submission 404s at that lookup.
  const challenges = await collections.challenges();
  await challenges.updateOne(
    { type: "shiftverse", slug: "shiftverse" },
    {
      $set: {
        type: "shiftverse",
        slug: "shiftverse",
        title: "Shift-Verse",
        points: 100,
        opensAt: null,
        closesAt: null,
        config: {},
      },
    },
    { upsert: true }
  );
  console.log("Seeded the shiftverse challenge row.");

  process.exit(0);
}

seed().catch(console.error);
