const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const keyMatch = envFile.match(/GROQ_API_KEY="([^"]+)"/);
const key = keyMatch ? keyMatch[1] : null;

// Base64 encoded 10x10 png
const testImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNkYPhfzzAKRgEVgwwAAO5bAQsW20YwAAAAAElFTkSuQmCC";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const model = "llama-3.3-70b-versatile";

async function test() {
  console.log(`Testing model with image: ${model}`);
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
              { type: "text", text: "What is this image?" },
              { type: "image_url", image_url: { url: testImage } }
            ]
          }
        ],
        max_tokens: 10
      })
    });
    
    if (res.ok) {
      console.log(`✅ ${model} works with images!`);
      const body = await res.json();
      console.log(body.choices[0].message.content);
    } else {
      console.log(`❌ ${model} failed with images: HTTP ${res.status}`);
      console.log(await res.text());
    }
  } catch (e) {
    console.log(`❌ ${model} exception:`, e);
  }
}
test();
