// Quick checks that need none of the big data files (which aren't in git): every game script parses, the website
// scripts parse the way build-web.mjs joins them, and the Worker parses. Run by GitHub Actions on every push.
import fs from 'node:fs';
import { execSync } from 'node:child_process';
const part = f => fs.readFileSync('src2/' + f, 'utf8');
let bad = 0;
const parse = (label, code) => { try { new Function(code); console.log('✓', label); } catch (e) { bad++; console.error('✗', label, '·', e.message); } };
const game = ['core.js', 'extras.js', 'trip.js', 'isles.js', 'map.js', 'ui.js', 'passport.js', 'blind.js', 'flags.js', 'study.js', 'juice.js', 'social.js', 'garage.js', 'sinks.js', 'online.js'];
parse('game scripts, joined', `return async () => { ${game.map(part).join('\n')} };`);
parse('log-in script', `${fs.readFileSync('web/src/names.js', 'utf8').replace(/^export /gm, '')}\n${part('auth.js')}`);
for (const f of ['web/src/index.js', 'web/test/email-flow.mjs']) try { execSync(`node --check ${f}`, { stdio: 'pipe' }); console.log('✓', f); } catch (e) { bad++; console.error('✗', f, e.stderr.toString()); }
if (bad) process.exit(1);
