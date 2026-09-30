// Assembles dist/stopover.html from src2/ pieces plus the packed gazetteer.
// Stopover Studio imports pageHtml() for its live preview; run directly, this writes the file.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tunePrelude } from './tools/tune-file.mjs';
const root = new URL('./', import.meta.url);
const part = f => fs.readFileSync(new URL('src2/' + f, root), 'utf8');
export const GAME_FILES = ['core.js', 'extras.js', 'trip.js', 'isles.js', 'map.js', 'ui.js', 'passport.js', 'blind.js', 'flags.js', 'study.js', 'juice.js', 'social.js', 'garage.js', 'sinks.js'];
export function pageHtml() {
  const js = tunePrelude() + GAME_FILES.map(part).join('\n');
  return part('head.html') + part('body.html') +
    '<script id="geo" type="application/octet-stream">' + fs.readFileSync(new URL('data.b64', root), 'utf8') + '</script>\n' +
    "<script>\n(() => {\n'use strict';\n" + js + '\n})();\n</script>\n';
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const html = pageHtml();
  fs.mkdirSync('dist', { recursive: true }); fs.writeFileSync('dist/stopover.html', html);
  console.log('dist/stopover.html', (html.length / 1e6).toFixed(2), 'MB');
}
