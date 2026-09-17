// ================= utilities =================
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = n => Math.round(n).toLocaleString('en-US');
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
// toasts queue up, so a new flag and an achievement on the same stop are both seen
let toastTimer = 0; const toastQueue = [];
function toast(text) { toastQueue.push(text); if (toastQueue.length === 1) showToast(); }
function showToast() {
  const t = $('toast'); t.textContent = toastQueue[0]; t.hidden = false; clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastQueue.shift(); if (toastQueue.length) showToast(); else t.hidden = true; }, toastQueue.length > 1 ? 2400 : 3400);
}

// ================= rules =================
const VEHICLES = {
  car:  { id: 'car', name: 'Car',  icon: '🚗', tank: 450, gauge: 'Fuel', road: 50, ferry: true, blurb: '450 km tank · short straits by road, ferries for the rest' },
  bike: { id: 'bike', name: 'Bike', icon: '🚲', tank: 130, gauge: 'Energy', road: 15, ferry: true, blurb: '130 km of legs · perfect for learning small towns' },
  boat: { id: 'boat', name: 'Boat', icon: '⛵', tank: 650, gauge: 'Provisions', coastal: true, land: 60, blurb: '650 km of provisions · coastal ports only' },
  train: { id: 'train', name: 'Train', icon: '🚆', tank: 550, gauge: 'Rail range', rail: true, blurb: '550 km of real track · stations only' },
};
const TIERS = [
  { id: 'capital', label: 'Capital', pts: 10, refill: 1.0, rank: 0, test: (p, cap) => cap },
  { id: 'metropolis', label: 'Metropolis', pts: 10, refill: 1.0, rank: 0, test: p => p >= 1e6, note: '1M+' },
  { id: 'city', label: 'City', pts: 20, refill: 0.8, rank: 1, test: p => p >= 250000, note: '250k+' },
  { id: 'large-town', label: 'Large town', pts: 35, refill: 0.6, rank: 2, test: p => p >= 50000, note: '50k+' },
  { id: 'town', label: 'Town', pts: 55, refill: 0.45, rank: 3, test: p => p >= 10000, note: '10k+' },
  { id: 'village', label: 'Village', pts: 80, refill: 0.3, rank: 4, test: () => true, note: 'under 10k' },
];
// how much a stop pays, given how many times you have stopped there before
function familiarity(before) {
  if (before === 0) return { mult: 1.5, label: 'first visit' };
  if (before === 1) return { mult: 1, label: '2nd visit' };
  if (before === 2) return { mult: 0.75, label: '3rd visit' };
  if (before === 3) return { mult: 0.6, label: '4th visit' };
  return { mult: before <= 5 ? 0.5 : 0.35, label: `${before + 1}th visit` };
}
const TICKET_BONUS = 25, SCOUT_COST = 20, REVEAL_COST = 10, HELP_COST = 75, FERRY_MAX = 1200;
const REGIONS = [{ id: 'EU', name: 'Europe' }, { id: 'AS', name: 'Asia' }, { id: 'AF', name: 'Africa' }, { id: 'NA', name: 'North America' }, { id: 'SA', name: 'South America' }, { id: 'OC', name: 'Oceania' }, { id: 'ALL', name: 'Anywhere' }];
// the arrival bonus grows with the length of the trip, so a long drive pays for the time it takes
const LENGTHS = [
  { id: 'short', name: 'Short', km: [350, 700], minPop: 500000, blurb: '350–700 km', bonus: 150 },
  { id: 'medium', name: 'Medium', km: [700, 1400], minPop: 300000, blurb: '700–1,400 km', bonus: 300 },
  { id: 'long', name: 'Long', km: [1400, 2600], minPop: 200000, blurb: '1,400–2,600 km', bonus: 500 },
  { id: 'epic', name: 'Epic', km: [2600, 5000], minPop: 150000, blurb: '2,600–5,000 km', bonus: 800 },
];
const LEN_SCALE = { car: 1, bike: 0.3, boat: 1.2, train: 1 };
const lengthOf = id => LENGTHS.find(l => l.id === id) || LENGTHS[0];
// a hop shorter than a fifth of the tank scores less (down to a quarter), so ten villages 5 km apart don't beat one real leg
const hopFactor = (km, tank) => Math.max(0.25, Math.min(1, km / (tank * 0.2)));
// trip regions are a set now: Europe + Asia, or Anywhere, or Uncharted. Old saves had a single region.
const regionsOf = o => { const r = Array.isArray(o.regions) && o.regions.length ? o.regions : [o.region || 'EU']; return r.includes('UNCHARTED') ? ['UNCHARTED'] : r.includes('ALL') ? ['ALL'] : r; };
const regionLabel = regions => regions.map(r => (REGIONS.find(x => x.id === r) || { name: r }).name).join(' + ');
const MASTERY = [
  { at: 0, color: null, name: 'Unexplored' },
  { at: 1, color: '#D7263D', name: 'Stranger' }, { at: 3, color: '#EE6A2C', name: 'Passer-by' }, { at: 6, color: '#F2A93B', name: 'Visitor' },
  { at: 10, color: '#EBD437', name: 'Regular' }, { at: 16, color: '#A8CF3C', name: 'Explorer' }, { at: 25, color: '#4DB35E', name: 'Local' },
  { at: 40, color: '#5EC4D9', name: 'Insider' }, { at: 60, color: '#3B8FDB', name: 'Native' }, { at: 90, color: '#2457B8', name: 'Expert' }, { at: 140, color: '#142E73', name: 'Cartographer' },
];
const masteryLevel = score => { let lv = 0; MASTERY.forEach((m, i) => { if (score >= m.at) lv = i; }); return lv; };
// breakaway and autonomous areas GeoNames has no first-level region for
const SPECIAL_AREAS = { 'SO.03': 'Puntland', 'SO.18': 'Puntland', 'IQ.11': 'Kurdistan Region', 'IQ.08': 'Kurdistan Region', 'IQ.05': 'Kurdistan Region', 'IQ.19': 'Kurdistan Region' };
// Disputed and breakaway territories, drawn from their real outlines (see build-data.mjs) and shown as part of the
// country the UN recognises. Western Sahara stays its own territory, as the UN lists it.
const DISPUTED = {
  'Crimea': 'Internationally recognised as part of Ukraine. Occupied and annexed by Russia in 2014, an annexation the UN General Assembly declared invalid.',
  'Abkhazia': 'Internationally recognised as part of Georgia. A breakaway region since the 1992–93 war, recognised as independent by Russia and a handful of other states.',
  'South Ossetia': 'Internationally recognised as part of Georgia, which calls it the Tskhinvali Region. Breakaway since the early 1990s and recognised by Russia after the 2008 war.',
  'Northern Cyprus': 'Internationally recognised as part of Cyprus. Divided from the south by the UN buffer zone since 1974; only Turkey recognises its independence.',
  'Western Sahara': 'On the UN list of non-self-governing territories. Morocco administers most of it; the Polisario Front\'s Sahrawi Republic holds the land east of the sand berm.',
  'Transnistria': 'Internationally recognised as part of Moldova. A breakaway strip along the Dniester since 1990, with Russian troops still stationed there.',
  'Somaliland': 'Internationally recognised as part of Somalia. It has governed itself since declaring independence in 1991, with its own currency and passports.',
};
const CONTESTED_SET = ['Crimea', 'Abkhazia', 'South Ossetia', 'Northern Cyprus', 'Western Sahara'];

