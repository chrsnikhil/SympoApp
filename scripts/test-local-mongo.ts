import { MongoClient } from "mongodb";

async function testLocal() {
  const uri = "mongodb://127.0.0.1:27017";
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 2000 });
  try {
    await client.connect();
    console.log("✅ Local MongoDB is RUNNING on mongodb://127.0.0.1:27017!");
    await client.close();
  } catch (err) {
    console.log("❌ Local MongoDB service not detected on 127.0.0.1:27017:", (err as Error).message);
  }
  process.exit(0);
}

testLocal();
