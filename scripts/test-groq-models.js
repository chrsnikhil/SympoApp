const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const keyMatch = envFile.match(/GROQ_API_KEY="([^"]+)"/);
const key = keyMatch ? keyMatch[1] : null;

// Just use a simple text prompt to check if the model name exists
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const models = [
  "llama-3.2-11b-vision-preview",
  "llama-3.2-90b-vision-preview",
  "llama-3.2-11b-vision-preview",
  "llama-3.2-90b-vision",
  "llama-3.2-11b-vision",
  "llama-v3.2-11b-vision",
  "llama-v3.2-90b-vision",
  "llama-3.2-11b-vision-instruct",
  "llama-3.2-90b-vision-instruct",
  "llama-3.2-90b-vision-preview",
  "llama-3.2-11b-vision-preview",
  "qwen-2.5-vl-72b-instruct"
];

async function test() {
  for (const model of models) {
    console.log(`Checking ${model}...`);
    try {
      const res = await fetch(GROQ_URL, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "hi" }],
          max_tokens: 10
        })
      });
      if (res.ok) {
        console.log(`✅ ${model} exists!`);
      } else {
        const text = await res.text();
        if (text.includes('does not exist')) {
          console.log(`❌ ${model} does not exist`);
        } else if (text.includes('decommissioned')) {
          console.log(`❌ ${model} is decommissioned`);
        } else {
          console.log(`❓ ${model} gave error: HTTP ${res.status} ${text}`);
        }
      }
    } catch (e) {
      console.log(`❌ ${model} exception:`, e.message);
    }
  }
}
test();
