import { MongoClient, ObjectId } from "mongodb";

async function main() {
  const client = new MongoClient(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017");
  await client.connect();
  const db = client.db(process.env.MONGODB_DB_NAME || "sympo");
  const subs = await db.collection("submissions").find({
    type: "quiz"
  }).sort({ receivedAt: 1 }).toArray();

  console.log(JSON.stringify(subs, null, 2));
  await client.close();
}

main().catch(console.error);