// ================= travel rules (difficulty) =================
// Every trip is played under a rule set. Harder rules multiply everything the trip scores.
const RULE_OPTIONS = {
  planes: { label: 'Planes', options: [
    { id: 'all', name: 'Any airport', note: 'Big and regional airports', mult: 0.8 },
    { id: 'large', name: 'Big airports', note: 'Major airports only', mult: 1 },
    { id: 'capitals', name: 'Capitals only', note: 'Fly between capital cities', mult: 1.15 },
    { id: 'off', name: 'No planes', note: 'Stay on the ground', mult: 1.3 } ] },
  trains: { label: 'Trains', options: [
    { id: 'all', name: 'Any station', note: 'Every passenger line', mult: 1 },
    { id: 'capitals', name: 'Capitals only', note: 'Rail between capitals', mult: 1.1 },
    { id: 'off', name: 'No trains', note: 'Roads and ferries only', mult: 1.2 } ] },
  ferries: { label: 'Ferries', options: [
    { id: 'on', name: 'Ferries', note: 'Island hopping allowed', mult: 1 },
    { id: 'off', name: 'No ferries', note: 'Mainland trips only', mult: 1.1 } ] },
  tank: { label: 'Tank', options: [
    { id: 'big', name: 'Big tank', note: '+30% range', mult: 0.85, scale: 1.3 },
    { id: 'standard', name: 'Standard', note: 'Normal range', mult: 1, scale: 1 },
    { id: 'small', name: 'Small tank', note: '−30% range', mult: 1.25, scale: 0.7 } ] },
  hints: { label: 'Help', options: [
    { id: 'on', name: 'Hints on', note: 'Scout, reveal and roadside help', mult: 1 },
    { id: 'off', name: 'No hints', note: 'You are on your own', mult: 1.15 } ] },
};
const DEFAULT_RULES = { planes: 'large', trains: 'all', ferries: 'on', tank: 'standard', hints: 'on' };
let TRAINS_READY = false; // true once rail.json (the OpenStreetMap rail network) has loaded
// continents where the rail download has enough stations to play; rail.json lists them
let RAIL_REGIONS = new Set();
const railIn = regions => [].concat(regions).some(region => region === 'ALL' || region === 'UNCHARTED' ? RAIL_REGIONS.size > 0 : RAIL_REGIONS.has(region));
let RULES = { ...DEFAULT_RULES };
const ruleOpt = (key, rules = RULES) => RULE_OPTIONS[key].options.find(o => o.id === rules[key]) || RULE_OPTIONS[key].options[0];
// which rules actually change a trip in this vehicle: boats never fly or ride trains, trains never fly or take ferries
function rulesThatApply(vehicle, regions) {
  const keys = Object.keys(RULE_OPTIONS);
  if (vehicle === 'boat') return keys.filter(k => k !== 'planes' && k !== 'trains' && k !== 'ferries');
  if (vehicle === 'train') return keys.filter(k => k !== 'planes' && k !== 'trains' && k !== 'ferries');
  // the train rule only counts where there is a rail network to refuse
  return keys.filter(k => k !== 'trains' || (TRAINS_READY && (!regions || railIn(regions))));
}
function scoreMultiplier(rules, assist, avoidCount, regions, vehicle = 'car') {
  let m = 1;
  for (const key of rulesThatApply(vehicle, regions)) m *= ruleOpt(key, rules).mult;
  if (assist === 'navigator') m *= 1.25;
  if (regions && [].concat(regions).includes('UNCHARTED')) m *= 1.15;
  m *= 1 + Math.min(0.2, 0.04 * (avoidCount || 0));
  return Math.round(Math.max(0.5, Math.min(3, m)) * 100) / 100;
}
// the vehicle as this trip's rules shape it
// a Far-Flung Isles voyage stocks the boat for its longest ocean crossing, and may finish at an inland capital
const VOYAGE = { scale: 1, inland: -1 };
const useVoyage = s => { VOYAGE.scale = s && s.voyage ? s.voyage.scale : 1; VOYAGE.inland = s && s.voyage ? s.dest : -1; };
// the tank as this trip's rules, the Long-range tank upgrade and any voyage provisions shape it
const VEH = id => ({ ...VEHICLES[id], tank: Math.round(VEHICLES[id].tank * (ruleOpt('tank').scale || 1) * (hasPerk('tank') ? 1.1 : 1) * (id === 'boat' ? VOYAGE.scale : 1)) });
// flights: which cities you can fly from and to under the current rules, and what it costs in coins
const airportOK = (id, rules = RULES) => rules.planes === 'off' ? false : rules.planes === 'all' ? G.air[id] >= 1 : rules.planes === 'large' ? G.air[id] === 2 : (G.air[id] >= 1 && G.fc[id] === G.capital);
const trainCost = km => Math.round((5 + km * 0.02) * (hasPerk('travelcard') ? 0.75 : 1));
const RAIL = { ready: false };
async function loadRail() {
  try {
    const res = await fetch('rail.json'); if (!res.ok) throw new Error(String(res.status));
    const d = await res.json(), bin = atob(d.bits), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const bits = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    RAIL_REGIONS = new Set(d.regions || ['EU']);
    Object.assign(RAIL, { res: d.res, lon0: d.lon0, lat1: d.lat1, w: d.w, h: d.h, bits, stations: new Set(d.stations.map(g => G.byGid.get(g)).filter(x => x != null)), ready: true });
    TRAINS_READY = true;
  } catch { RAIL.ready = false; }
}
const hasStation = id => RAIL.ready && RAIL.stations.has(id);
const stationOK = (id, rules = RULES) => rules.trains !== 'off' && hasStation(id) && (rules.trains !== 'capitals' || G.fc[id] === G.capital);
const flightCost = (km, flightsSoFar) => Math.round((15 + km * 0.04) * Math.pow(1.5, flightsSoFar || 0) * (hasPerk('travelcard') ? 0.75 : 1));

