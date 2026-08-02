import { collections } from "../src/lib/db/client";
import { hashAnswer } from "../src/lib/auth/session";

async function main() {
  const challenges = await collections.challenges();
  const res = await challenges.updateOne(
    { slug: "connections-1" },
    {
      $set: {
        title: "Puzzle 1: Two pictures. One shared technical term.",
        "config.clue": "A data structure and a way to organize things.",
        "config.answerHash": hashAnswer("heap sort"),
        "config.connectionsImages": ["/quiz/heap.png", "/quiz/sort.png"]
      }
    }
  );
  console.log("Updated", res.modifiedCount, "documents");
  process.exit(0);
}

main().catch(console.error);
