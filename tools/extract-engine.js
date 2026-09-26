// Builds engine.js from tools/engine.template.js + the NEURAL block of an advisor userscript.
// Usage: node tools/extract-engine.js [path/to/advisor.user.js]
'use strict';
const fs = require('fs'), path = require('path');

const here = __dirname, rootDir = path.join(here, '..');
const src = process.argv[2] || path.join(rootDir, 'Userscripts', 'alpha21.js');
const text = fs.readFileSync(src, 'utf8');
const begin = text.indexOf('// ==== NEURAL-BEGIN'), endTag = '// ==== NEURAL-END ====';
const end = text.indexOf(endTag);
if (begin < 0 || end < 0) throw new Error('NEURAL-BEGIN/END markers not found in ' + src);
// full-line comments are dropped; the template supplies a short heading
const block = text.slice(text.lastIndexOf('\n', begin) + 1, end + endTag.length)
  .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

const tpl = fs.readFileSync(path.join(here, 'engine.template.js'), 'utf8');
if (!tpl.includes('/*__NEURAL__*/')) throw new Error('template placeholder missing');
fs.writeFileSync(path.join(rootDir, 'engine.js'), tpl.replace('/*__NEURAL__*/', () => block));
console.log('engine.js written (' + fs.statSync(path.join(rootDir, 'engine.js')).size + ' bytes)');
