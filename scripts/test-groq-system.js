const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const keyMatch = envFile.match(/GROQ_API_KEY="([^"]+)"/);
const key = keyMatch ? keyMatch[1] : null;

// The search summary example base64 which should work
const testImage = "data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const model = "qwen/qwen3.6-27b";

async function test() {
  console.log(`Testing model WITH system message`);
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          {
            role: "user",
            content: [
              { type: "text", text: "What is this image?" },
              { type: "image_url", image_url: { url: testImage } }
            ]
          }
        ],
        max_tokens: 10
      })
    });
    console.log(`HTTP ${res.status}: ${await res.text()}`);
  } catch (e) {
    console.log(e);
  }

  console.log(`\nTesting model WITHOUT system message`);
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "What is this image? You are a bot that only replies 'cat'." },
              { type: "image_url", image_url: { url: testImage } }
            ]
          }
        ],
        max_tokens: 10
      })
    });
    console.log(`HTTP ${res.status}: ${await res.text()}`);
  } catch (e) {
    console.log(e);
  }
}
test();
