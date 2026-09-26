// Bundles engine.js into the userscript so it installs as one file.
// Usage: node tools/build-userscript.js
'use strict';
const fs = require('fs'), path = require('path');

const rootDir = path.join(__dirname, '..');
const engine = fs.readFileSync(path.join(rootDir, 'engine.js'), 'utf8');
const tpl = fs.readFileSync(path.join(__dirname, 'userscript.template.js'), 'utf8');
if (!tpl.includes('/*__ENGINE__*/')) throw new Error('template placeholder missing');
const outDir = path.join(rootDir, 'userscript');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, '21deep-advisor.user.js');
fs.writeFileSync(out, tpl.replace('/*__ENGINE__*/', () => engine));
console.log(path.relative(rootDir, out) + ' written (' + fs.statSync(out).size + ' bytes)');
