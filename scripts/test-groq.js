const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const keyMatch = envFile.match(/GROQ_API_KEY="([^"]+)"/);
const key = keyMatch ? keyMatch[1] : null;

if (!key) {
  console.log("No GROQ_API_KEY found");
  process.exit(1);
}

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const models = ["meta-llama/llama-4-scout-17b-16e-instruct", "qwen/qwen3.6-27b"];

async function test() {
  for (const model of models) {
    console.log(`Testing model: ${model}`);
    try {
      const res = await fetch(GROQ_URL, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "Hello" }],
          max_tokens: 10
        })
      });
      if (res.ok) {
        console.log(`✅ ${model} works!`);
      } else {
        console.log(`❌ ${model} failed: HTTP ${res.status}`);
        console.log(await res.text());
      }
    } catch (e) {
      console.log(`❌ ${model} exception:`, e);
    }
  }
}
test();
