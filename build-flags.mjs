// Flags for Stopover: countries, first-level regions, a few autonomous areas, and notable cities.
//   node build-flags.mjs          download what's missing (politely, resumable), then pack
//   node build-flags.mjs --pack   only re-render and pack what is already downloaded
// Output: dist/flags/base.json (every key's location + country/region flags) and dist/flags/city-N.json shards.
import fs from 'node:fs'; import crypto from 'node:crypto'; import sharp from 'sharp';

const PACK_ONLY = process.argv.includes('--pack');
const UA = { 'User-Agent': 'StopoverGeographyGame/2.0 (personal non-commercial geography game; contact: luka.beradze.mail@gmail.com)' };
const WIDTH = 160, HEIGHT = 108, CITY_SHARDS = 8;
const wd = JSON.parse(fs.readFileSync('cache/wd_flags.json', 'utf8'));
const KEEP = new Set(['PPL', 'PPLA', 'PPLA2', 'PPLA3', 'PPLA4', 'PPLA5', 'PPLC', 'PPLG', 'PPLS', 'PPLF', 'PPLL', 'PPLR', 'STLMT', 'PPLCH']);
const md5 = s => crypto.createHash('md5').update(s).digest('hex');
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (const d of ['cache/flagraw', 'cache/flag2x', 'dist/flags']) fs.mkdirSync(d, { recursive: true });

// ---- what we want, most useful first
const jobs = new Map(), weight = new Map();
const local = (key, path) => jobs.set(key, { src: 'file', name: path });
const commons = (key, file) => jobs.set(key, { src: 'commons', name: file });
for (const l of fs.readFileSync('cache/countryInfo.txt', 'utf8').split('\n')) {
  if (!l || l[0] === '#') continue; const cc = l.split('\t')[0];
  for (const p of [`../geo-game/node_modules/flag-icons/flags/4x3/${cc.toLowerCase()}.svg`, `../geo-game/node_modules/region-flags/svg/${cc}.svg`]) if (fs.existsSync(p)) { local('c:' + cc, p); break; }
}
const CA = { '01': 'AB', '02': 'BC', '03': 'MB', '04': 'NB', '05': 'NL', '07': 'NS', '08': 'ON', '09': 'PE', '10': 'QC', '11': 'SK', '12': 'YT', '13': 'NT', '14': 'NU' };
for (const l of fs.readFileSync('cache/admin1CodesASCII.txt', 'utf8').split('\n')) {
  const f = l.split('\t'); if (!f[3]) continue; const [cc, code] = f[0].split('.');
  const alt = cc === 'US' ? `US-${code}` : cc === 'CA' && CA[code] ? `CA-${CA[code]}` : cc === 'GB' ? `GB-${code}` : null;
  const altPath = alt && `../geo-game/node_modules/region-flags/svg/${alt}.svg`;
  if (altPath && fs.existsSync(altPath)) local('a:' + f[3], altPath); else if (wd[f[3]]) commons('a:' + f[3], wd[f[3]]);
}
for (const l of fs.readFileSync('cache/cities500.txt', 'utf8').split('\n')) {
  const f = l.split('\t'); if (f.length < 15 || !KEEP.has(f[7]) || !wd[f[0]]) continue;
  if (+f[14] >= 20000 || f[7] === 'PPLC') { commons('g:' + f[0], wd[f[0]]); weight.set('g:' + f[0], f[7] === 'PPLC' ? 1e9 : +f[14]); }
}
for (const [k, file] of [['x:Somaliland', 'Somaliland'], ['x:Puntland', 'Puntland'], ['x:Kurdistan Region', 'Kurdistan_Region'], ['x:Northern Cyprus', 'Northern_Cyprus'], ['x:South Ossetia', 'South_Ossetia']]) local(k, `../geo-game/cache/flags/${file}.png`);
const rank = ([key, job]) => job.src === 'file' ? 0 : key[0] === 'a' ? 1 : 2;
const ordered = [...jobs.entries()].sort((a, b) => rank(a) - rank(b) || (weight.get(b[0]) || 0) - (weight.get(a[0]) || 0));

