const fs = require('fs');
const path = 'd:\\users\\hameed\\Desktop\\Enarxi\\Project Management\\server\\inventoryRoutes.js';
const content = fs.readFileSync(path, 'utf8');

let openBraces = 0;
let openParens = 0;
let lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
        if (line[j] === '{') openBraces++;
        if (line[j] === '}') openBraces--;
        if (line[j] === '(') openParens++;
        if (line[j] === ')') openParens--;
    }
    if (openBraces < 0 || openParens < 0) {
        console.log(`Mismatch at line ${i + 1}: Braces=${openBraces}, Parens=${openParens}`);
    }
}

console.log(`Final Balance: Braces=${openBraces}, Parens=${openParens}`);
