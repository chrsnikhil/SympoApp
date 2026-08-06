import { GET } from "../src/app/api/admin/quiz/overview/route";

async function main() {
  try {
    const req = new Request("http://localhost/api/admin/quiz/overview?round=1");
    const res = await GET(req);
    console.log("STATUS:", res.status);
    const body = await res.json();
    console.log("BODY ERROR:", body.error);
    if (res.status === 200) {
      console.log("SUCCESS! TEAMS:", body.standings?.length, "COINS:", body.coins?.rows?.length);
    }
  } catch (err) {
    console.error("EXCEPT:", err);
  }
  process.exit(0);
}

main();
