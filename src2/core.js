// ================= utilities =================
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = n => Math.round(n).toLocaleString('en-US');
// On the website the save lives on the server (auth.js loads it before the game starts); the single-file version
// keeps it in this browser.
const CLOUD = window.__stopoverCloud || null; delete window.__stopoverCloud;
// The website has two games on one engine. The daily game (playstopover.me/) is the quick one: today's trip, the
// weekly trip and free play, with no account, shop, passport or boards; mini.js runs it. The full game
// (playstopover.me/world) is everything else. MINI is set by the page the build makes (build-web.mjs).
const MINI = window.__STOPOVER_MODE === 'mini';
// the daily game keeps its own save in this browser, apart from anything the full game ever stored here
const LOCAL_PREFIX = MINI ? 'stopover-mini:' : '';
// the daily game points players of the full game to where their account lives (mini.js)
if (!MINI) try { localStorage.setItem('stopover-world-player', '1'); } catch {}
const store = CLOUD ? { get: k => CLOUD.get(k), set: (k, v) => CLOUD.set(k, v) } : {
  get(k) { try { return JSON.parse(localStorage.getItem(LOCAL_PREFIX + k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(LOCAL_PREFIX + k, JSON.stringify(v)); } catch {} },
};
// online.js fills these in on the website: race hooks, the shared leaderboard and the map layer for rivals
const HOOKS = {};
// toasts queue up, so a new flag and an achievement on the same stop are both seen
let toastTimer = 0; const toastQueue = [];
function toast(text) { toastQueue.push(text); if (toastQueue.length === 1) showToast(); }
function showToast() {
  const t = $('toast'); t.textContent = toastQueue[0]; t.hidden = false; clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastQueue.shift(); if (toastQueue.length) showToast(); else t.hidden = true; }, toastQueue.length > 1 ? 2400 : 3400);
}
// Layout tweaks from Stopover Studio (tune.json → layout): CSS laid over the game's own styles, for every screen, for
// phones, or for wider screens. Each is { selector: { property: value } }.
const layoutCss = L => {
  const rules = o => Object.entries(o || {}).map(([sel, props]) => `${sel} { ${Object.entries(props).map(([k, v]) => `${k}: ${v} !important`).join('; ')} }`).join('\n');
  return `${rules(L.all)}\n@media (max-width: 760px) {\n${rules(L.phone)}\n}\n@media (min-width: 761px) {\n${rules(L.desktop)}\n}`;
};
document.head.appendChild(Object.assign(document.createElement('style'), { id: 'tune-layout', textContent: layoutCss(TUNE.layout || {}) }));