// ================= shop catalogue =================
const STYLES = {
  atlas: { name: 'Road atlas', price: 0, blurb: 'The classic daylight road map.' },
  political: { name: 'Political', price: 150, blurb: 'Every country in its own colour. Great for learning borders.' },
  night: { name: 'Night drive', price: 200, blurb: 'Dark roads, glowing towns and a neon route.' },
  antique: { name: 'Antique', price: 250, blurb: 'Sepia paper and brown ink, like an old explorer’s chart.' },
  blueprint: { name: 'Blueprint', price: 300, blurb: 'White lines on drafting blue, with a grid.' },
  relief: { name: 'Mastery atlas', price: 300, blurb: 'Every trip map tinted by how well you know each country.' },
  terrain: { name: 'Terrain', price: 300, blurb: 'Shaded relief with elevation colours: see the Alps, Andes and deserts.' },
  outdoor: { name: 'Outdoor', price: 300, blurb: 'Bright greens and mountain shading, like a hiking map.' },
  midcentury: { name: 'Mid-century', price: 350, blurb: 'Soft 1950s atlas colours with shaded relief.' },
  satellite: { name: 'Satellite', price: 500, blurb: 'NASA Blue Marble imagery of the whole planet.' },
  nightlights: { name: 'Night lights', price: 450, blurb: 'NASA Black Marble: the world at night, every city glowing where it really is.' },
  grey: { name: 'Grey relief', price: 250, blurb: 'Quiet grey shaded relief, down to the ocean floor.' },
  metro: { name: 'Metro', price: 200, blurb: 'Dark transit-map greys that make your route pop.' },
  newsprint: { name: 'Newsprint', price: 150, blurb: 'Black ink on paper, like a map in a morning paper.' },
  topo: { name: 'Topographic', price: 200, blurb: 'Survey-map greens, brown borders and a grid.' },
  synthwave: { name: 'Synthwave', price: 300, blurb: 'Neon pink coasts and cyan borders on deep purple.' },
};
const MARKERS = [
  { id: 'car-sport', vehicle: 'car', icon: '🏎️', name: 'Race car', price: 80 }, { id: 'car-suv', vehicle: 'car', icon: '🚙', name: 'SUV', price: 60 },
  { id: 'car-pickup', vehicle: 'car', icon: '🛻', name: 'Pickup', price: 60 }, { id: 'car-van', vehicle: 'car', icon: '🚐', name: 'Camper van', price: 90 },
  { id: 'car-bus', vehicle: 'car', icon: '🚌', name: 'Tour bus', price: 90 }, { id: 'bike-moto', vehicle: 'bike', icon: '🏍️', name: 'Motorbike', price: 80 },
  { id: 'bike-scooter', vehicle: 'bike', icon: '🛵', name: 'Scooter', price: 60 }, { id: 'boat-speed', vehicle: 'boat', icon: '🚤', name: 'Speedboat', price: 80 },
  { id: 'boat-ship', vehicle: 'boat', icon: '🚢', name: 'Ocean liner', price: 120 },
  { id: 'train-bullet', vehicle: 'train', icon: '🚅', name: 'Bullet train', price: 100 }, { id: 'train-steam', vehicle: 'train', icon: '🚂', name: 'Steam engine', price: 90 },
  { id: 'train-tram', vehicle: 'train', icon: '🚋', name: 'Tram', price: 60 },
];
const ROUTES = [{ id: 'red', name: 'Road red', color: '#D7263D', price: 0 }, { id: 'cobalt', name: 'Cobalt', color: '#2F5BEA', price: 40 }, { id: 'violet', name: 'Violet', color: '#8A3FFC', price: 40 }, { id: 'gold', name: 'Gold', color: '#E0A100', price: 60 }, { id: 'neon', name: 'Neon', color: '#18C964', price: 60 }];
const CURSORS = [{ id: 'default', name: 'Standard', emoji: '', price: 0 }, { id: 'compass', name: 'Compass', emoji: '🧭', price: 30 }, { id: 'pin', name: 'Map pin', emoji: '📍', price: 30 }, { id: 'plane', name: 'Paper plane', emoji: '✈️', price: 40 }];
const CONSUMABLES = [{ id: 'jerrycan', name: 'Jerrycan', icon: '⛽', price: 40, blurb: 'Use during a trip: +25% of your tank.' }, { id: 'ticket', name: 'Ferry ticket', icon: '🎫', price: 50, blurb: 'Use during a trip: one extra ferry crossing.' }];

