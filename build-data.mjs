// Packs GeoNames cities500 + Natural Earth land (world-atlas) into one gzipped, base64 blob for the page.
import fs from 'node:fs'; import zlib from 'node:zlib'; import * as topojson from 'topojson-client'; import { geoContains, geoBounds } from 'd3-geo';
// Disputed and breakaway territories, shown as part of the country the UN recognises (Western Sahara stays its own territory,
// as the UN lists it). Outlines from Natural Earth 10m "admin 0 disputed areas". Every settlement inside one is tagged with it.
const AREAS = [
  { name: 'Crimea', brk: ['Crimea'], cc: 'UA' },
  { name: 'Abkhazia', brk: ['Abkhazia'], cc: 'GE' },
  { name: 'South Ossetia', brk: ['South Ossetia'], cc: 'GE' },
  { name: 'Northern Cyprus', brk: ['N. Cyprus'], cc: 'CY' },
  { name: 'Western Sahara', brk: ['W. Sahara'], cc: 'EH' },
  { name: 'Transnistria', brk: ['Transnistria'], cc: 'MD' },
  { name: 'Somaliland', brk: ['Somaliland'], cc: 'SO' },
];
{
  const dis = JSON.parse(fs.readFileSync('cache/raster/ne_10m_admin_0_disputed_areas.geojson', 'utf8'));
  for (const a of AREAS) { a.features = dis.features.filter(f => a.brk.includes(f.properties.BRK_NAME)); if (!a.features.length) throw new Error('no outline for ' + a.name); a.bounds = a.features.map(f => geoBounds(f)); }
}
const areaAt = (lat, lon) => { for (let i = 0; i < AREAS.length; i++) { const a = AREAS[i]; for (let k = 0; k < a.features.length; k++) { const [[x0, y0], [x1, y1]] = a.bounds[k]; if (lon >= x0 && lon <= x1 && lat >= y0 && lat <= y1 && geoContains(a.features[k], [lon, lat])) return i + 1; } } return 0; };
const KEEP = new Set(['PPL', 'PPLA', 'PPLA2', 'PPLA3', 'PPLA4', 'PPLA5', 'PPLC', 'PPLG', 'PPLS', 'PPLF', 'PPLL', 'PPLR', 'STLMT', 'PPLCH']);
const countries = {}; // iso -> {name, continent}
const numToCc = {};
for (const l of fs.readFileSync('cache/countryInfo.txt', 'utf8').split('\n')) { if (!l || l[0] === '#') continue; const f = l.split('\t'); countries[f[0]] = { name: f[4], cont: f[8] }; numToCc[String(+f[2])] = f[0]; }
const admin1 = {}; for (const l of fs.readFileSync('cache/admin1CodesASCII.txt', 'utf8').split('\n')) { const f = l.split('\t'); if (f[1]) admin1[f[0]] = [f[1], +f[3]]; }
const fold = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, ' ').trim();

