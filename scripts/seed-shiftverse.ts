import { caesarEncrypt } from '../src/lib/cipher';
import { collections } from '../src/lib/db/client';

const TEAMS: { teamNumber: number; word: string }[] = [
  { teamNumber: 1, word: 'MILESMORALES' },
  { teamNumber: 2, word: 'GWENSTACY' },
  { teamNumber: 3, word: 'MIGUELOHARA' },
  { teamNumber: 4, word: 'HOBIEBROWN' },
  { teamNumber: 5, word: 'BENREILLY' },
  { teamNumber: 6, word: 'PETERBPARKER' },
  { teamNumber: 7, word: 'SCARLETSPIDER' },
  { teamNumber: 8, word: 'SPIDERBYTE' },
  { teamNumber: 9, word: 'SPIDERPUNK' },
  { teamNumber: 10, word: 'SPIDERNOIR' },
  { teamNumber: 11, word: 'SPIDERHAM' },
  { teamNumber: 12, word: 'MAYDAYPARKER' },
  { teamNumber: 13, word: 'MUMBATTAN' },
  { teamNumber: 14, word: 'SPOTDIMENSION' },
  { teamNumber: 15, word: 'OLIVIAOCTAVIUS' },
  { teamNumber: 16, word: 'JEFFERSONDAVIS' },
  { teamNumber: 17, word: 'LEAPOFFAITH' },
  { teamNumber: 18, word: 'SPIDERSOCIETY' },
  { teamNumber: 19, word: 'CANONEVENT' },
  { teamNumber: 20, word: 'DIMENSIONALGLITCH' },
  { teamNumber: 21, word: 'MULTIVERSE' },
  { teamNumber: 22, word: 'COLLIDER' },
  { teamNumber: 23, word: 'DIMENSION' },
  { teamNumber: 24, word: 'MULTIVERSALPORTAL' },
  { teamNumber: 25, word: 'ALCHEMAXLABS' },
  { teamNumber: 26, word: 'GLITCHING' },
  { teamNumber: 27, word: 'WEBOFSECRETS' },
  { teamNumber: 28, word: 'SPIDEYSENSE' },
  { teamNumber: 29, word: 'WALLCRAWLER' },
  { teamNumber: 30, word: 'WEBSHOOTERS' },
  { teamNumber: 31, word: 'WEBWARRIOR' },
  { teamNumber: 32, word: 'BEYONDVERSE' },
  { teamNumber: 33, word: 'ACROSSVERSE' },
  { teamNumber: 34, word: 'INTOTHEVERSE' },
  { teamNumber: 35, word: 'WATCHTHEMORAL' },
  { teamNumber: 36, word: 'CAPTAINSACRIFICE' },
  { teamNumber: 37, word: 'SPIDERSOCIETY' },
  { teamNumber: 38, word: 'REDEMPTION' },
  { teamNumber: 39, word: 'SPOTANOMALY' },
  { teamNumber: 40, word: 'EVERYONECANBEAHERO' },
];

async function seed() {
  const coll = await collections.shiftverseTeams();
  await coll.deleteMany({});
  console.log('Cleared existing shiftverse teams.');

  const teamDocs = TEAMS.map(({ teamNumber, word }) => {
    const shiftKey = teamNumber;
    const encryptedWord = caesarEncrypt(word, shiftKey);
    console.log(`Team ${String(teamNumber).padStart(2, '0')}: "${word}" → shift ${shiftKey} → "${encryptedWord}"`);
    
    return {
      teamNumber,
      teamId: null,
      claimedAt: null,
      plaintextWord: word,
      encryptedWord,
      shiftKey,
      perLetterGuesses: [],
      startTime: 0,
    };
  });

  await coll.insertMany(teamDocs);
  console.log(`\nSeeded ${teamDocs.length} shiftverse teams successfully.`);
  process.exit(0);
}

seed().catch(console.error);