// ================= geometry =================
const R = 6371, rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
function dist(la1, lo1, la2, lo2) { const a = Math.sin(rad(la2 - la1) / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(rad(lo2 - lo1) / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(a))); }
function bearing(la1, lo1, la2, lo2) { const y = Math.sin(rad(lo2 - lo1)) * Math.cos(rad(la2)); const x = Math.cos(rad(la1)) * Math.sin(rad(la2)) - Math.sin(rad(la1)) * Math.cos(rad(la2)) * Math.cos(rad(lo2 - lo1)); return (deg(Math.atan2(y, x)) + 360) % 360; }
const compass = b => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(b / 45) % 8];
function interp(la1, lo1, la2, lo2, f) {
  const p1 = rad(la1), l1 = rad(lo1), p2 = rad(la2), l2 = rad(lo2);
  const x1 = Math.cos(p1) * Math.cos(l1), y1 = Math.cos(p1) * Math.sin(l1), z1 = Math.sin(p1), x2 = Math.cos(p2) * Math.cos(l2), y2 = Math.cos(p2) * Math.sin(l2), z2 = Math.sin(p2);
  const d = Math.acos(Math.max(-1, Math.min(1, x1 * x2 + y1 * y2 + z1 * z2))); if (d < 1e-9) return [la1, lo1];
  const a = Math.sin((1 - f) * d) / Math.sin(d), b = Math.sin(f * d) / Math.sin(d), x = a * x1 + b * x2, y = a * y1 + b * y2, z = a * z1 + b * z2;
  return [deg(Math.atan2(z, Math.hypot(x, y))), deg(Math.atan2(y, x))];
}
function destPoint(la, lo, brng, d) {
  const p1 = rad(la), l1 = rad(lo), t = rad(brng), dr = d / R;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(dr) + Math.cos(p1) * Math.sin(dr) * Math.cos(t));
  const l2 = l1 + Math.atan2(Math.sin(t) * Math.sin(dr) * Math.cos(p1), Math.cos(dr) - Math.sin(p1) * Math.sin(p2));
  return [deg(p2), ((deg(l2) + 540) % 360) - 180];
}

