// Passenger railway lines (main/branch, no sidings or yards) and stations from OpenStreetMap, fetched in map tiles.
// A tile that fails is split into four smaller tiles. Tiles with no towns are skipped.
import fs from 'node:fs';
const UA = 'StopoverGeographyGame/2.0 (personal non-commercial geography game; contact: luka.beradze.mail@gmail.com)';
const ENDPOINT = 'https://overpass-api.de/api/interpreter';
const sleep = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync('cache/rail', { recursive: true });
const LAT0 = 34, LAT1 = 72, LON0 = -25, LON1 = 60, STEP = 5;
const towns = new Set();
for (const l of fs.readFileSync('cache/cities500.txt', 'utf8').split('\n')) { const f = l.split('\t'); if (f.length > 14 && +f[14] >= 3000) towns.add(Math.floor(+f[4]) + ':' + Math.floor(+f[5])); }
const hasTowns = (s, w, n, e) => { for (let la = Math.floor(s); la < n; la++) for (let lo = Math.floor(w); lo < e; lo++) if (towns.has(la + ':' + lo)) return true; return false; };
const queue = [];
for (let la = LAT0; la < LAT1; la += STEP) for (let lo = LON0; lo < LON1; lo += STEP) queue.push([la, lo, Math.min(la + STEP, LAT1), Math.min(lo + STEP, LON1)]);
let done = 0, skipped = 0;
while (queue.length) {
  const [s, w, n, e] = queue.shift(), name = `tile_${s}_${w}_${n - s}.json`, out = 'cache/rail/' + name;
  if (!hasTowns(s, w, n, e)) { skipped++; continue; }
  if (fs.existsSync(out) && fs.statSync(out).size > 200) { done++; continue; }
  const bbox = `(${s},${w},${n},${e})`;
  const q = `[out:json][timeout:600];(way["railway"="rail"]["usage"~"^(main|branch)$"]["service"!~"."]${bbox};node["railway"~"^(station|halt)$"]["train"!="no"]["subway"!="yes"]${bbox};);out geom qt;`;
  let ok = false;
  for (let attempt = 0; attempt < 3 && !ok; attempt++) {
    const t0 = Date.now();
    try {
      const r = await fetch(ENDPOINT, { method: 'POST', body: new URLSearchParams({ data: q }), headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(700000) });
      const text = await r.text();
      if (r.ok && text.startsWith('{') && !/"remark":\s*"runtime error/.test(text.slice(-500))) { fs.writeFileSync(out, text); ok = true; done++; console.log(new Date().toISOString(), name, (text.length / 1e6).toFixed(1) + 'MB', Math.round((Date.now() - t0) / 1000) + 's', `${queue.length} left`); }
      else { console.log(name, 'attempt', attempt, r.status); await sleep(r.status === 429 ? 60000 : 20000); }
    } catch (err) { console.log(name, 'attempt', attempt, err.name); await sleep(20000); }
  }
  if (!ok && n - s > 1.25) { const hs = (n - s) / 2, hw = (e - w) / 2; for (const [a, b] of [[s, w], [s, w + hw], [s + hs, w], [s + hs, w + hw]]) queue.unshift([a, b, a + hs, b + hw]); console.log(name, 'split into quarters'); }
  await sleep(8000);
}
console.log(new Date().toISOString(), 'rail download finished', { done, skipped });
