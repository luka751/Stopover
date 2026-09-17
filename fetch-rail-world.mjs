// Passenger railway lines and stations from OpenStreetMap for the whole inhabited world, in 5° tiles.
// Same query and cache as fetch-rail.mjs (tiles already downloaded for Europe are reused).
// Busiest tiles go first, so a partial download already covers the places people travel most.
// A tile that fails is split into four smaller tiles. Tiles with no towns are skipped.
import fs from 'node:fs';
const UA = 'StopoverGeographyGame/2.0 (personal non-commercial geography game; contact: luka.beradze.mail@gmail.com)';
// several public Overpass servers: each attempt goes to the one with the best recent record
const SERVERS = ['https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'].map(url => ({ url, ok: 0, fail: 0 }));
const pickServer = tried => SERVERS.filter(x => !tried.has(x.url)).sort((a, b) => (b.ok - 2 * b.fail) - (a.ok - 2 * a.fail))[0] || SERVERS[0];
const sleep = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync('cache/rail', { recursive: true });
const LAT0 = -56, LAT1 = 72, LON0 = -180, LON1 = 180, STEP = 5;
const towns = new Map();
for (const l of fs.readFileSync('cache/cities500.txt', 'utf8').split('\n')) {
  const f = l.split('\t'); if (f.length > 14 && +f[14] >= 3000) { const k = Math.floor(+f[4]) + ':' + Math.floor(+f[5]); towns.set(k, (towns.get(k) || 0) + +f[14]); }
}
const popIn = (s, w, n, e) => { let p = 0; for (let la = Math.floor(s); la < n; la++) for (let lo = Math.floor(w); lo < e; lo++) p += towns.get(la + ':' + lo) || 0; return p; };
const nameOf = (s, w, size) => `tile_${s}_${w}_${size}.json`;
const have = name => fs.existsSync('cache/rail/' + name) && fs.statSync('cache/rail/' + name).size > 200;
// a tile counts as done if its file exists, or all four of its quarters are done
const done = (s, w, size) => have(nameOf(s, w, size)) || (size > 1.25 && [[s, w], [s, w + size / 2], [s + size / 2, w], [s + size / 2, w + size / 2]].every(([a, b]) => done(a, b, size / 2)));
const queue = [];
for (let la = LAT0; la < LAT1; la += STEP) for (let lo = LON0; lo < LON1; lo += STEP) {
  const n = Math.min(la + STEP, LAT1), e = Math.min(lo + STEP, LON1), pop = popIn(la, lo, n, e);
  if (pop > 0 && !done(la, lo, n - la)) queue.push([la, lo, n, e, pop]);
}
queue.sort((a, b) => b[4] - a[4]);
console.log(new Date().toISOString(), 'tiles to fetch', queue.length);
let fetched = 0;
// one worker per server, running side by side; each tries its own server first, then the others
async function worker(home) {
  while (queue.length) {
    const [s, w, n, e] = queue.shift(), name = nameOf(s, w, n - s), out = 'cache/rail/' + name;
    if (done(s, w, n - s) || !popIn(s, w, n, e)) continue;
    const bbox = `(${s},${w},${n},${e})`;
    const q = `[out:json][timeout:600];(way["railway"="rail"]["usage"~"^(main|branch)$"]["service"!~"."]${bbox};node["railway"~"^(station|halt)$"]["train"!="no"]["subway"!="yes"]${bbox};);out geom qt;`;
    let ok = false;
    const tried = new Set();
    for (let attempt = 0; attempt < 4 && !ok; attempt++) {
      const t0 = Date.now(), server = attempt === 0 ? SERVERS[home] : pickServer(tried); tried.add(server.url);
      try {
        const r = await fetch(server.url, { method: 'POST', body: new URLSearchParams({ data: q }), headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(700000) });
        const text = await r.text();
        if (r.ok && text.startsWith('{') && !/"remark":\s*"runtime error/.test(text.slice(-500))) { fs.writeFileSync(out, text); ok = true; fetched++; server.ok++; console.log(new Date().toISOString(), name, (text.length / 1e6).toFixed(1) + 'MB', Math.round((Date.now() - t0) / 1000) + 's', `${queue.length} left`, new URL(server.url).host); }
        else { server.fail++; console.log(name, 'attempt', attempt, r.status, new URL(server.url).host); await sleep(r.status === 429 ? 15000 : 3000); }
      } catch (err) { server.fail++; console.log(name, 'attempt', attempt, err.name, new URL(server.url).host); await sleep(3000); }
    }
    if (!ok && n - s > 1.25) { const hs = (n - s) / 2, hw = (e - w) / 2; for (const [a, b] of [[s, w], [s, w + hw], [s + hs, w], [s + hs, w + hw]]) queue.unshift([a, b, a + hs, b + hw, 0]); console.log(name, 'split into quarters'); }
    else if (!ok) console.log(name, 'gave up');
    await sleep(1500);
  }
}
await Promise.all(SERVERS.map((_, i) => worker(i)));
console.log(new Date().toISOString(), 'world rail download finished', { fetched });
