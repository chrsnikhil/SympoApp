const fs = require('fs');
let content = fs.readFileSync('scripts/seed.ts', 'utf8');
content = content.replace(/\{\s*id:\s*1,([^}]+)unlockSeconds:\s*\d+\s*\}/g, '{ id: 1,$1unlockSeconds: 300 }');
content = content.replace(/\{\s*id:\s*2,([^}]+)unlockSeconds:\s*\d+\s*\}/g, '{ id: 2,$1unlockSeconds: 600 }');
content = content.replace(/[ \t]*\{\s*id:\s*3,([^}]+)unlockSeconds:\s*\d+\s*\},?\n?/g, '');
fs.writeFileSync('scripts/seed.ts', content);
