// Read and change src2/tune.json from the command line (the same file Stopover Studio edits).
//   node tools/tune.mjs                          what's in it, section by section
//   node tools/tune.mjs find <text>              every setting whose name or value mentions <text>
//   node tools/tune.mjs get <path>               one value, e.g. vehicles.car.tank or shop.styles.night
//   node tools/tune.mjs set <path> <value>       change one, e.g. set lengths.short.bonus 175
//   node tools/tune.mjs diff                     what changed since the last commit
// Paths use dots. A list item can be named by its id (lengths.short, scoring.tiers.city) or its position (mastery.3).
import { execSync } from 'node:child_process';
import { readTune, writeTune, formatTune } from './tune-file.mjs';

const [cmd, path, ...rest] = process.argv.slice(2);
const T = readTune();
const kind = v => v === null ? 'null' : Array.isArray(v) ? 'list' : typeof v;

function resolve(obj, p) {
  const keys = [], parts = p.split('.');
  let node = obj;
  for (const part of parts) {
    let k = part;
    if (Array.isArray(node)) { const i = node.findIndex(x => x && x.id === part); k = i >= 0 ? i : /^\d+$/.test(part) ? +part : undefined; }
    if (k === undefined || node == null || !(k in node)) throw new Error(`No "${part}" in ${keys.length ? keys.join('.') : 'tune.json'}. There is: ${Object.keys(node || {}).map(x => Array.isArray(node) && node[x] && node[x].id ? node[x].id : x).join(', ')}`);
    keys.push(k); node = node[k];
  }
  return { keys, value: node };
}
const show = v => formatTune(v).trimEnd();

try {
  if (!cmd) {
    const walk = (o, pre, depth) => { for (const [k, v] of Object.entries(o)) {
      const p = pre ? `${pre}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v) && depth < 1 && Object.values(v).some(x => x && typeof x === 'object')) { walk(v, p, depth + 1); continue; }
      const size = Array.isArray(v) ? `${v.length} items` : v && typeof v === 'object' ? `${Object.keys(v).length} entries` : JSON.stringify(v);
      console.log(`${p.padEnd(28)} ${size}`);
    } };
    walk(T, '', 0);
  } else if (cmd === 'get') {
    console.log(show(resolve(T, path).value));
  } else if (cmd === 'find') {
    const q = [path, ...rest].join(' ').toLowerCase(), hits = [];
    const walk = (v, p) => {
      if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, [...p, Array.isArray(v) && x && x.id ? x.id : k]);
      else if (p.join('.').toLowerCase().includes(q) || String(v).toLowerCase().includes(q)) hits.push(`${p.join('.')} = ${JSON.stringify(v)}`);
    };
    walk(T, []);
    console.log(hits.length ? hits.slice(0, 200).join('\n') : 'Nothing matches.');
  } else if (cmd === 'set') {
    const { keys, value: old } = resolve(T, path), raw = rest.join(' ');
    let next; try { next = JSON.parse(raw); } catch { next = raw; }
    if (typeof old === 'string' && typeof next !== 'string') next = raw; // "set x.name 2024" keeps text as text
    if (kind(old) !== kind(next) && old !== null && next !== null) throw new Error(`${path} is a ${kind(old)}, not a ${kind(next)}: ${raw}`);
    let node = T; for (const k of keys.slice(0, -1)) node = node[k];
    node[keys.at(-1)] = next; writeTune(T);
    console.log(`${path}: ${JSON.stringify(old)} → ${JSON.stringify(next)}`);
  } else if (cmd === 'diff') {
    let before; try { before = JSON.parse(execSync('git show HEAD:src2/tune.json', { stdio: ['ignore', 'pipe', 'ignore'] }).toString()); } catch { console.log('tune.json is not in the last commit yet.'); process.exit(0); }
    const out = [], d = (a, b, p) => {
      if (JSON.stringify(a) === JSON.stringify(b)) return;
      if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b) && (!Array.isArray(a) || a.length === b.length))
        for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) d(a[k], b[k], [...p, Array.isArray(a) && a[k] && a[k].id ? a[k].id : k]);
      else out.push(`${p.join('.')}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
    };
    d(before, T, []);
    console.log(out.length ? out.join('\n') : 'No changes since the last commit.');
  } else throw new Error(`Unknown command "${cmd}". Use get, set, find or diff.`);
} catch (e) { console.error(e.message); process.exit(1); }