// ================= data =================
let G = null;
const fold = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, ' ').trim();
const emojiFlag = cc => cc && cc.length === 2 ? String.fromCodePoint(...[...cc].map(c => 127397 + c.charCodeAt(0))) : '';

function decodeLines(arr) {
  const out = []; let i = 0;
  while (i < arr.length) {
    const len = arr[i++], pts = new Float32Array(len * 2); let x = 0, y = 0, minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (let k = 0; k < len; k++) { x += arr[i++]; y += arr[i++]; const lx = x / 100, ly = y / 100; pts[2 * k] = lx; pts[2 * k + 1] = ly; if (lx < minX) minX = lx; if (lx > maxX) maxX = lx; if (ly < minY) minY = ly; if (ly > maxY) maxY = ly; }
    out.push({ pts, minX, maxX, minY, maxY });
  }
  return out;
}
function decodeShapes(arr, count) {
  const by = Array.from({ length: count }, () => []); let i = 0;
  while (i < arr.length) {
    const ci = arr[i++], rings = arr[i++];
    for (let r = 0; r < rings; r++) { const len = arr[i]; by[ci].push(decodeLines(arr.subarray(i, i + 1 + len * 2))[0]); i += 1 + len * 2; }
  }
  return by.map(rs => {
    if (!rs.length) return null;
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, main = rs[0];
    for (const r of rs) { minX = Math.min(minX, r.minX); maxX = Math.max(maxX, r.maxX); minY = Math.min(minY, r.minY); maxY = Math.max(maxY, r.maxY); if ((r.maxX - r.minX) * (r.maxY - r.minY) > (main.maxX - main.minX) * (main.maxY - main.minY)) main = r; }
    return { rings: rs, minX, maxX, minY, maxY, main };
  });
}
async function loadData() {
  const b64 = $('geo').textContent.trim(), bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const buf = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const dv = new DataView(buf), td = new TextDecoder();
  const metaLen = dv.getUint32(0, true), namesLen = dv.getUint32(4, true); let off = 8;
  const meta = JSON.parse(td.decode(new Uint8Array(buf, off, metaLen))); off += metaLen;
  const namesText = td.decode(new Uint8Array(buf, off, namesLen)); off += namesLen;
  const n = meta.n, REC = meta.rec;
  const air = new Uint8Array(buf.slice(off, off + meta.bytes.air)); off += meta.bytes.air;
  const lat = new Float32Array(n), lon = new Float32Array(n), pop = new Uint32Array(n), cc = new Uint8Array(n), fc = new Uint8Array(n), gid = new Uint32Array(n);
  for (let i = 0, o = off; i < n; i++, o += REC) { lat[i] = dv.getInt32(o, true) / 1e5; lon[i] = dv.getInt32(o + 4, true) / 1e5; pop[i] = dv.getUint32(o + 8, true); cc[i] = dv.getUint8(o + 12); fc[i] = dv.getUint8(o + 13); gid[i] = dv.getUint32(o + 14, true); }
  off += meta.bytes.bin;
  const take = (len, T) => { const a = new T(buf.slice(off, off + len)); off += len; return a; };
  const adm = take(meta.bytes.adm, Uint16Array), mask = take(meta.bytes.mask, Uint8Array), landArr = take(meta.bytes.land, Int32Array), borderArr = take(meta.bytes.border, Int32Array), shapeArr = take(meta.bytes.shapes, Int32Array), craster = take(meta.bytes.craster, Uint8Array);
  const area = meta.bytes.area ? take(meta.bytes.area, Uint8Array) : new Uint8Array(n), disputedArr = meta.bytes.disputed ? take(meta.bytes.disputed, Int32Array) : new Int32Array(0);
  const name = new Array(n), alts = new Array(n), lines = namesText.split('\n');
  for (let i = 0; i < n; i++) { const parts = lines[i].split('\t'); name[i] = parts[0]; alts[i] = parts.length > 1 ? parts.slice(1) : null; }
  G = { n, air, iata: meta.iata, name, alts, lat, lon, pop, cc, fc, gid, adm, capital: meta.fc.indexOf('PPLC'), countries: meta.countries, admList: meta.adm, mask, maskW: meta.maskW, maskH: meta.maskH, craster,
    land: decodeLines(landArr), border: decodeLines(borderArr), shapes: decodeShapes(shapeArr, meta.countries.length), area, areas: meta.areas || [], disputed: decodeLines(disputedArr) };
  G.drawLast = new Set((meta.drawLast || []).map(c => meta.countries.findIndex(x => x[0] === c)));
  G.contOf = G.countries.map(c => c[2]);
  G.ccIndex = Object.fromEntries(G.countries.map((c, i) => [c[0], i]));
  G.admIndex = new Map(G.admList.map((a, i) => [a[2], i]));
  G.grid = new Map();
  for (let i = 0; i < n; i++) { const k = (Math.floor(lat[i]) + 90) * 360 + (Math.floor(lon[i]) + 180); let a = G.grid.get(k); if (!a) G.grid.set(k, a = []); a.push(i); }
  G.coastCache = new Int8Array(n);
  G.byGid = new Map(); for (let i = 0; i < n; i++) G.byGid.set(gid[i], i);
  // label anchors, place counts per country and per region
  const acc = G.countries.map(() => [0, 0, 0, 0]); G.placeCount = new Uint32Array(G.countries.length); G.admCount = new Uint32Array(G.admList.length);
  for (let i = 0; i < n; i++) { const w = Math.sqrt(pop[i] + 1), a = acc[cc[i]], p = rad(lat[i]), l = rad(lon[i]); a[0] += w * Math.cos(p) * Math.cos(l); a[1] += w * Math.cos(p) * Math.sin(l); a[2] += w * Math.sin(p); a[3] += pop[i]; G.placeCount[cc[i]]++; G.admCount[adm[i]]++; }
  G.anchors = acc.map((a, i) => a[3] > 0 ? { i, pop: a[3], lat: deg(Math.atan2(a[2], Math.hypot(a[0], a[1]))), lon: deg(Math.atan2(a[1], a[0])) } : null).filter(Boolean).sort((x, y) => y.pop - x.pop);
  // colour the political map so neighbours differ
  const adj = G.countries.map(() => new Set()), W = G.maskW, H = G.maskH;
  for (let r = 0; r < H - 1; r++) { const row = r * W; for (let c = 0; c < W - 1; c++) { const v = craster[row + c]; if (!v) continue; const a = craster[row + c + 1], b = craster[row + W + c]; if (a && a !== v) { adj[v - 1].add(a - 1); adj[a - 1].add(v - 1); } if (b && b !== v) { adj[v - 1].add(b - 1); adj[b - 1].add(v - 1); } } }
  G.colorIdx = new Int8Array(G.countries.length).fill(-1);
  [...G.countries.keys()].sort((a, b) => adj[b].size - adj[a].size).forEach(i => { const used = new Set([...adj[i]].map(j => G.colorIdx[j])); let k = 0; while (used.has(k)) k++; G.colorIdx[i] = k % 6; });
}

