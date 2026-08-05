const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const keyMatch = envFile.match(/GROQ_API_KEY="([^"]+)"/);
const key = keyMatch ? keyMatch[1] : null;

// Base64 encoded JPEG (solid red 50x50)
const testImage = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAAyADIBASIAAhEBAxEB/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAGBAQABPxA=";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const model = "qwen/qwen3.6-27b";

async function test() {
  console.log(`Testing model with JPEG image: ${model}`);
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
              { type: "text", text: "What color is this?" },
              { type: "image_url", image_url: { url: testImage } }
            ]
          }
        ],
        max_tokens: 10
      })
    });
    
    if (res.ok) {
      console.log(`✅ ${model} works with JPEG images!`);
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