const rows = [];
for (const l of fs.readFileSync('cache/cities500.txt', 'utf8').split('\n')) {
  const f = l.split('\t'); if (f.length < 15 || !KEEP.has(f[7]) || !countries[f[8]]) continue;
  const pop = +f[14] || 0; const name = f[1];
  let alts = [];
  if (pop >= 30000) {
    const seen = new Set([fold(name), fold(f[2])]);
    for (const a of f[3].split(',')) { if (!a || a.length > 28 || /\d/.test(a) || !/^[\p{Script=Latin}\s'’.\-]+$/u.test(a)) continue; const k = fold(a); if (!k || seen.has(k)) continue; seen.add(k); alts.push(a); if (alts.length >= 5) break; }
  }
  const lat = +f[4], lon = +f[5], area = areaAt(lat, lon);
  // a settlement in a disputed territory belongs to the recognised country (GeoNames files some of Western Sahara under Morocco)
  const cc = area ? AREAS[area - 1].cc : f[8];
  rows.push({ name, alts, gid: +f[0], lat, lon, fc: f[7], cc, area, adm: admin1[f[8] + '.' + f[10]] ? f[8] + '.' + f[10] : '', pop });
}
rows.sort((a, b) => b.pop - a.pop || (a.fc === 'PPLC' ? -1 : 0));
const ccList = Object.keys(countries), ccIdx = Object.fromEntries(ccList.map((c, i) => [c, i]));
const admList = [...new Set(rows.map(r => r.adm))], admIdx = Object.fromEntries(admList.map((a, i) => [a, i]));
const FC = ['PPL', 'PPLC', 'PPLA', 'PPLA2', 'PPLA3', 'PPLA4', 'PPLA5', 'PPLG', 'PPLS', 'PPLF', 'PPLL', 'PPLR', 'STLMT', 'PPLCH'];
const n = rows.length;
const REC = 18, bin = Buffer.alloc(n * REC); let o = 0;
for (const r of rows) {
  bin.writeInt32LE(Math.round(r.lat * 1e5), o); bin.writeInt32LE(Math.round(r.lon * 1e5), o + 4);
  bin.writeUInt32LE(r.pop, o + 8); bin.writeUInt8(ccIdx[r.cc], o + 12); bin.writeUInt8(FC.indexOf(r.fc), o + 13); bin.writeUInt32LE(r.gid, o + 14); o += REC;
}
const admBin = Buffer.alloc(n * 2); rows.forEach((r, i) => admBin.writeUInt16LE(admIdx[r.adm], i * 2));
const areaBin = Uint8Array.from(rows.map(r => r.area));
console.log('settlements in disputed territories', AREAS.map((a, i) => a.name + ' ' + rows.filter(r => r.area === i + 1).length).join(', '));
const names = rows.map(r => r.alts.length ? r.name + '\t' + r.alts.join('\t') : r.name).join('\n');

// ---- land raster, 0.1° cells, even-odd scanline per polygon
const W = 3600, H = 1800, mask = new Uint8Array(Math.ceil(W * H / 8));
const land = JSON.parse(fs.readFileSync('node_modules/world-atlas/land-50m.json', 'utf8'));
const landGeo = topojson.feature(land, land.objects.land);
const polys = landGeo.features.flatMap(f => f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates);
for (const poly of polys) {
  let minY = 90, maxY = -90; for (const [, y] of poly[0]) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const r0 = Math.max(0, Math.floor((90 - maxY) * 10)), r1 = Math.min(H - 1, Math.ceil((90 - minY) * 10));
  for (let r = r0; r <= r1; r++) {
    const lat = 90 - (r + 0.5) / 10, xs = [];
    for (const ring of poly) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x1, y1] = ring[i], [x2, y2] = ring[j];
      if ((y1 > lat) !== (y2 > lat)) xs.push(x1 + (lat - y1) * (x2 - x1) / (y2 - y1));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil((xs[k] + 180) * 10 - 0.5)), c1 = Math.min(W - 1, Math.floor((xs[k + 1] + 180) * 10 - 0.5));
      for (let c = c0; c <= c1; c++) { const b = r * W + c; mask[b >> 3] |= 1 << (b & 7); }
    }
  }
}
const numToCcTop = numToCc;
// ---- map geometry: land outlines + internal borders as quantized polylines (0.01°)
const countriesTopo = JSON.parse(fs.readFileSync('node_modules/world-atlas/countries-50m.json', 'utf8'));
const nameToCc = { 'Kosovo': 'XK', 'N. Cyprus': 'CY', 'Somaliland': 'SO', 'Siachen Glacier': 'IN', 'Indian Ocean Ter.': 'IO', 'Ashmore and Cartier Is.': 'AU', 'Br. Indian Ocean Ter.': 'IO', 'Fr. S. Antarctic Lands': 'TF', 'Cyprus U.N. Buffer Zone': 'CY', 'Baikonur': 'KZ', 'Antarctica': 'AQ', 'Norway': 'NO', 'France': 'FR' };
Object.assign(nameToCc, { Crimea: 'UA' });
// Natural Earth draws Crimea inside Russia: split that polygon out as its own shape and give it to Ukraine
{
  const geoms = countriesTopo.objects.countries.geometries, ru = geoms.find(g => g.properties.name === 'Russia');
  const k = topojson.feature(countriesTopo, ru).geometry.coordinates.findIndex(poly => geoContains({ type: 'Polygon', coordinates: poly }, [34.1, 44.95]));
  if (k < 0) throw new Error('Crimea polygon not found in Russia');
  geoms.push({ type: 'Polygon', arcs: ru.arcs[k], properties: { name: 'Crimea' } }); ru.arcs.splice(k, 1);
}
const geomCc = g => numToCcTop[String(+g.id)] || nameToCc[g.properties.name];
// borders only between different recognised countries; the disputed lines are drawn separately
const borders = topojson.mesh(countriesTopo, countriesTopo.objects.countries, (a, b) => a !== b && geomCc(a) !== geomCc(b));
const lines = [...polys.flat(), ...borders.coordinates];
const enc = ls => { const parts = []; for (const l of ls) { parts.push(l.length); let px = 0, py = 0; for (const [x, y] of l) { const qx = Math.round(x * 100), qy = Math.round(y * 100); parts.push(qx - px, qy - py); px = qx; py = qy; } } return Int32Array.from(parts); };
const landArr = enc(polys.flat()), borderArr = enc(borders.coordinates);
const disputedArr = enc(AREAS.flatMap(a => a.features.flatMap(f => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).flat())));