let searchIndex = null;
function buildSearch() {
  const keys = [], ids = [];
  for (let i = 0; i < G.n; i++) { keys.push(fold(G.name[i])); ids.push(i); if (G.alts[i]) for (const a of G.alts[i]) { keys.push(fold(a)); ids.push(i); } }
  const order = Array.from(keys.keys()).sort((a, b) => keys[a] < keys[b] ? -1 : keys[a] > keys[b] ? 1 : ids[a] - ids[b]);
  searchIndex = { keys: order.map(o => keys[o]), ids: Int32Array.from(order.map(o => ids[o])) };
}
function lowerBound(key) { let lo = 0, hi = searchIndex.keys.length; while (lo < hi) { const m = (lo + hi) >> 1; if (searchIndex.keys[m] < key) lo = m + 1; else hi = m; } return lo; }
function prefixIds(prefix, limit = 4000) { const out = new Set(); for (let i = lowerBound(prefix); i < searchIndex.keys.length && out.size < limit; i++) { if (!searchIndex.keys[i].startsWith(prefix)) break; out.add(searchIndex.ids[i]); } return [...out]; }
function exactIds(key) { const out = new Set(); for (let i = lowerBound(key); i < searchIndex.keys.length; i++) { const k = searchIndex.keys[i]; if (k === key || k.startsWith(key + ' ')) out.add(searchIndex.ids[i]); else if (!k.startsWith(key)) break; } return [...out]; }
function nearby(la, lo, km) {
  const out = [], dLat = km / 111, dLon = km / (111 * Math.max(0.05, Math.cos(rad(la))));
  for (let r = Math.max(-90, Math.floor(la - dLat)); r <= Math.min(89, Math.floor(la + dLat)); r++) for (let c = Math.floor(lo - dLon); c <= Math.floor(lo + dLon); c++) {
    const a = G.grid.get((r + 90) * 360 + (((c + 180) % 360 + 360) % 360)); if (a) for (const id of a) out.push(id);
  }
  return out;
}
const cellIndex = (la, lo) => { const r = Math.floor((90 - la) * 10), c = Math.floor(((((lo + 180) % 360) + 360) % 360) * 10); return r < 0 || r >= G.maskH ? -1 : r * G.maskW + c; };
const isLand = (la, lo) => { const b = cellIndex(la, lo); if (b < 0) return la < 0; return (G.mask[b >> 3] & (1 << (b & 7))) !== 0; };
const countryAt = (la, lo) => { const b = cellIndex(la, lo); return b < 0 ? -1 : G.craster[b] - 1; };
function coastal(id) {
  if (G.coastCache[id]) return G.coastCache[id] > 0;
  let c = !isLand(G.lat[id], G.lon[id]);
  for (let ring = 4; !c && ring <= 12; ring += 4) for (let b = 0; b < 360 && !c; b += 30) { const [la, lo] = destPoint(G.lat[id], G.lon[id], b, ring); if (!isLand(la, lo)) c = true; }
  G.coastCache[id] = c ? 1 : -1; return c;
}
const tierOf = id => TIERS.find(t => t.test(G.pop[id], G.fc[id] === G.capital));
const countryName = id => G.countries[G.cc[id]][1];
const ccOf = id => G.countries[G.cc[id]][0];
const ccName = cc => (G.countries[G.ccIndex[cc]] || [cc, cc])[1];
const admOf = id => G.admList[G.adm[id]];
// the disputed or autonomous area a place is in, if any
const areaName = id => G.area[id] ? G.areas[G.area[id] - 1][0] : SPECIAL_AREAS[admOf(id)[2]] || null;
const placeLine = id => { const a = admOf(id)[0], ar = G.area[id] ? areaName(id) : null; return `${a && a !== G.name[id] ? a + ', ' : ''}${ar && ar !== a ? ar + ', ' : ''}${countryName(id)}`; };
const placeKey = id => 'g' + G.gid[id];
const wikiLink = id => `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(G.name[id] + ' ' + countryName(id))}`;

