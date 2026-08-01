import fs from "fs";
import dns from "dns";

dns.setServers(["8.8.8.8", "1.1.1.1"]);

const envText = fs.readFileSync(".env.local", "utf8");
envText.split("\n").forEach((l) => {
  const parts = l.split("=");
  if (parts.length >= 2) {
    const k = parts[0].trim();
    const v = parts.slice(1).join("=").replace(/"/g, "").trim();
    if (k) process.env[k] = v;
  }
});

async function main() {
  console.log("Debugging /api/enter handler directly...");
  try {
    const { POST } = await import("../src/app/api/enter/route");
    const req = new Request("http://localhost:3000/api/enter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "1684" }),
    });
    const res = await POST(req);
    console.log("Status:", res.status);
    console.log("Body:", await res.json());
  } catch (err: any) {
    console.error("EXACT ERROR STACK TRACE:");
    console.error(err);
  }
}

main();
