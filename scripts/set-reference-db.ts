import fs from "node:fs";
import path from "node:path";
import { collections } from "../src/lib/db/client";

async function main() {
  const file = path.join(process.cwd(), "public", "quiz", "reference-1.jpg");
  if (!fs.existsSync(file)) {
    console.error("File not found:", file);
    process.exit(1);
  }

  const buf = fs.readFileSync(file);
  const dataUrl = `data:image/jpeg;base64,${buf.toString("base64")}`;

  const c = await collections.challenges();
  await c.updateOne({ slug: "image-1" }, { $set: { "config.referenceDataUrl": dataUrl } });

  console.log("SUCCESSFULLY SET REFERENCE DATA URL FOR GAME 1 IN MONGODB ATLAS!");
  process.exit(0);
}

main();
