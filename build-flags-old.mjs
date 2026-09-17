// Builds flags.bin: small WebP flags for countries, first-level regions (states, provinces, constituent countries,
// autonomous republics), notable cities, and a few breakaway/autonomous areas GeoNames has no region for.
import fs from 'node:fs'; import crypto from 'node:crypto'; import sharp from 'sharp';
const UA = { 'User-Agent': 'stopover-game/1.0 (personal project; flags for a geography game)' };
const wd = JSON.parse(fs.readFileSync('cache/wd_flags.json', 'utf8'));
const KEEP = new Set(['PPL', 'PPLA', 'PPLA2', 'PPLA3', 'PPLA4', 'PPLA5', 'PPLC', 'PPLG', 'PPLS', 'PPLF', 'PPLL', 'PPLR', 'STLMT', 'PPLCH']);
const jobs = new Map(), weight = new Map(); // key -> { src: 'commons'|'file', name }
const commons = (key, file) => jobs.set(key, { src: 'commons', name: file });
const local = (key, path) => jobs.set(key, { src: 'file', name: path });

// countries & territories: bundled SVGs
for (const l of fs.readFileSync('cache/countryInfo.txt', 'utf8').split('\n')) {
  if (!l || l[0] === '#') continue; const cc = l.split('\t')[0];
  for (const p of [`../geo-game/node_modules/flag-icons/flags/4x3/${cc.toLowerCase()}.svg`, `../geo-game/node_modules/region-flags/svg/${cc}.svg`]) if (fs.existsSync(p)) { local('c:' + cc, p); break; }
}
// first-level regions
const CA = { '01': 'AB', '02': 'BC', '03': 'MB', '04': 'NB', '05': 'NL', '07': 'NS', '08': 'ON', '09': 'PE', '10': 'QC', '11': 'SK', '12': 'YT', '13': 'NT', '14': 'NU' };
for (const l of fs.readFileSync('cache/admin1CodesASCII.txt', 'utf8').split('\n')) {
  const f = l.split('\t'); if (!f[3]) continue; const [cc, code] = f[0].split('.');
  const alt = cc === 'US' ? `US-${code}` : cc === 'CA' && CA[code] ? `CA-${CA[code]}` : cc === 'GB' ? `GB-${code}` : null;
  const altPath = alt && `../geo-game/node_modules/region-flags/svg/${alt}.svg`;
  if (altPath && fs.existsSync(altPath)) local('a:' + f[3], altPath);
  else if (wd[f[3]]) commons('a:' + f[3], wd[f[3]]);
}
// cities: 20k+ people, and every capital
for (const l of fs.readFileSync('cache/cities500.txt', 'utf8').split('\n')) {
  const f = l.split('\t'); if (f.length < 15 || !KEEP.has(f[7]) || !wd[f[0]]) continue;
  if (+f[14] >= 20000 || f[7] === 'PPLC') { commons('g:' + f[0], wd[f[0]]); weight.set('g:' + f[0], f[7] === 'PPLC' ? 1e9 : +f[14]); }
}
// areas GeoNames has no region for
for (const [k, file] of [['x:Somaliland', 'Somaliland'], ['x:Puntland', 'Puntland'], ['x:Kurdistan Region', 'Kurdistan_Region'], ['x:Northern Cyprus', 'Northern_Cyprus'], ['x:South Ossetia', 'South_Ossetia']])
  local(k, `../geo-game/cache/flags/${file}.png`);

fs.mkdirSync('cache/flagthumbs', { recursive: true });
let errors = 0; const statuses = {}; let lastReq = 0;
const politeWait = async () => { const gap = 1100 - (Date.now() - lastReq); if (gap > 0) await sleep(gap); lastReq = Date.now(); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const thumbUrl = name => {
  const n = name.replace(/ /g, '_'), h = crypto.createHash('md5').update(n).digest('hex');
  const base = `https://upload.wikimedia.org/wikipedia/commons/thumb/${h[0]}/${h.slice(0, 2)}/${encodeURIComponent(n)}/120px-${encodeURIComponent(n)}`;
  const original = `https://upload.wikimedia.org/wikipedia/commons/${h[0]}/${h.slice(0, 2)}/${encodeURIComponent(n)}`;
  return /\.svg$/i.test(n) ? [original, base + '.png'] : [base, original];
};
const outName = job => `cache/flagthumbs/${crypto.createHash('md5').update(job.src + job.name).digest('hex')}.webp`;
async function make(job) {
  const out = outName(job); if (fs.existsSync(out)) return true;
  let input;
  if (job.src === 'file') input = fs.readFileSync(job.name);
  else {
    for (const url of thumbUrl(job.name)) {
      for (let i = 0; i < 5; i++) {
        await politeWait();
        let r; try { r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) }); } catch (e) { errors++; if (errors % 20 === 1) console.log('fetch error', e.cause?.code || e.name); await sleep(3000 * (i + 1)); continue; }
        if (r.status !== 200) { statuses[r.status] = (statuses[r.status] || 0) + 1; }
        if (r.status === 429 || r.status >= 500) { const wait = (+r.headers.get('retry-after') || 30) * 1000; console.log('backing off', wait / 1000, 's'); await sleep(wait + 2000); continue; }
        if (r.ok) { try { input = Buffer.from(await r.arrayBuffer()); } catch {} }
        break;
      }
      if (input) break;
    }
    if (!input) return false;
  }
  try {
    const buf = await sharp(input, { density: 72 }).resize({ width: 72, height: 54, fit: 'inside' }).webp({ quality: 78 }).toBuffer();
    fs.writeFileSync(out, buf); return true;
  } catch { return false; }
}
const order = [...jobs.entries()].sort((a, b) => (a[1].src === 'file' ? 0 : a[0][0] === 'a' ? 1 : 2) - (b[1].src === 'file' ? 0 : b[0][0] === 'a' ? 1 : 2) || (weight.get(b[0]) || 0) - (weight.get(a[0]) || 0));
function pack() {
  // flags.json: { files: [base64 webp…], keys: { key: fileIndex } } (JSON so it can ship as an Artifact supporting file)
  const files = [], fileIdx = new Map(), keys = {};
  for (const [key, job] of jobs) {
    const p = outName(job); if (!fs.existsSync(p)) continue;
    if (!fileIdx.has(p)) { fileIdx.set(p, files.length); files.push(fs.readFileSync(p).toString('base64')); }
    keys[key] = fileIdx.get(p);
  }
  fs.mkdirSync('dist', { recursive: true });
  const json = JSON.stringify({ files, keys });
  fs.writeFileSync('dist/flags.json.tmp', json); fs.renameSync('dist/flags.json.tmp', 'dist/flags.json');
  console.log('packed', Object.keys(keys).length, 'keys,', files.length, 'images,', (json.length / 1e6).toFixed(2), 'MB; failed', failed);
}
const unique = [...new Map(order.map(([, j]) => [outName(j), j])).values()];
console.log('keys', jobs.size, 'unique images', unique.length);
let done = 0, failed = 0, idx = 0;
while (idx < unique.length) { const j = unique[idx++]; if (!(await make(j))) failed++; if (++done % 150 === 0) { console.log(done, 'done', failed, 'failed', JSON.stringify(statuses)); pack(); } }
pack();
