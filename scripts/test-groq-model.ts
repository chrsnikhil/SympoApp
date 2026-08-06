import { judgeAvailable } from "../src/lib/quiz/judge";

async function main() {
  const key = process.env.GROQ_API_KEY;
  const res = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${key}` }
  });
  const data = await res.json();
  console.log("AVAILABLE GROQ MODELS:", data.data?.map((m: any) => m.id));
}

main();