// ================= flags =================
// flags/base.json holds every flag's location plus country and region flags; city flags come in shards
const FLAGS = { keys: null, shards: {}, pending: {}, ready: false, failed: false, onLoad: null };
async function loadFlags() {
  try {
    const res = await fetch('flags/base.json'); if (!res.ok) throw new Error(String(res.status));
    const data = await res.json(); FLAGS.keys = data.keys; FLAGS.shards.base = data.files; FLAGS.ready = true;
    // fetch the city shards quietly in the background
    const names = [...new Set(Object.values(FLAGS.keys).map(e => e[0]))].filter(n => n !== 'base');
    (async () => { for (const n of names) await ensureShard(n); })();
  } catch { FLAGS.ready = false; FLAGS.failed = true; }
}
function ensureShard(name) {
  if (FLAGS.shards[name] || FLAGS.pending[name]) return FLAGS.pending[name];
  return FLAGS.pending[name] = fetch('flags/' + name + '.json').then(r => r.json()).then(d => { FLAGS.shards[name] = d.files; if (FLAGS.onLoad) FLAGS.onLoad(); }).catch(() => {});
}
const flagEntry = key => FLAGS.ready ? FLAGS.keys[key] : undefined;
function flagSrc(key) {
  const e = flagEntry(key); if (!e) return null;
  const files = FLAGS.shards[e[0]]; if (!files) { ensureShard(e[0]); return null; }
  return 'data:image/webp;base64,' + files[e[1]];
}
// every flag flying over a place, most specific first (the same image is only shown once)
function flagStack(id) {
  const out = [], seen = new Set(), adm = admOf(id), cc = ccOf(id);
  const add = (key, label, kind) => { const e = flagEntry(key); if (!e || !flagSrc(key)) return; const id = e[0] + ':' + e[1]; if (seen.has(id)) return; seen.add(id); out.push({ key, label, kind }); };
  add('g:' + G.gid[id], G.name[id], G.fc[id] === G.capital ? 'Capital city' : 'City');
  if (adm[1]) add('a:' + adm[1], adm[0], 'Region');
  const ar = areaName(id); if (ar) add('x:' + ar, ar, DISPUTED[ar] ? 'Disputed territory' : 'Autonomous area');
  add('c:' + cc, countryName(id), 'Country');
  return out;
}
const countryFlag = cc => { const s = flagSrc('c:' + cc); return s ? `<img class="fl" src="${s}" alt="">` : `<span class="fl emoji">${emojiFlag(cc)}</span>`; };
const placeFlag = id => { const st = flagStack(id); return st.length ? `<img class="fl" src="${flagSrc(st[0].key)}" alt="">` : `<span class="fl emoji">${emojiFlag(ccOf(id))}</span>`; };

