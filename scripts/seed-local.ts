import { MongoClient, ObjectId } from "mongodb";
import crypto from "crypto";

function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

async function seedLocal() {
  const uri = "mongodb://127.0.0.1:27017";
  const dbName = "xplore26";
  console.log("Connecting to local MongoDB on mongodb://127.0.0.1:27017 ...");
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  // 1. Seed coins 01 to 60
  const coinsColl = db.collection("coins");
  const coinCount = await coinsColl.countDocuments();
  if (coinCount === 0) {
    const docs = Array.from({ length: 60 }, (_, i) => ({
      _id: i + 1,
      teamId: null,
      claimedAt: null,
    }));
    await coinsColl.insertMany(docs as any);
    console.log("✅ Seeded 60 coins (01 to 60) into local MongoDB!");
  } else {
    console.log(`ℹ️ Local coins collection has ${coinCount} coins.`);
  }

  // 2. Seed admin access code 1684 and Quiz Control team
  const teamsColl = db.collection("teams");
  const partsColl = db.collection("participants");
  const codesColl = db.collection("access_codes");

  let adminTeam = await teamsColl.findOne({ name: "Quiz Control" });
  if (!adminTeam) {
    const teamId = new ObjectId();
    await teamsColl.insertOne({ _id: teamId, name: "Quiz Control", createdAt: new Date() });
    adminTeam = (await teamsColl.findOne({ _id: teamId }))!;
    console.log("✅ Created Admin Team (Quiz Control)");
  }

  let adminPart = await partsColl.findOne({ teamId: adminTeam._id, role: "admin" });
  if (!adminPart) {
    const partId = new ObjectId();
    await partsColl.insertOne({
      _id: partId,
      teamId: adminTeam._id,
      name: "Quiz coordinator",
      role: "admin",
      createdAt: new Date(),
    });
    adminPart = (await partsColl.findOne({ _id: partId }))!;
    console.log("✅ Created Admin Participant");
  }

  const adminCode = await codesColl.findOne({ codeHash: hashCode("1684") });
  if (!adminCode) {
    await codesColl.insertOne({
      codeHash: hashCode("1684"),
      teamId: adminTeam._id,
      participantId: adminPart._id,
      role: "admin",
      redeemedAt: new Date(),
    });
    console.log("✅ Seeded Admin Code 1684 into local MongoDB!");
  }

  console.log("🎉 Local MongoDB Seeding Completed Successfully!");
  await client.close();
  process.exit(0);
}

seedLocal().catch((err) => {
  console.error("❌ Local seeding error:", err);
  process.exit(1);
});
