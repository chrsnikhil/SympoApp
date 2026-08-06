const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const keyMatch = envFile.match(/GROQ_API_KEY="([^"]+)"/);
const key = keyMatch ? keyMatch[1] : null;

async function listModels() {
  const res = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { authorization: `Bearer ${key}` }
  });
  const data = await res.json();
  const models = data.data.map(m => m.id);
  console.log("Available Groq Models:");
  console.log(models.join('\n'));
}
listModels();