// ================= profile: passport, coins, shop =================
const PROFILE_DEFAULTS = () => ({ v: 2, visits: {}, trips: 0, best: {}, coins: 0, owned: ['style:atlas', 'route:red', 'cursor:default'], equip: { style: 'atlas', route: 'red', cursor: 'default', markers: {}, theme: 'field' },
  consumables: { jerrycan: 0, ticket: 0, tow: 0 }, feats: {}, study: {}, flagsSeen: {}, history: [], km: 0, ferries: 0, achievements: {}, overlays: { names: true, towns: true, grid: false, lines: false, mastery: false }, lastDaily: null });
const P = Object.assign(PROFILE_DEFAULTS(), store.get('stopover-profile') || {});
const saveProfile = () => store.set('stopover-profile', P);
function renderCoins() { $('coin-count').querySelector('span').textContent = fmt(P.coins); }
function addCoins(n, why) { if (n <= 0) return; P.coins += n; saveProfile(); renderCoins(); if (why) toast(`+${n} coins · ${why}`); }
function migrateV1() {
  const old = store.get('stopover-passport'); if (!old || old.migrated || !old.stamps) return;
  for (const [k, t] of Object.entries(old.stamps)) {
    const [nm, cc, la, lo] = k.split('|');
    const id = exactIds(fold(nm)).find(i => ccOf(i) === cc && Math.abs(G.lat[i] - +la) < 0.02 && Math.abs(G.lon[i] - +lo) < 0.02);
    if (id != null && !P.visits[placeKey(id)]) P.visits[placeKey(id)] = { n: 1, first: t, last: t };
  }
  P.trips += old.trips || 0; old.migrated = true; store.set('stopover-passport', old); saveProfile();
}
const visitsBefore = id => (P.visits[placeKey(id)] || {}).n || 0;
// unique places visited plus unique places answered right in study, per country
function countryKnowledge() {
  const sets = G.countries.map(() => new Set());
  for (const k of Object.keys(P.visits)) { const id = G.byGid.get(+k.slice(1)); if (id != null) sets[G.cc[id]].add(G.gid[id]); }
  for (const [cc, s] of Object.entries(P.study)) { const ci = G.ccIndex[cc]; if (ci != null) for (const g of s.known || []) sets[ci].add(g); }
  return sets.map(s => s.size);
}