// ================= rules =================
const VEHICLES = TUNE.vehicles;
const TIERS = TUNE.scoring.tiers.map(t => ({ ...t, test: t.id === 'capital' ? (p, cap) => cap : p => p >= t.minPop }));
// how much a stop pays, given how many times you have stopped there before
function familiarity(before) {
  const m = TUNE.scoring.visitMult, mult = m[Math.min(before, m.length - 1)];
  return { mult, label: ['first visit', '2nd visit', '3rd visit'][before] || `${before + 1}th visit` };
}
const { ticketBonus: TICKET_BONUS, scoutCost: SCOUT_COST, revealCost: REVEAL_COST, helpCost: HELP_COST } = TUNE.costs, FERRY_MAX = TUNE.rules.ferryKm.slider.max;
const REGIONS = [{ id: 'EU', name: 'Europe' }, { id: 'AS', name: 'Asia' }, { id: 'AF', name: 'Africa' }, { id: 'NA', name: 'North America' }, { id: 'SA', name: 'South America' }, { id: 'OC', name: 'Oceania' }, { id: 'ALL', name: 'Anywhere' }];
// the arrival bonus grows with the length of the trip, so a long drive pays for the time it takes
const LENGTHS = TUNE.lengths;
const LEN_SCALE = TUNE.lengthScale;
const lengthOf = id => LENGTHS.find(l => l.id === id) || LENGTHS[0];
// a hop shorter than a fifth of the tank scores less (down to a quarter), so ten villages 5 km apart don't beat one real leg
const hopFactor = (km, tank) => Math.max(TUNE.scoring.hop.min, Math.min(1, km / (tank * TUNE.scoring.hop.fullAt)));
// trip regions are a set now: Europe + Asia, or Anywhere, or Uncharted. Old saves had a single region.
const regionsOf = o => { const r = Array.isArray(o.regions) && o.regions.length ? o.regions : [o.region || 'EU']; return r.includes('UNCHARTED') ? ['UNCHARTED'] : r.includes('ALL') ? ['ALL'] : r; };
// Each continent splits into areas you can switch off one by one: Europe without the Balkans, Asia as just the
// Middle East. Every country with places sits in exactly one area, so an area is the unit a trip is drawn from.
// Russia is the one country cut in two, at the Urals (60°E), as it always has been here.
const SUBREGIONS = {
  EU: [
    { id: 'EU-NORDIC', name: 'Scandinavia & Nordics', cc: 'NO SE DK FI IS FO AX SJ' },
    { id: 'EU-BRIT', name: 'British Isles', cc: 'GB IE IM GG JE' },
    { id: 'EU-WEST', name: 'Western Europe', cc: 'FR BE NL LU MC' },
    { id: 'EU-IBERIA', name: 'Iberia', cc: 'ES PT AD GI' },
    { id: 'EU-CENTRAL', name: 'Central Europe', cc: 'DE AT CH LI PL CZ SK HU SI' },
    { id: 'EU-ITALY', name: 'Italy & Malta', cc: 'IT MT SM VA' },
    { id: 'EU-BALKANS', name: 'Balkans & Greece', cc: 'HR BA RS ME MK AL XK GR BG CY' },
    { id: 'EU-BALTIC', name: 'Baltics', cc: 'EE LV LT' },
    { id: 'EU-EAST', name: 'Eastern Europe', cc: 'UA BY MD RO' },
    { id: 'EU-CAUCASUS', name: 'Caucasus', cc: 'GE AM AZ' } ],
  AS: [
    { id: 'AS-MIDEAST', name: 'Middle East & Turkey', cc: 'TR SY LB IL PS JO IQ IR SA YE OM AE QA BH KW' },
    { id: 'AS-CENTRAL', name: 'Central Asia', cc: 'KZ UZ TM KG TJ' },
    { id: 'AS-SOUTH', name: 'South Asia', cc: 'IN PK BD NP BT LK MV AF IO' },
    { id: 'AS-EAST', name: 'East Asia', cc: 'CN JP KR KP TW HK MO MN' },
    { id: 'AS-SEA', name: 'Southeast Asia', cc: 'TH VN LA KH MM MY SG ID PH BN TL' },
    { id: 'AS-SIBERIA', name: 'Siberia & Russian Far East', cc: '' } ],
  AF: [
    { id: 'AF-NORTH', name: 'North Africa', cc: 'MA DZ TN LY EG EH SD' },
    { id: 'AF-WEST', name: 'West Africa', cc: 'MR ML NE SN GM GW GN SL LR CI BF GH TG BJ NG CV SH' },
    { id: 'AF-CENTRAL', name: 'Central Africa', cc: 'TD CF CM GQ GA CG CD ST AO' },
    { id: 'AF-EAST', name: 'East Africa', cc: 'ET ER DJ SO KE UG RW BI TZ SS' },
    { id: 'AF-SOUTH', name: 'Southern Africa', cc: 'ZA NA BW ZW ZM MW MZ LS SZ' },
    { id: 'AF-ISLANDS', name: 'Indian Ocean islands', cc: 'MG MU RE SC KM YT' } ],
  NA: [
    { id: 'NA-USA', name: 'United States', cc: 'US' },
    { id: 'NA-CANADA', name: 'Canada & Greenland', cc: 'CA GL PM' },
    { id: 'NA-MEXICO', name: 'Mexico', cc: 'MX' },
    { id: 'NA-CENTRAL', name: 'Central America', cc: 'GT BZ SV HN NI CR PA' },
    { id: 'NA-CARIB', name: 'Caribbean', cc: 'CU JM HT DO PR BS TC KY VG VI AI AG KN MS GP DM MQ LC VC BB GD TT AW CW BQ SX MF BL BM' } ],
  SA: [
    { id: 'SA-NORTH', name: 'Northern South America', cc: 'VE CO GY SR GF' },
    { id: 'SA-ANDES', name: 'Andes', cc: 'EC PE BO CL' },
    { id: 'SA-BRAZIL', name: 'Brazil', cc: 'BR' },
    { id: 'SA-CONE', name: 'Southern Cone', cc: 'AR UY PY FK' } ],
  OC: [
    { id: 'OC-AUS', name: 'Australia', cc: 'AU CX CC NF' },
    { id: 'OC-NZ', name: 'New Zealand', cc: 'NZ' },
    { id: 'OC-MELA', name: 'Melanesia', cc: 'PG SB VU NC FJ' },
    { id: 'OC-MICRO', name: 'Micronesia', cc: 'FM GU MP PW MH KI NR' },
    { id: 'OC-POLY', name: 'Polynesia', cc: 'WS AS TO TV PF WF PN CK NU TK' } ],
};
const SUB_BY_ID = new Map(), SUB_OF_CC = new Map();
for (const [cont, list] of Object.entries(SUBREGIONS)) for (const sr of list) { sr.cont = cont; SUB_BY_ID.set(sr.id, sr); for (const cc of sr.cc.split(' ').filter(Boolean)) SUB_OF_CC.set(cc, sr); }
// the area a place is in; null for the few places (Antarctic outposts) no trip is drawn from
const subOf = id => { const cc = ccOf(id); if (cc === 'RU') return SUB_BY_ID.get(G.lon[id] >= 60 ? 'AS-SIBERIA' : 'EU-EAST'); return SUB_OF_CC.get(cc) || null; };
// the areas a trip leaves out; only areas of continents it actually uses count
const skipOf = o => { const regs = regionsOf(o); if (regs[0] === 'ALL' || regs[0] === 'UNCHARTED') return []; return (Array.isArray(o.skip) ? o.skip : []).filter(x => SUB_BY_ID.has(x) && regs.includes(SUB_BY_ID.get(x).cont)); };
const regionLabel = (regions, skip = []) => regions.map(r => {
  const name = (REGIONS.find(x => x.id === r) || { name: r }).name, all = SUBREGIONS[r];
  if (!all) return name;
  const off = all.filter(sr => skip.includes(sr.id)).length;
  if (!off) return name;
  const on = all.filter(sr => !skip.includes(sr.id));
  return on.length === 1 ? on[0].name : `${name} (${on.length} of ${all.length} areas)`;
}).join(' + ');
const MASTERY = TUNE.mastery;
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
// Two kinds: a choice between named options, and a slider over kilometres. A slider at zero
// shuts the mode off entirely, which is why there is no separate "no planes" option any more.
const RULE_OPTIONS = TUNE.rules;
RULE_OPTIONS.planeKm.slider.note = km => km ? `One hop up to ${fmt(km)} km` : 'No planes · stay on the ground';
RULE_OPTIONS.trainKm.slider.note = km => km ? `One ride up to ${fmt(km)} km of track` : 'No trains · roads and ferries only';
RULE_OPTIONS.ferryKm.slider.note = km => km ? `Crossings up to ${fmt(km)} km of open water` : 'No ferries · mainland trips only';
const DEFAULT_RULES = TUNE.defaultRules;
// Saves and races from before the sliders stored planes/trains/ferries as on-off words. An "off" becomes a
// zero-kilometre slider, which plays and scores the same, so old trips resume under the rules they started with.
function migrateRules(rules) {
  const r = { ...(rules || {}) };
  if (r.ferries !== undefined) { if (r.ferryKm === undefined) r.ferryKm = r.ferries === 'off' ? 0 : FERRY_MAX; delete r.ferries; }
  if (r.planes === 'off') { r.planes = 'large'; if (r.planeKm === undefined) r.planeKm = 0; }
  if (r.trains === 'off') { r.trains = 'all'; if (r.trainKm === undefined) r.trainKm = 0; }
  return { ...DEFAULT_RULES, ...r };
}
let TRAINS_READY = false; // true once rail.json (the OpenStreetMap rail network) has loaded
// continents where the rail download has enough stations to play; rail.json lists them
let RAIL_REGIONS = new Set();
const railIn = regions => [].concat(regions).some(region => region === 'ALL' || region === 'UNCHARTED' ? RAIL_REGIONS.size > 0 : RAIL_REGIONS.has(region));
let RULES = { ...DEFAULT_RULES };
// true while a race trip is planned: races are played without upgrades, so everyone has the same tank
let RACE_FAIR = false;
const ruleOpt = (key, rules = RULES) => RULE_OPTIONS[key].options.find(o => o.id === rules[key]) || RULE_OPTIONS[key].options[0];
// a slider rule's value, clamped to its track, and the multiplier it earns: 1.00 wide open, rising to
// offMult when it is wound all the way down
const ruleKm = (key, rules = RULES) => { const s = RULE_OPTIONS[key].slider, v = rules[key]; return Math.max(s.min, Math.min(s.max, v == null ? s.def : Math.round(+v))); };
// ×1.00 sits at the slider's default, so leaving a rule alone scores exactly what it always did.
// Winding it down earns up to offMult; opening it past the default is easier and pays maxMult.
const ruleMult = (key, rules = RULES) => {
  const s = RULE_OPTIONS[key].slider; if (!s) return ruleOpt(key, rules).mult;
  const km = ruleKm(key, rules);
  if (km <= s.def) return s.def === s.min ? 1 : s.offMult + (1 - s.offMult) * ((km - s.min) / (s.def - s.min));
  return 1 + ((s.maxMult == null ? 1 : s.maxMult) - 1) * ((km - s.def) / (s.max - s.def));
};
const ferryLimit = () => ruleKm('ferryKm');
const planeLimit = () => ruleKm('planeKm');
const trainLimit = () => ruleKm('trainKm');
// which rules actually change a trip in this vehicle: boats never fly or ride trains, trains never fly or take ferries
function rulesThatApply(vehicle, regions) {
  const drop = new Set();
  if (vehicle === 'boat' || vehicle === 'train') for (const k of ['planes', 'planeKm', 'trains', 'trainKm', 'ferryKm']) drop.add(k);
  // the train rules only count where there is a rail network to refuse
  else if (!(TRAINS_READY && (!regions || railIn(regions)))) { drop.add('trains'); drop.add('trainKm'); }
  return Object.keys(RULE_OPTIONS).filter(k => !drop.has(k));
}
function scoreMultiplier(rules, assist, avoidCount, regions, vehicle = 'car') {
  let m = 1;
  for (const key of rulesThatApply(vehicle, regions)) m *= ruleMult(key, rules);
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
const flightCost = (km, flightsSoFar) => Math.round((TUNE.flights.base + km * TUNE.flights.perKm) * Math.pow(TUNE.flights.growth, flightsSoFar || 0) * (hasPerk('travelcard') ? 0.75 : 1));

// ================= shop catalogue =================
const STYLES = TUNE.shop.styles;
const MARKERS = TUNE.shop.markers;
const ROUTES = TUNE.shop.routes;
const CURSORS = TUNE.shop.cursors;
const CONSUMABLES = TUNE.shop.supplies;
const tuned = (list, over) => { for (const x of list) Object.assign(x, over[x.id]); return list; };
const TICKET_PRICE = CONSUMABLES.find(c => c.id === 'ticket').price;

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
    // City flags load when one is first shown (flagSrc). The rest follow quietly once the player has settled in,
    // not during the first seconds, and never on a connection that asked to save data.
    const names = [...new Set(Object.values(FLAGS.keys).map(e => e[0]))].filter(n => n !== 'base');
    // (the daily game has no passport to fill, so it only ever loads the ones it shows)
    if (!MINI && !(navigator.connection && navigator.connection.saveData)) setTimeout(async () => { for (const n of names) await ensureShard(n); }, 30000);
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
function addCoins(n, why) { if (n <= 0 || MINI) return; P.coins += n; saveProfile(); renderCoins(); if (why) toast(`+${n} coins · ${why}`); }
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
// The Passport can show another player's passport, read-only. Everything it draws reads from pp(): your own
// save normally, a copy of theirs while PV.other is set. Game logic never reads pp(), so nothing about their
// collection can leak into your coins, rating or saves.
const PV = { other: null };
const pp = () => PV.other ? PV.other.data : P;
function countryKnowledge(p = P) {
  const sets = G.countries.map(() => new Set());
  for (const k of Object.keys(p.visits || {})) { const id = G.byGid.get(+k.slice(1)); if (id != null) sets[G.cc[id]].add(G.gid[id]); }
  for (const [cc, s] of Object.entries(p.study || {})) { const ci = G.ccIndex[cc]; if (ci != null) for (const g of s.known || []) sets[ci].add(g); }
  return sets.map(s => s.size);
}
