const fs = require('fs');
const path = require('path');

const filePath = 'migration_data.sql';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

const chunkSize = 50; // Lines per file
let part = 1;

for (let i = 0; i < lines.length; i += chunkSize) {
    const chunk = lines.slice(i, i + chunkSize).join('\n');
    fs.writeFileSync(`migration_part_${part}.sql`, chunk);
    part++;
}

console.log(`Split into ${part - 1} parts`);