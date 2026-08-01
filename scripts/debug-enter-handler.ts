import { POST } from "../src/app/api/enter/route";

async function main() {
  const req = new Request("http://localhost/api/enter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: "1684" }),
  });
  const res = await POST(req);
  console.log("STATUS:", res.status);
  console.log("COOKIES:", res.headers.get("set-cookie"));
  console.log("BODY:", await res.json());
  process.exit(0);
}

main().catch(console.error);
