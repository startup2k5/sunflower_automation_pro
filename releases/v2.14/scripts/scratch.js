const fs = require('fs');
const html = fs.readFileSync('scripts/scratch_html.txt', 'utf8');
const rx = /src="([^"]+)"/g;
let m;
const srcs = [];
while (m = rx.exec(html)) srcs.push(m[1]);
const counts = {};
srcs.forEach(s => counts[s] = (counts[s]||0) + 1);
console.log(JSON.stringify(counts, null, 2));
