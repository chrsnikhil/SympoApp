import fs from "fs";
import { MongoClient } from "mongodb";
import dns from "dns";

// Force Node to use Google/Cloudflare public DNS (8.8.8.8) to bypass local ISP DNS blocking if needed
dns.setServers(["8.8.8.8", "1.1.1.1"]);

async function main() {
  const envText = fs.readFileSync(".env.local", "utf8");
  const uriLine = envText.split("\n").find((l) => l.startsWith("MONGODB_URI="));
  const dbLine = envText.split("\n").find((l) => l.startsWith("MONGODB_DB="));

  const uri = uriLine ? uriLine.slice(uriLine.indexOf("=") + 1).replace(/"/g, "").trim() : null;
  const dbName = dbLine ? dbLine.slice(dbLine.indexOf("=") + 1).replace(/"/g, "").trim() : "xplore26";

  console.log("----------------------------------------");
  console.log("Checking MongoDB Atlas Connection...");
  console.log("URI Target:", uri?.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:****@"));
  console.log("Database Name:", dbName);
  console.log("----------------------------------------");

  if (!uri) {
    console.error("❌ MONGODB_URI not found in .env.local!");
    process.exit(1);
  }

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    console.log("✅ SUCCESSFULLY CONNECTED TO MONGODB ATLAS!");

    const ping = await client.db(dbName).command({ ping: 1 });
    console.log("✅ Ping OK:", ping);

    const collections = await client.db(dbName).listCollections().toArray();
    console.log("Existing Collections:", collections.map((c) => c.name));
  } catch (err: any) {
    console.error("❌ Connection failed!");
    console.error("Error details:", err.message);
  } finally {
    await client.close();
  }
}

main();