// ---- countries: filled shapes for the political map and a 0.1° raster to tell which country a point is in
const cfeat = topojson.feature(countriesTopo, countriesTopo.objects.countries).features;
const craster = new Uint8Array(W * H), shapeParts = [], unmatched = [];
for (const f of cfeat) {
  const cc = numToCc[String(+f.id)] || nameToCc[f.properties.name];
  if (!cc || ccIdx[cc] === undefined) { unmatched.push(f.properties.name); continue; }
  const cpolys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const poly of cpolys) {
    shapeParts.push(ccIdx[cc], poly.length);
    for (const ring of poly) { shapeParts.push(ring.length); let px = 0, py = 0; for (const [x, y] of ring) { const qx = Math.round(x * 100), qy = Math.round(y * 100); shapeParts.push(qx - px, qy - py); px = qx; py = qy; } }
    let minY = 90, maxY = -90; for (const [, y] of poly[0]) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    const r0 = Math.max(0, Math.floor((90 - maxY) * 10)), r1 = Math.min(H - 1, Math.ceil((90 - minY) * 10));
    for (let r = r0; r <= r1; r++) {
      const lat = 90 - (r + 0.5) / 10, xs = [];
      for (const ring of poly) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [x1, y1] = ring[i], [x2, y2] = ring[j]; if ((y1 > lat) !== (y2 > lat)) xs.push(x1 + (lat - y1) * (x2 - x1) / (y2 - y1)); }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) { const c0 = Math.max(0, Math.ceil((xs[k] + 180) * 10 - 0.5)), c1 = Math.min(W - 1, Math.floor((xs[k + 1] + 180) * 10 - 0.5)); for (let c = c0; c <= c1; c++) craster[r * W + c] = ccIdx[cc] + 1; }
    }
  }
}
// Western Sahara: the 50m Morocco shape covers most of it, so its full 10m outline is added as its own shape and raster,
// drawn after Morocco (meta.drawLast) so it shows on top
{
  const ci = ccIdx.EH, a = AREAS.find(x => x.cc === 'EH');
  for (const f of a.features) for (const poly of (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates)) {
    shapeParts.push(ci, poly.length);
    for (const ring of poly) { shapeParts.push(ring.length); let px = 0, py = 0; for (const [x, y] of ring) { const qx = Math.round(x * 100), qy = Math.round(y * 100); shapeParts.push(qx - px, qy - py); px = qx; py = qy; } }
    let minY = 90, maxY = -90; for (const [, y] of poly[0]) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    for (let r = Math.max(0, Math.floor((90 - maxY) * 10)); r <= Math.min(H - 1, Math.ceil((90 - minY) * 10)); r++) {
      const lat = 90 - (r + 0.5) / 10, xs = [];
      for (const ring of poly) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [x1, y1] = ring[i], [x2, y2] = ring[j]; if ((y1 > lat) !== (y2 > lat)) xs.push(x1 + (lat - y1) * (x2 - x1) / (y2 - y1)); }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let c = Math.max(0, Math.ceil((xs[k] + 180) * 10 - 0.5)); c <= Math.min(W - 1, Math.floor((xs[k + 1] + 180) * 10 - 0.5)); c++) if (craster[r * W + c]) craster[r * W + c] = ci + 1;
    }
  }
}
// settlements on coasts or small islands can fall outside the 50m shapes: stamp their own cell
for (const r of rows) { const rr = Math.floor((90 - r.lat) * 10), c = Math.floor((r.lon + 180) * 10); if (rr >= 0 && rr < H && c >= 0 && c < W && !craster[rr * W + c]) craster[rr * W + c] = ccIdx[r.cc] + 1; }
console.log('country shapes unmatched:', unmatched.join(', '));
const shapeArr = Int32Array.from(shapeParts);
// ---- airports (OurAirports, public domain): scheduled large/medium airports attached to the settlement they serve
const airLevel = new Uint8Array(n), iata = {};
{
  const parse = l => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') { q = !q; continue; } if (ch === ',' && !q) { out.push(cur); cur = ''; continue; } cur += ch; } out.push(cur); return out; };
  const lines = fs.readFileSync('cache/airports.csv', 'utf8').split('\n'), hdr = parse(lines[0]), ix = k => hdr.indexOf(k);
  const cell = new Map(); rows.forEach((r, i) => { const k = Math.floor(r.lat * 2) + ':' + Math.floor(r.lon * 2); (cell.get(k) || cell.set(k, []).get(k)).push(i); });
  const hav = (a, b, c, d) => { const R = 6371, t = Math.PI / 180, x = Math.sin((c - a) * t / 2) ** 2 + Math.cos(a * t) * Math.cos(c * t) * Math.sin((d - b) * t / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
  let attached = 0, total = 0;
  for (const l of lines.slice(1)) {
    const f = parse(l); if (f.length < 14 || f[ix('scheduled_service')] !== 'yes') continue;
    const level = f[ix('type')] === 'large_airport' ? 2 : f[ix('type')] === 'medium_airport' ? 1 : 0; if (!level) continue;
    total++;
    const la = +f[ix('latitude_deg')], lo = +f[ix('longitude_deg')], muni = fold(f[ix('municipality')] || '');
    let best = -1, bestScore = -1;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const i of cell.get((Math.floor(la * 2) + dy) + ':' + (Math.floor(lo * 2) + dx)) || []) {
      const r = rows[i], d = hav(la, lo, r.lat, r.lon); if (d > 60) continue;
      const nameHit = muni && (fold(r.name) === muni || r.alts.some(a => fold(a) === muni));
      const score = (nameHit ? 1e7 : 0) + r.pop / (1 + d / 8);
      if (d <= (nameHit ? 60 : 30) && score > bestScore) { bestScore = score; best = i; }
    }
    if (best >= 0) { attached++; if (level > airLevel[best]) { airLevel[best] = level; if (f[ix('iata_code')]) iata[best] = f[ix('iata_code')]; } else if (level === airLevel[best] && !iata[best] && f[ix('iata_code')]) iata[best] = f[ix('iata_code')]; }
  }
  console.log('airports', total, 'attached', attached, 'large-airport cities', airLevel.filter(x => x === 2).length, 'medium-only', airLevel.filter(x => x === 1).length);
}
const meta = { v: 2, rec: REC, n, countries: ccList.map(c => [c, countries[c].name, countries[c].cont]), adm: admList.map(k => k ? [admin1[k][0], admin1[k][1], k] : ['', 0, '']), fc: FC, maskW: W, maskH: H, iata, bytes: { air: airLevel.length, bin: bin.length, adm: admBin.length, mask: mask.length, land: landArr.byteLength, border: borderArr.byteLength, shapes: shapeArr.byteLength, craster: craster.length, area: areaBin.length, disputed: disputedArr.byteLength }, areas: AREAS.map(a => [a.name, a.cc]), drawLast: ['EH'] };
const metaBuf = Buffer.from(JSON.stringify(meta)), namesBuf = Buffer.from(names);
const head = Buffer.alloc(8); head.writeUInt32LE(metaBuf.length, 0); head.writeUInt32LE(namesBuf.length, 4);
const blob = Buffer.concat([head, metaBuf, namesBuf, Buffer.from(airLevel.buffer), bin, admBin, Buffer.from(mask.buffer), Buffer.from(landArr.buffer), Buffer.from(borderArr.buffer), Buffer.from(shapeArr.buffer), Buffer.from(craster.buffer), Buffer.from(areaBin.buffer), Buffer.from(disputedArr.buffer)]);
const gz = zlib.gzipSync(blob, { level: 9 });
fs.writeFileSync('data.b64', gz.toString('base64'));
console.log({ settlements: n, rawMB: (blob.length / 1e6).toFixed(2), gzMB: (gz.length / 1e6).toFixed(2), b64MB: (gz.length * 4 / 3 / 1e6).toFixed(2), landPts: (landArr.length), namesMB: (namesBuf.length / 1e6).toFixed(2) });
// sanity: mask lookups
const isLand = (lat, lon) => { const r = Math.floor((90 - lat) * 10), c = Math.floor((lon + 180) * 10); const b = r * W + c; return !!(mask[b >> 3] & (1 << (b & 7))); };
for (const [nm, la, lo] of [['Munich', 48.137, 11.575], ['Mediterranean', 35.5, 18], ['Nicosia', 35.17, 33.35], ['Atlantic', 40, -40], ['Caspian', 42, 50.5], ['Sahara', 23, 10]]) console.log(nm, isLand(la, lo));
