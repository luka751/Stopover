// Turns cache/rail/*.json (OSM passenger rail lines + stations) into dist/rail.json:
//   a 0.02° grid of the inhabited world marking cells that carry track (gzipped bitset),
//   the GeoNames ids of settlements with a station, and the game regions (continents) with enough stations to play.
import fs from 'node:fs'; import zlib from 'node:zlib';
const RES = 0.02, LON0 = -180, LON1 = 180, LAT0 = -56, LAT1 = 72;
const W = Math.round((LON1 - LON0) / RES), H = Math.round((LAT1 - LAT0) / RES);
const bits = new Uint8Array(Math.ceil(W * H / 8));
const setCell = (la, lo) => { const r = Math.floor((LAT1 - la) / RES), c = Math.floor((lo - LON0) / RES); if (r < 0 || r >= H || c < 0 || c >= W) return; const k = r * W + c; bits[k >> 3] |= 1 << (k & 7); };
// settlements for station matching
const KEEP = new Set(['PPL', 'PPLA', 'PPLA2', 'PPLA3', 'PPLA4', 'PPLA5', 'PPLC', 'PPLG', 'PPLS', 'PPLF', 'PPLL', 'PPLR', 'STLMT', 'PPLCH']);
const fold = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, ' ').trim();
const continent = {}; for (const l of fs.readFileSync('cache/countryInfo.txt', 'utf8').split('\n')) { if (l.startsWith('#')) continue; const f = l.split('\t'); if (f.length > 8) continent[f[0]] = f[8]; }
const towns = [], grid = new Map();
for (const l of fs.readFileSync('cache/cities500.txt', 'utf8').split('\n')) {
  const f = l.split('\t'); if (f.length < 15 || !KEEP.has(f[7])) continue;
  const la = +f[4], lo = +f[5]; if (la < LAT0 - 1 || la > LAT1 + 1 || lo < LON0 - 1 || lo > LON1 + 1) continue;
  const t = { gid: +f[0], cc: f[8], la, lo, pop: +f[14] || 0, names: new Set([fold(f[1]), fold(f[2]), ...f[3].split(',').slice(0, 30).map(fold)]) };
  towns.push(t); const k = Math.floor(la * 10) + ':' + Math.floor(lo * 10); (grid.get(k) || grid.set(k, []).get(k)).push(t);
}
const hav = (a, b, c, d) => { const t = Math.PI / 180, x = Math.sin((c - a) * t / 2) ** 2 + Math.cos(a * t) * Math.cos(c * t) * Math.sin((d - b) * t / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
const stationTowns = new Set(), perRegion = {};
let ways = 0, stations = 0, matched = 0;
for (const file of fs.readdirSync('cache/rail').filter(f => f.endsWith('.json'))) {
  const data = JSON.parse(fs.readFileSync('cache/rail/' + file, 'utf8'));
  for (const el of data.elements) {
    if (el.type === 'way' && el.geometry) {
      ways++;
      for (let i = 1; i < el.geometry.length; i++) {
        const a = el.geometry[i - 1], b = el.geometry[i], steps = Math.max(1, Math.ceil(Math.hypot(b.lat - a.lat, b.lon - a.lon) / 0.005));
        for (let s = 0; s <= steps; s++) setCell(a.lat + (b.lat - a.lat) * s / steps, a.lon + (b.lon - a.lon) * s / steps);
      }
    } else if (el.type === 'node') {
      stations++;
      const name = fold((el.tags && (el.tags['name:en'] || el.tags.name)) || '');
      let best = null, bestScore = -1;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const t of grid.get((Math.floor(el.lat * 10) + dy) + ':' + (Math.floor(el.lon * 10) + dx)) || []) {
        const d = hav(el.lat, el.lon, t.la, t.lo), hit = name && [...t.names].some(n => n && name.includes(n));
        if (d > (hit ? 8 : 2.5)) continue;
        const score = (hit ? 1e8 : 0) + t.pop / (1 + d);
        if (score > bestScore) { bestScore = score; best = t; }
      }
      if (best) { matched++; if (!stationTowns.has(best.gid)) { const c = continent[best.cc]; if (c) perRegion[c] = (perRegion[c] || 0) + 1; } stationTowns.add(best.gid); }
    }
  }
  console.log(file, 'done');
}
const gz = zlib.gzipSync(Buffer.from(bits.buffer), { level: 9 });
const regions = Object.keys(perRegion).filter(c => perRegion[c] >= 40);
const out = { res: RES, lon0: LON0, lat1: LAT1, w: W, h: H, bits: gz.toString('base64'), stations: [...stationTowns], regions, perRegion };
fs.writeFileSync('dist/rail.json', JSON.stringify(out));
const railCells = bits.reduce((n, b) => { for (; b; b &= b - 1) n++; return n; }, 0);
console.log({ files: fs.readdirSync('cache/rail').filter(f => f.endsWith('.json')).length, ways, stations, matched, stationTowns: stationTowns.size, perRegion, regions, railCells, gzKB: Math.round(gz.length / 1024), jsonKB: Math.round(JSON.stringify(out).length / 1024) });
