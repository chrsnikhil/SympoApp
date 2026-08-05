import fs from "fs";
import { MongoClient, ObjectId } from "mongodb";
import crypto from "crypto";
import dns from "dns";

dns.setServers(["8.8.8.8", "1.1.1.1"]);

function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

async function seedAtlas() {
  const envText = fs.readFileSync(".env.local", "utf8");
  const uriLine = envText.split("\n").find((l) => l.startsWith("MONGODB_URI="));
  const dbLine = envText.split("\n").find((l) => l.startsWith("MONGODB_DB="));

  const uri = uriLine ? uriLine.slice(uriLine.indexOf("=") + 1).replace(/"/g, "").trim() : null;
  const dbName = dbLine ? dbLine.slice(dbLine.indexOf("=") + 1).replace(/"/g, "").trim() : "xplore26";

  if (!uri) throw new Error("No MONGODB_URI found");

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  console.log("Seeding MongoDB Atlas database:", dbName);

  // 1. Seed coins 01 to 60 if empty
  const coinsColl = db.collection("coins");
  const coinCount = await coinsColl.countDocuments();
  if (coinCount === 0) {
    const docs = Array.from({ length: 60 }, (_, i) => ({
      _id: i + 1,
      teamId: null,
      claimedAt: null,
    }));
    await coinsColl.insertMany(docs as any);
    console.log("✅ Seeded 60 coins (01 to 60) into MongoDB Atlas!");
  } else {
    console.log(`ℹ️ Coins collection already has ${coinCount} coins.`);
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
    console.log("✅ Created Quiz Control team!");
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
    console.log("✅ Created Quiz coordinator participant!");
  }

  const hash = hashCode("1684");
  let codeDoc = await codesColl.findOne({ codeHash: hash });
  if (!codeDoc) {
    await codesColl.insertOne({
      codeHash: hash,
      teamId: adminTeam._id,
      participantId: adminPart._id,
      role: "admin",
      redeemedAt: new Date(),
    });
    console.log("✅ Seeded admin access code 1684!");
  } else {
    await codesColl.updateOne({ _id: codeDoc._id }, { $set: { teamId: adminTeam._id, participantId: adminPart._id } });
  }

  console.log("🎉 MongoDB Atlas Seeding Complete!");
  await client.close();
}

seedAtlas().catch(console.error);
