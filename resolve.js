const fs = require('fs');
const files = [
  'game_src/landing.js',
  'game_src/board.js',
  'game_src/main.js',
  'game_src/style.css'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  // Regular expression to match conflict blocks and capture the HEAD content
  const regex = /<<<<<<< HEAD\n([\s\S]*?)=======\n[\s\S]*?>>>>>>> [^\n]+\n/g;
  const newContent = content.replace(regex, '$1');
  
  if (content !== newContent) {
    fs.writeFileSync(file, newContent, 'utf8');
    console.log(`Resolved conflicts in ${file} (kept HEAD)`);
  }
}
