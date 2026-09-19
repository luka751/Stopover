// Assembles dist/stopover.html from src2/ pieces plus the packed gazetteer.
import fs from 'node:fs';
const part = f => fs.readFileSync('src2/' + f, 'utf8');
const js = ['core.js', 'extras.js', 'trip.js', 'isles.js', 'map.js', 'ui.js', 'passport.js', 'blind.js', 'flags.js', 'study.js', 'juice.js'].map(part).join('\n');
const html = part('head.html') + part('body.html') +
  '<script id="geo" type="application/octet-stream">' + fs.readFileSync('data.b64', 'utf8') + '</script>\n' +
  "<script>\n(() => {\n'use strict';\n" + js + '\n})();\n</script>\n';
fs.mkdirSync('dist', { recursive: true }); fs.writeFileSync('dist/stopover.html', html);
console.log('dist/stopover.html', (html.length / 1e6).toFixed(2), 'MB');