// ---- raw files: originals for SVG (rendered crisply here), a 330px thumbnail for PNG/JPG flags
const isSvg = name => /\.svg$/i.test(name);
const rawPath = job => job.src === 'file' ? job.name : `cache/flagraw/${md5(job.name)}${isSvg(job.name) ? '.svg' : '.png'}`;
const urlFor = name => {
  const n = name.replace(/ /g, '_'), h = md5(n), dir = `${h[0]}/${h.slice(0, 2)}/${encodeURIComponent(n)}`;
  return isSvg(n) ? `https://upload.wikimedia.org/wikipedia/commons/${dir}` : `https://upload.wikimedia.org/wikipedia/commons/thumb/${dir}/330px-${encodeURIComponent(n)}`;
};
let lastReq = 0, fetched = 0;
async function download(job) {
  const out = rawPath(job); if (fs.existsSync(out)) return true;
  for (let attempt = 0; attempt < 6; attempt++) {
    const gap = 2000 - (Date.now() - lastReq); if (gap > 0) await sleep(gap); lastReq = Date.now();
    let r; try { r = await fetch(urlFor(job.name), { headers: UA, signal: AbortSignal.timeout(30000) }); } catch { await sleep(20000); continue; }
    if (r.status === 429 || r.status >= 500) { const wait = Math.max(60, +r.headers.get('retry-after') || 0); console.log(new Date().toISOString(), 'rate limited, waiting', wait, 's'); await sleep(wait * 1000 + 5000); continue; }
    if (!r.ok) return false;
    try { fs.writeFileSync(out, Buffer.from(await r.arrayBuffer())); fetched++; return true; } catch { continue; }
  }
  return false;
}
async function render(job) {
  const raw = rawPath(job); if (!fs.existsSync(raw)) return null;
  const out = `cache/flag2x/${md5(job.src + job.name)}.webp`;
  if (!fs.existsSync(out)) {
    try { fs.writeFileSync(out, await sharp(raw, { density: 300 }).resize({ width: WIDTH, height: HEIGHT, fit: 'inside' }).webp({ quality: 82 }).toBuffer()); } catch { return null; }
  }
  return out;
}
async function pack() {
  const shards = { base: [] }, dedupe = new Map(), keys = {};
  for (const [key, job] of ordered) {
    // until a sharp original is downloaded, fall back to the earlier small thumbnail
    const old = `cache/flagthumbs/${md5(job.src + job.name)}.webp`;
    const img = (await render(job)) || (fs.existsSync(old) ? old : null); if (!img) continue;
    const shard = key[0] === 'g' ? 'city-' + (parseInt(md5(key).slice(0, 6), 16) % CITY_SHARDS) : 'base';
    const d = shard + '|' + img;
    if (!dedupe.has(d)) { (shards[shard] ||= []).push(fs.readFileSync(img).toString('base64')); dedupe.set(d, shards[shard].length - 1); }
    keys[key] = [shard, dedupe.get(d)];
  }
  let total = 0;
  for (const [name, files] of Object.entries(shards)) {
    const json = JSON.stringify(name === 'base' ? { keys, files } : { files });
    fs.writeFileSync(`dist/flags/${name}.json.tmp`, json); fs.renameSync(`dist/flags/${name}.json.tmp`, `dist/flags/${name}.json`); total += json.length;
  }
  const count = p => Object.keys(keys).filter(k => k[0] === p).length;
  console.log(new Date().toISOString(), `packed ${Object.keys(keys).length} flags (countries ${count('c')}, regions ${count('a')}, cities ${count('g')}), ${(total / 1e6).toFixed(1)} MB`);
}

if (!PACK_ONLY) {
  let done = 0, failed = 0;
  for (const [, job] of ordered) {
    if (job.src === 'commons' && !(await download(job))) failed++;
    if (++done % 100 === 0) { console.log(new Date().toISOString(), `${done}/${ordered.length} checked, ${fetched} downloaded this run, ${failed} unavailable`); if (fetched) await pack(); }
  }
}
await pack();
console.log(new Date().toISOString(), 'finished');
