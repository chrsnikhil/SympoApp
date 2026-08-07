import fs from "fs";

// Load .env.local
const envText = fs.readFileSync(".env.local", "utf8");
envText.split("\n").forEach((l) => {
  const parts = l.split("=");
  if (parts.length >= 2) {
    const k = parts[0].trim();
    const v = parts.slice(1).join("=").replace(/"/g, "").trim();
    if (k) process.env[k] = v;
  }
});

async function testEnter() {
   try {
    const res1 = await fetch("http://localhost:3000/api/enter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "1684" }),
    });
    console.log("Response 1684 Status:", res1.status);
    console.log("Response 1684 Body:", await res1.json());

    const res2 = await fetch("http://localhost:3000/api/enter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coin: "01" }),
    });
    console.log("Response coin 01 Status:", res2.status);
    console.log("Response coin 01 Body:", await res2.json());
  } catch (err: any) {
    console.error("Fetch Error:", err.message);
  }
}

testEnter();
