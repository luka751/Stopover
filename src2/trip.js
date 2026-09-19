// ================= legs =================
function legInfo(a, b, withCountries) {
  const d = dist(G.lat[a], G.lon[a], G.lat[b], G.lon[b]), steps = Math.max(2, Math.min(600, Math.ceil(d / 4))), step = d / steps;
  let water = 0, land = 0, waterRun = 0, landRun = 0, run = 0, prev = null; const crossed = withCountries ? new Set() : null;
  for (let i = 1; i <= steps; i++) {
    const [la, lo] = interp(G.lat[a], G.lon[a], G.lat[b], G.lon[b], i / steps), l = i === steps ? true : isLand(la, lo);
    if (l) land += step; else water += step;
    if (l === prev) run += step; else run = step; prev = l;
    if (l) landRun = Math.max(landRun, run); else waterRun = Math.max(waterRun, run);
    if (crossed && l && i < steps) { const ci = countryAt(la, lo); if (ci >= 0) crossed.add(ci); }
  }
  return { d, water, land, waterRun, landRun, crossed };
}
// Shortest path over the 0.1° land (or sea) grid, so a road can follow a coast instead of a straight line.
// Short gaps of the "other" surface are allowed (bridges and tunnels for roads, canals and spits for boats).
const pathCache = new Map();
function gridPath(a, b, mode, capKm, gapKm, avoid) {
  const avoidKey = avoid && avoid.size ? [...avoid].sort().join(',') : '';
  const key = a + '|' + b + '|' + mode + '|' + Math.round(capKm) + '|' + avoidKey;
  if (pathCache.has(key)) return pathCache.get(key);
  const W = G.maskW, H = G.maskH, homeCountry = G.cc[a];
  const landAt = k => (G.mask[k >> 3] & (1 << (k & 7))) !== 0;
  const cellOf = (la, lo) => { const r = Math.max(0, Math.min(H - 1, Math.floor((90 - la) * 10))), c = ((Math.floor((lo + 180) * 10) % W) + W) % W; return r * W + c; };
  const center = k => [90 - (Math.floor(k / W) + 0.5) / 10, (k % W + 0.5) / 10 - 180];
  const blocked = k => { if (!avoid || !avoid.size) return false; const ci = G.craster[k] - 1; return ci >= 0 && avoid.has(ci) && ci !== homeCountry && ci !== G.cc[b]; };
  const good = k => (mode === 'land' ? landAt(k) : !landAt(k)) && !blocked(k);
  const snap = id => { const k0 = cellOf(G.lat[id], G.lon[id]); if (good(k0)) return k0; const r0 = Math.floor(k0 / W), c0 = k0 % W; for (let ring = 1; ring <= 3; ring++) for (let dr = -ring; dr <= ring; dr++) for (let dc = -ring; dc <= ring; dc++) { const r = r0 + dr; if (r < 0 || r >= H) continue; const k = r * W + ((c0 + dc) % W + W) % W; if (good(k)) return k; } return -1; };
  const s = snap(a), t = snap(b);
  let result = null;
  if (s >= 0 && t >= 0) {
    const [tla, tlo] = center(t), hdist = k => { const [la, lo] = center(k); return dist(la, lo, tla, tlo); };
    const gBest = new Map([[s, 0]]), prev = new Map(), heap = new Heap();
    const startExtra = dist(G.lat[a], G.lon[a], ...center(s)), endExtra = dist(G.lat[b], G.lon[b], tla, tlo);
    heap.push({ f: hdist(s), g: 0, k: s, gap: 0 });
    let expansions = 0;
    while (heap.size && expansions++ < 60000) {
      const cur = heap.pop();
      if (cur.g > gBest.get(cur.k)) continue;
      if (cur.k === t) {
        const cells = [t]; let p = prev.get(t); while (p != null) { cells.push(p); p = prev.get(p); } cells.reverse();
        const step = Math.max(1, Math.ceil(cells.length / 80)), pts = [[G.lat[a], G.lon[a]]];
        for (let i = 0; i < cells.length; i += step) pts.push(center(cells[i]));
        pts.push([G.lat[b], G.lon[b]]);
        result = { km: cur.g + startExtra + endExtra, pts };
        break;
      }
      const r = Math.floor(cur.k / W), c = cur.k % W, lat = 90 - (r + 0.5) / 10, kx = 11.12 * Math.cos(rad(lat));
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue; const nr = r + dr; if (nr < 0 || nr >= H) continue;
        const nk = nr * W + ((c + dc) % W + W) % W; if (blocked(nk)) continue;
        const step = Math.hypot(dr * 11.12, dc * kx), ok = mode === 'land' ? landAt(nk) : !landAt(nk);
        const gap = ok ? 0 : cur.gap + step; if (gap > gapKm) continue;
        const g = cur.g + step; if (g + hdist(nk) > capKm) continue;
        if (g < (gBest.get(nk) ?? Infinity)) { gBest.set(nk, g); prev.set(nk, cur.k); heap.push({ f: g + hdist(nk), g, k: nk, gap }); }
      }
    }
  }
  if (pathCache.size > 4000) pathCache.clear();
  pathCache.set(key, result);
  return result;
}
// a leg on a train trip: station to station along real track, paid for out of the rail range
function checkRailLeg(a, b, fuel, avoid, fast) {
  const d = dist(G.lat[a], G.lon[a], G.lat[b], G.lon[b]), info = { d, water: 0, land: d, waterRun: 0, landRun: d, crossed: null };
  if (!RAIL.ready) return { ok: false, info, why: 'rail-loading' };
  if (!hasStation(b)) return { ok: false, info, why: 'nostation' };
  if (!hasStation(a)) return { ok: false, info, why: 'nostation-here' };
  if (avoid && avoid.size && avoid.has(G.cc[b])) return { ok: false, info, why: 'avoid-stop' };
  if (d > fuel) return { ok: false, info, why: 'range', need: d, via: 'rail' };
  // route planning guesses track as a quarter longer than the crow flies; the real leg follows the rails
  if (fast) { const est = d * 1.25; return est <= fuel ? { ok: true, info, kind: 'train', own: true, fuel: est, km: est } : { ok: false, info, why: 'range', need: est, via: 'rail' }; }
  const path = railPath(a, b, Math.min(Math.max(fuel, d * 1.5), Math.max(d * 2.2, VEHICLES.train.tank * 1.6)));
  if (!path) return { ok: false, info, why: 'norail' };
  if (avoid && avoid.size) for (const [la, lo] of path.pts) { const ci = countryAt(la, lo); if (ci >= 0 && avoid.has(ci) && ci !== G.cc[a] && ci !== G.cc[b]) return { ok: false, info, why: 'avoid-cross', country: ci }; }
  if (path.km > fuel) return { ok: false, info, why: 'range', need: path.km, via: 'rail' };
  return { ok: true, info, kind: 'train', own: true, fuel: path.km, km: path.km, path: path.pts };
}
// can this vehicle go from a to b right now?
function checkLeg(vehicleId, a, b, fuel, tickets, avoid, fast) {
  if (VEHICLES[vehicleId].rail) return checkRailLeg(a, b, fuel, avoid, fast);
  const v = VEH(vehicleId), hasAvoid = !!(avoid && avoid.size), info = legInfo(a, b, hasAvoid);
  if (hasAvoid && avoid.has(G.cc[b])) return { ok: false, info, why: 'avoid-stop' };
  let crossesAvoid = null;
  if (hasAvoid) for (const ci of info.crossed) if (avoid.has(ci) && ci !== G.cc[a]) { crossesAvoid = ci; break; }
  const cap = Math.max(v.tank * 1.3, info.d * 1.6);
  if (v.coastal) {
    const landOk = b === VOYAGE.inland ? 150 : v.land;
    if (!coastal(b) && b !== VOYAGE.inland) return { ok: false, info, why: 'inland' };
    if (info.landRun <= landOk) { if (info.d > fuel) return { ok: false, info, why: 'range', need: info.d }; return { ok: true, info, kind: 'sail', fuel: info.d, km: info.d }; }
    // route planning guesses the way round a headland; generated boat trips then sail every leg for real
    if (fast) { const est = info.d + 1.5 * info.land; return info.landRun <= 400 && est <= fuel ? { ok: true, info, kind: 'sail', fuel: est, km: est } : { ok: false, info, why: 'range', need: est, via: 'sea' }; }
    const sea = gridPath(a, b, 'sea', cap, v.land, null);
    if (sea && sea.km <= fuel) return { ok: true, info, kind: 'sail', fuel: sea.km, km: sea.km, path: sea.pts };
    if (sea) return { ok: false, info, why: 'range', need: sea.km, via: 'sea' };
    return { ok: false, info, why: 'overland' };
  }
  if (info.waterRun <= v.road && !crossesAvoid) { if (info.d > fuel) return { ok: false, info, why: 'range', need: info.d }; return { ok: true, info, kind: 'road', fuel: info.d, km: info.d }; }
  // the straight line crosses water or an avoided country: look for a way round by land
  const road = fast ? null : gridPath(a, b, 'land', cap, v.road, hasAvoid ? avoid : null);
  if (road && road.km <= fuel) return { ok: true, info, kind: 'road', fuel: road.km, km: road.km, path: road.pts };
  const ferryCap = ferryLimit();
  const ferryPossible = ferryCap > 0 && !crossesAvoid && info.waterRun > v.road && info.waterRun <= ferryCap && coastal(a) && coastal(b);
  if (ferryPossible && tickets > 0 && info.land <= fuel) return { ok: true, info, kind: 'ferry', fuel: info.land, km: info.d, ticket: 1 };
  if (road) return { ok: false, info, why: 'range', need: road.km, via: 'road', ferry: ferryPossible && tickets <= 0 };
  if (crossesAvoid != null) return { ok: false, info, why: 'avoid-cross', country: crossesAvoid };
  if (info.waterRun > ferryCap) return { ok: false, info, why: 'ocean' };
  if (!coastal(a) || !coastal(b)) return { ok: false, info, why: 'port', inland: !coastal(a) ? a : b };
  if (ferryCap <= 0) return { ok: false, info, why: 'noferries' };
  if (tickets <= 0) return { ok: false, info, why: 'tickets' };
  return { ok: false, info, why: 'range', need: info.land };
}
// What the entry list can honestly say about a leg without paying for pathfinding. It mirrors the
// cheap half of checkLeg: a ferry burns only the land approach at each end, so a sea crossing that
// looks hopeless against the fuel gauge is usually one ticket away, not "too far".
function legOutlook(id, mode) {
  const v = VEH(S.opts.vehicle), avoid = tripAvoid();
  if (avoid.has(G.cc[id])) return { text: 'avoided', cls: '' };
  if (mode === 'fly') {
    const cap = planeLimit(), d = dist(G.lat[S.cur], G.lon[S.cur], G.lat[id], G.lon[id]);
    if (d > cap) return { text: '✈ too far', cls: '' };
    if (d < 150) return { text: '✈ too close', cls: '' };
    const free = S.race || (P.freeFlights || 0) > 0, cost = free ? 0 : flightCost(d, S.flights);
    return { text: `✈ ${free ? 'free' : cost + ' coins'}`, cls: free || P.coins >= cost ? 'in' : '' };
  }
  if (mode === 'train') {
    const cap = trainLimit(), d = dist(G.lat[S.cur], G.lon[S.cur], G.lat[id], G.lon[id]);
    if (d > cap) return { text: '🚆 too far', cls: '' };
    return { text: `🚆 ${P.freeTrains || S.race ? 'free ride' : 'station'}`, cls: 'in' };
  }
  const info = legInfo(S.cur, id, false);
  if (v.coastal) {
    if (!coastal(id) && id !== VOYAGE.inland) return { text: 'inland', cls: '' };
    if (info.landRun <= (id === VOYAGE.inland ? 150 : v.land)) return info.d <= S.fuel ? { text: 'in range', cls: 'in' } : { text: 'too far', cls: '' };
    return { text: 'round the coast', cls: 'maybe' }; // only gridPath knows, and that is too slow to type against
  }
  if (info.waterRun <= v.road) return info.d <= S.fuel ? { text: 'in range', cls: 'in' } : { text: 'too far', cls: '' };
  if (info.waterRun > ferryLimit()) return { text: 'ocean', cls: '' };
  if (v.ferry && ferryLimit() > 0 && coastal(S.cur) && coastal(id)) {
    if (info.land > S.fuel) return { text: '⛴ too far', cls: '' };
    return S.tickets > 0 ? { text: '⛴ 1 ticket', cls: 'in' } : { text: '⛴ no tickets', cls: 'maybe' };
  }
  return { text: 'round the bay', cls: 'maybe' };
}
function explain(res, id) {
  const nm = G.name[id], i = res.info;
  switch (res.why) {
    case 'range': return `${nm} is ${fmt(res.need)} km away ${res.via === 'road' ? 'by road' : res.via === 'sea' ? 'by sea' : res.via === 'rail' ? 'by rail' : ''}, but you have ${fmt(S.fuel)} km left.${res.ferry ? ' A ferry would be shorter, but you are out of tickets.' : ''}`.replace(' ,', ',');
    case 'nostation': return `${nm} has no railway station. On a train trip every stop needs one.`;
    case 'nostation-here': return `${G.name[S.cur]} has no railway station, so no train leaves from here.`;
    case 'norail': return `No railway line links ${G.name[S.cur]} and ${nm} closely enough. Try a town along the line.`;
    case 'rail-loading': return 'The rail network is still loading. Try again in a moment.';
    case 'inland': return `${nm} is inland, and your boat can only moor in coastal places.`;
    case 'overland': return `There's no sea route to ${nm} from here that a boat can follow.`;
    case 'ocean': return `${fmt(i.waterRun)} km of open water is past this trip's ferry range of ${fmt(ferryLimit())} km.`;
    case 'port': return `There's no way to ${nm} by land from here, and a ferry needs a port at both ends. ${G.name[res.inland]} is too far inland.`;
    case 'tickets': return `Getting to ${nm} means crossing ${fmt(i.waterRun)} km of water, and you're out of ferry tickets.`;
    case 'noferries': return `Getting to ${nm} needs a ferry, and this trip's rules have no ferries.`;
    case 'avoid-stop': return `${nm} is in ${countryName(id)}, which you're avoiding.`;
    case 'avoid-cross': return `The way to ${nm} crosses ${G.countries[res.country][1]}, which you're avoiding. Find a way around.`;
    default: return `You can't reach ${nm} from here.`;
  }
}

// ================= route finding =================
function rng(seed) { let a = 0; for (const ch of String(seed)) a = Math.imul(a ^ ch.charCodeAt(0), 2654435761) >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
class Heap {
  constructor() { this.a = []; }
  push(x) { const a = this.a; a.push(x); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l].f < a[m].f) m = l; if (r < a.length && a[r].f < a[m].f) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
  get size() { return this.a.length; }
}
// A route you could actually drive, preferring big, close places: big & close beats big & far,
// which beats small & close, which beats small & far. Every leg respects fuel, ferries and avoided countries.
// minPop drops small places before any distance maths: in Europe a 450 km circle holds tens of thousands of villages,
// and sorting all of them at every step is what made long trips time out (Epic quietly turned into Long).
const rankOf = id => G.fc[id] === G.capital || G.pop[id] >= 1e6 ? 0 : G.pop[id] >= 250000 ? 1 : G.pop[id] >= 50000 ? 2 : G.pop[id] >= 10000 ? 3 : 4;
function learningRoute(vehicleId, from, dest, fuelNow, tickets, avoid, taken = new Set(), fast = false, minPop = 3000, deadline = Infinity) {
  const v = VEH(vehicleId), tank = v.tank, rail = !!v.rail;
  const reachFrom = (u, fuel) => u === from ? fuel : tank * tierOf(u).refill;
  const heap = new Heap(), best = new Map(), prev = new Map();
  // a typical leg costs about 3 (0.5, plus a town's size penalty, plus its share of a tank), so the estimate counts
  // 3 per tank of distance still to go. It was 0.4, which let long routes wander all of Europe until the budget ran
  // out: that is why Epic trips quietly came back as Long ones.
  const h = u => dist(G.lat[u], G.lon[u], G.lat[dest], G.lon[dest]) / tank * 3;
  heap.push({ f: h(from), g: 0, u: from, t: tickets }); best.set(from, 0);
  let budget = rail && !fast ? 400 : 30000;
  while (heap.size) {
    const cur = heap.pop();
    if (cur.u === dest) { const path = [dest]; let p = prev.get(dest); while (p != null) { path.unshift(p); p = prev.get(p); } return path; }
    if (cur.g > (best.get(cur.u) ?? Infinity)) continue;
    const limit = reachFrom(cur.u, fuelNow), la0 = G.lat[cur.u], lo0 = G.lon[cur.u];
    const dDest = dist(la0, lo0, G.lat[dest], G.lon[dest]);
    const cands = [];
    for (const w of nearby(la0, lo0, limit)) {
      if (w === cur.u || taken.has(w)) continue;
      if (w !== dest && (G.pop[w] < minPop || (rail && !hasStation(w)))) continue;
      if (avoid && avoid.has(G.cc[w])) continue;
      const d = dist(la0, lo0, G.lat[w], G.lon[w]); if (d > limit || d <= 1) continue;
      const wd = dist(G.lat[w], G.lon[w], G.lat[dest], G.lon[dest]); if (w !== dest && wd > dDest + limit * 0.25) continue;
      cands.push({ w, d, wd, rank: w === dest ? -1 : rankOf(w) });
    }
    // try the most promising first: the destination, then places that get you closer, with a head start for bigger
    // ones. (Sorting purely by size spent the 45 tries on big towns off to the side and stranded routes across
    // sparse country, like Chicago to Denver.)
    cands.sort((a, b) => (a.rank < 0 ? -1e9 : a.wd + a.rank * limit * 0.15) - (b.rank < 0 ? -1e9 : b.wd + b.rank * limit * 0.15));
    let tried = 0;
    for (const { w, d } of cands) {
      if (v.coastal && !coastal(w)) continue;
      if (++tried > 45) break;
      if (--budget < 0 || ((budget & 63) === 0 && performance.now() > deadline)) return null;
      const res = checkLeg(vehicleId, cur.u, w, limit, cur.t, avoid, fast);
      if (!res.ok) continue;
      const cost = 0.5 + (w === dest ? 0 : rankOf(w) * 1.2) + d / tank;
      const g = cur.g + cost;
      if (g < (best.get(w) ?? Infinity)) { best.set(w, g); prev.set(w, cur.u); heap.push({ f: g + h(w), g, u: w, t: cur.t - (res.ticket || 0) }); }
    }
  }
  return null;
}
// o.from / o.to / o.via are place ids the player picked (any of them may be missing). Returns a trip, null, or { error }.
function generateTrip(o, seed, avoid) {
  const r = rng(seed), v = VEH(o.vehicle), len = lengthOf(o.length), regions = regionsOf(o), rail = !!v.rail;
  const [kmMin, kmMax] = len.km.map(k => k * LEN_SCALE[o.vehicle]), minPop = o.vehicle === 'bike' || rail ? Math.min(len.minPop, 100000) : len.minPop;
  const uncharted = regions[0] === 'UNCHARTED' ? unchartedCountries() : null, want = new Set(regions), skip = new Set(skipOf(o));
  // a place belongs to one area (subOf), and the area to one continent: Russia splits at the Urals there
  const inRegion = id => {
    if (uncharted) return uncharted.has(G.cc[id]);
    const sr = subOf(id); if (!sr || skip.has(sr.id)) return false;
    return want.has('ALL') || want.has(sr.cont);
  };
  const usable = id => !avoid.has(G.cc[id]) && (!v.coastal || coastal(id) || (o.isles && id === o.to)) && (!rail || hasStation(id));
  const via = (o.via || []).filter(x => x != null), fixedS = o.from ?? null, fixedD = o.to ?? null, both = fixedS != null && fixedD != null;
  for (const id of [fixedS, fixedD, ...via]) if (id != null && !usable(id)) {
    const why = avoid.has(G.cc[id]) ? `it is in ${countryName(id)}, which you're avoiding` : v.coastal ? 'a boat can only moor on the coast' : rail ? 'it has no railway station' : 'it can’t be reached';
    return { error: `${G.name[id]} can't be part of this ${v.name.toLowerCase()} trip: ${why}.` };
  }
  if (rail && !RAIL.ready) return { error: 'The rail network is still loading. Try again in a moment.' };
  const pool = [];
  for (let i = 0; i < G.n && G.pop[i] >= 50000; i++) if ((G.pop[i] >= minPop || G.fc[i] === G.capital) && inRegion(i) && usable(i)) pool.push(i);
  const chainKm = ids => { let t = 0; for (let i = 1; i < ids.length; i++) t += dist(G.lat[ids[i - 1]], G.lon[ids[i - 1]], G.lat[ids[i]], G.lon[ids[i]]); return t; };
  const tickets = ferryLimit() <= 0 || !v.ferry ? 0 : 3, routeMinPop = o.isles ? 300 : o.vehicle === 'bike' ? 2000 : rail ? 5000 : 15000;
  // one learning route through every point in order, never stopping early at a later checkpoint
  const routeThrough = (pts, fast) => {
    let path = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const taken = new Set([...path.slice(0, -1), ...pts.slice(i + 1)]);
      const seg = learningRoute(o.vehicle, pts[i - 1], pts[i], i === 1 ? v.tank : v.tank * tierOf(pts[i - 1]).refill, tickets, avoid, taken, fast, routeMinPop, o.deadline)
        || (fast ? null : learningRoute(o.vehicle, pts[i - 1], pts[i], v.tank, tickets, avoid, taken, fast, 2000));
      if (!seg) return null;
      path = path.concat(seg.slice(1));
    }
    return path;
  };
  // train and boat routes are planned on guessed track and sea lengths, so travel every leg for real before offering one
  const legsWork = path => { let fuel = v.tank; for (let i = 1; i < path.length; i++) { const res = checkLeg(o.vehicle, path[i - 1], path[i], fuel, 0, avoid, false); if (!res.ok) return false; fuel = Math.min(v.tank, fuel - res.fuel + v.tank * tierOf(path[i]).refill); } return true; };
  if (!both && !pool.length) return { error: `No ${rail ? 'big stations' : 'cities'} to start or end in for ${regionLabel(regions)}.` };
  const pickFrom = list => list[Math.floor(r() * list.length)];
  const t0 = performance.now(), budget = 2500 + 1500 * LENGTHS.indexOf(len);
  for (let attempt = 0; attempt < (both ? 1 : 80) && (attempt === 0 || performance.now() - t0 < budget); attempt++) {
    let s = fixedS, d = fixedD;
    if (s == null && d == null) s = pickFrom(pool);
    if (d == null) {
      const cands = pool.filter(i => i !== s && !via.includes(i) && (() => { const km = chainKm([s, ...via, i]); return km >= kmMin && km <= kmMax; })());
      if (!cands.length) { if (fixedS != null) return { error: `Nothing in ${regionLabel(regions)} is ${len.blurb.replace(' km', '')} km from ${G.name[s]}${via.length ? ' by way of ' + via.map(x => G.name[x]).join(', ') : ''}. Try another length or region.` }; continue; }
      d = pickFrom(cands);
    } else if (s == null) {
      const cands = pool.filter(i => i !== d && !via.includes(i) && (() => { const km = chainKm([i, ...via, d]); return km >= kmMin && km <= kmMax; })());
      if (!cands.length) return { error: `Nothing in ${regionLabel(regions)} is ${len.blurb.replace(' km', '')} km from ${G.name[d]}${via.length ? ' by way of ' + via.map(x => G.name[x]).join(', ') : ''}. Try another length or region.` };
      s = pickFrom(cands);
    }
    if (s === d) return { error: 'The start and the destination are the same place.' };
    let path = routeThrough([s, ...via, d], true);
    // a hand-picked route gets a slower, exact search too (voyages skip it: open-ocean searches are too big)
    if (!path && both && !o.isles) path = routeThrough([s, ...via, d], false);
    if (!path || (!both && path.length < 3)) continue;
    if ((rail || v.coastal) && !legsWork(path)) { if (both) break; continue; }
    let ferries = 0; if (v.ferry) for (let i = 1; i < path.length; i++) if (checkLeg(o.vehicle, path[i - 1], path[i], v.tank, 9, avoid, true).kind === 'ferry') ferries++;
    return { start: s, dest: d, via, par: path, km: chainKm([s, ...via, d]), tickets: v.ferry && ferryLimit() > 0 ? Math.max(2, ferries + 1) : 0 };
  }
  if (both) return { error: `No ${v.name.toLowerCase()} route from ${G.name[fixedS]} to ${G.name[fixedD]}${via.length ? ' through ' + via.map(x => G.name[x]).join(', ') : ''} could be found${rail ? ' along the railway' : ''}. ${avoid.size ? 'Try avoiding fewer countries, or ' : 'Try '}${rail ? 'a car, or' : v.coastal ? 'a car, or' : 'other'} places.` };
  return null;
}
// which length a route of this many km counts as, so a hand-picked Munich → Grozny pays like the Epic it is
function lengthForKm(km, vehicle) {
  const x = km / (LEN_SCALE[vehicle] || 1); let best = LENGTHS[0];
  for (const l of LENGTHS) if (x >= l.km[0]) best = l;
  return best;
}

// ================= trip state =================
let S = null;
let opts = Object.assign({ vehicle: 'car', regions: ['EU'], length: 'short', assist: 'explorer', classic: false, avoid: [], from: null, to: null, via: [] }, store.get('stopover-opts') || {});
opts.regions = regionsOf(opts); delete opts.region;
const saveOpts = () => store.set('stopover-opts', opts);
// a race trip is kept apart, so your own trip is still there when the race is over
const save = () => store.set(S && S.race ? 'stopover-race-trip' : 'stopover-trip', S);
const markerFor = vehicle => { const m = MARKERS.find(x => x.id === (P.equip.markers || {})[vehicle]); return m ? m.icon : VEHICLES[vehicle].icon; };
const fuelNow = () => S.fuel;
const tripAvoid = () => new Set(((S && S.avoid) || []).map(cc => G.ccIndex[cc]).filter(x => x != null));
let hintIds = [];
let lastMsg = { text: '', cls: '', act: null };
// a message can offer the one thing that would unblock you, so being stranded is never a dead end
const MSG_ACTIONS = { ticket: () => buyTicketNow() };
const msgActHtml = () => lastMsg.act ? `<button class="btn small msgact" type="button" id="msg-act">${esc(lastMsg.act.label)}</button>` : '';
function wireMsgAct() { const b = $('msg-act'); if (b && lastMsg.act) b.onclick = MSG_ACTIONS[lastMsg.act.id]; }
function setMsg(text, cls = '', act = null) {
  lastMsg = { text, cls, act };
  const el = $('msg'); if (!el) return;
  el.className = 'msg ' + cls; el.innerHTML = esc(text) + msgActHtml(); wireMsgAct();
}

const viaLeft = () => (S && S.via || []).filter(v => !S.stops.some(s => s.id === v));
// where the sign points: the next place you have to pass through, then the destination
const nextTarget = () => viaLeft()[0] ?? S.dest;
const VIA_BONUS = 60;
// The weekly challenge: an Epic car trip from memory under hard rules, on a continent that turns over each week.
const WEEKLY_RULES = { planes: 'capitals', planeKm: 2500, trains: 'capitals', trainKm: 500, ferryKm: 500, tank: 'small', hints: 'off' };
const WEEKLY_REGIONS = ['EU', 'AS', 'NA', 'AF', 'SA', 'EU', 'AS'];
function isoWeek(t = new Date()) {
  const d = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())), day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const y = d.getUTCFullYear(), n = Math.ceil(((d - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return `${y}-W${String(n).padStart(2, '0')}`;
}
const weeklyTrip = week => ({ vehicle: 'car', length: 'epic', assist: 'navigator', regions: [WEEKLY_REGIONS[+week.slice(-2) % WEEKLY_REGIONS.length]] });
function startTrip(o, daily) {
  if (S && S.race && !S.done) { toast('Finish or give up the race first.'); return false; }
  if (S && S.stakes && !S.done) { toast('Finish or give up your high-stakes run first.'); return false; }
  const weekly = daily === 'weekly'; if (weekly) daily = false;
  const stakes = daily === 'stakes'; if (stakes) daily = false;
  const today = new Date().toISOString().slice(0, 10), week = isoWeek();
  const seed = daily ? 'daily-' + today : weekly ? 'weekly-' + week : stakes ? 'stakes-' + today : 'trip-' + Date.now() + Math.random();
  // the high-stakes route is the same for everyone that day; its continent turns over like the daily trip's
  if (stakes) o = { ...o, regions: [['AS', 'EU', 'SA', 'NA', 'AF', 'EU', 'AS'][new Date().getDay()]], skip: [] };
  if (daily) o = { ...o, vehicle: 'car', length: 'medium', regions: [['EU', 'NA', 'AS', 'EU', 'SA', 'AF', 'EU'][new Date().getDay()]], from: null, to: null, via: [] };
  if (weekly) o = { ...o, ...weeklyTrip(week), classic: false, from: null, to: null, via: [], skip: [] };
  const fixed = daily || weekly || stakes, avoidList = fixed || o.classic ? [] : [...(o.avoid || [])];
  // classic keeps the original rules: no planes or trains; the daily trip uses the default rules and the weekly
  // challenge its own hard ones, so everyone on the same board plays the same trip
  RULES = o.classic ? migrateRules({ planeKm: 0, trainKm: 0 }) : daily ? { ...DEFAULT_RULES } : weekly ? migrateRules(WEEKLY_RULES) : stakes ? migrateRules(STAKES_RULES) : migrateRules(o.rules);
  if (VEHICLES[o.vehicle].rail || VEHICLES[o.vehicle].coastal) RULES = { ...RULES, planeKm: 0, trainKm: 0 };
  if (o.classic && VEHICLES[o.vehicle].rail) { toast('Classic rules have no train trips. Turn Classic off in Settings.'); return false; }
  const avoid = new Set(avoidList.map(cc => G.ccIndex[cc]).filter(x => x != null));
  // picked places are saved by GeoNames id, so they survive a data rebuild
  const place = gid => gid == null ? null : G.byGid.get(gid) ?? null;
  const picked = fixed || o.classic ? {} : { from: place(o.from), to: place(o.to), via: (o.via || []).map(place).filter(x => x != null) };
  const voyage = !fixed && !o.classic && o.vehicle === 'boat' && o.voyage === 'isles';
  let trip = voyage ? generateVoyage(o, picked, seed, avoid) : generateTrip({ ...o, ...picked }, seed, avoid), used = lengthOf(o.length);
  if (trip && trip.error) { toast(trip.error); return false; }
  // a random route that won't fit steps down one length at a time, and says so
  for (let li = LENGTHS.indexOf(used) - 1; !trip && !voyage && li >= 0 && picked.from == null && picked.to == null; li--) {
    trip = generateTrip({ ...o, ...picked, length: LENGTHS[li].id }, seed + '-' + li, avoid);
    if (trip && trip.error) { toast(trip.error); return false; }
    if (trip) { toast(`No ${used.name} route turned up in ${regionLabel(regionsOf(o), skipOf(o))}, so this one is ${LENGTHS[li].name}.`); used = LENGTHS[li]; }
  }
  if (!trip) { toast("No route found with those settings. Try another region or length, or avoid fewer countries."); return false; }
  if (voyage || picked.from != null || picked.to != null || trip.via.length) used = lengthForKm(trip.km, o.vehicle);
  const tripOpts = { ...o, length: used.id, regions: regionsOf(o), skip: skipOf(o), voyage: voyage ? 'isles' : null };
  useVoyage({ voyage: trip.voyage, dest: trip.dest }); const v = VEH(o.vehicle);
  S = { v: 2, classic: !!o.classic, daily: daily ? today : null, weekly: weekly ? week : null, opts: tripOpts, avoid: avoidList, start: trip.start, dest: trip.dest, via: trip.via, par: trip.par, routeKm: trip.km, cur: trip.start, fuel: v.tank, tickets: trip.tickets + seasonTickets(o), ticketsTotal: trip.tickets + seasonTickets(o),
    stops: [], pts: 0, penalties: 0, scouts: [], helps: 0, done: false, gaveUp: false, km: 0,
    rules: { ...RULES }, mult: o.classic ? 1 : Math.round(scoreMultiplier(RULES, o.assist, avoidList.length, fixed || voyage ? null : regionsOf(o), o.vehicle) * (voyage ? 1.3 : 1) * 100) / 100, mode: 'ground', flights: 0, airKm: 0, flightCoins: 0, voyage: trip.voyage || null };
  hintIds = []; lastMsg = { text: '', cls: '' }; GLIDE.self = null; GLIDE.heading = null;
  save(); render(); tripMap.fit(tripBounds(), true, 56, 130);
  if (voyage) { const isle = isleOf(trip.dest); setMsg(`Far-Flung Isles: sail from ${G.name[trip.start]} to ${G.name[trip.dest]}, ${ccName(ccOf(trip.dest))}. ${isle ? isle.note + ' ' : ''}Your boat is stocked for ${fmt(v.tank)} km of open sea: the nearest other shore is ${fmt(trip.voyage.need)} km from the island.`); return true; }
  setMsg(`Name a place within ${fmt(v.tank)} km of ${G.name[trip.start]} to set off.${trip.via.length ? ` Pass through ${trip.via.map(x => G.name[x]).join(', then ')} on the way to ${G.name[trip.dest]}.` : ''}`);
  return true;
}

// A* along the rail grid: real track from OpenStreetMap, rasterised to 0.02° cells (tiny gaps bridged)
const railCache = new Map();
function railPath(a, b, capKm) {
  // a found path serves any cap it fits under; a miss only answers caps no bigger than the one that missed
  const key = a + '|' + b, hit = railCache.get(key);
  if (hit && (hit.result ? hit.result.km <= capKm : hit.cap >= capKm)) return hit.result;
  const { w, h, res: step0, lon0, lat1, bits } = RAIL, on = k => (bits[k >> 3] & (1 << (k & 7))) !== 0;
  const cellOf = (la, lo) => { const r = Math.floor((lat1 - la) / step0), c = Math.floor((lo - lon0) / step0); return r < 0 || r >= h || c < 0 || c >= w ? -1 : r * w + c; };
  const center = k => [lat1 - (Math.floor(k / w) + 0.5) * step0, lon0 + (k % w + 0.5) * step0];
  const snap = id => { const k0 = cellOf(G.lat[id], G.lon[id]); if (k0 < 0) return -1; const r0 = Math.floor(k0 / w), c0 = k0 % w; let best = -1, bd = 1e9; for (let dr = -4; dr <= 4; dr++) for (let dc = -4; dc <= 4; dc++) { const r = r0 + dr, cc = c0 + dc; if (r < 0 || r >= h || cc < 0 || cc >= w) continue; const k = r * w + cc; if (on(k) && dr * dr + dc * dc < bd) { bd = dr * dr + dc * dc; best = k; } } return best; };
  const s = snap(a), g = snap(b); let result = null;
  if (s >= 0 && g >= 0) {
    const [gla, glo] = center(g), hd = k => { const [la, lo] = center(k); return dist(la, lo, gla, glo); };
    const best = new Map([[s, 0]]), prev = new Map(), heap = new Heap(); heap.push({ f: hd(s), g: 0, k: s, gap: 0 });
    let n = 0;
    while (heap.size && n++ < 250000) {
      const cur = heap.pop(); if (cur.g > best.get(cur.k)) continue;
      if (cur.k === g) {
        const cells = [g]; let p = prev.get(g); while (p != null) { cells.push(p); p = prev.get(p); } cells.reverse();
        const every = Math.max(1, Math.ceil(cells.length / 120)), pts = [[G.lat[a], G.lon[a]]];
        for (let i = 0; i < cells.length; i += every) pts.push(center(cells[i]));
        pts.push([G.lat[b], G.lon[b]]); result = { km: cur.g, pts }; break;
      }
      const r = Math.floor(cur.k / w), cc = cur.k % w, la = lat1 - (r + 0.5) * step0, kx = step0 * 111.2 * Math.cos(rad(la)), ky = step0 * 111.2;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue; const nr = r + dr, nc = cc + dc; if (nr < 0 || nr >= h || nc < 0 || nc >= w) continue;
        const nk = nr * w + nc, stepKm = Math.hypot(dr * ky, dc * kx), gap = on(nk) ? 0 : cur.gap + 1; if (gap > 2) continue;
        const ng = cur.g + stepKm; if (ng + hd(nk) > capKm) continue;
        if (ng < (best.get(nk) ?? Infinity)) { best.set(nk, ng); prev.set(nk, cur.k); heap.push({ f: ng + hd(nk), g: ng, k: nk, gap }); }
      }
    }
  }
  if (railCache.size > 2000) railCache.clear();
  railCache.set(key, { cap: capKm, result }); return result;
}

function checkTrain(to) {
  const rulesText = RULES.trains === 'capitals' ? 'a capital with a station' : 'a town with a station';
  const railCap = trainLimit();
  if (railCap <= 0) return { ok: false, why: 'This trip has no trains.' };
  if (!RAIL.ready) return { ok: false, why: 'The rail network is still loading.' };
  if (!stationOK(S.cur)) return { ok: false, why: `${G.name[S.cur]} isn't ${rulesText}, so you can't take a train from here.` };
  if (!stationOK(to)) return { ok: false, why: `${G.name[to]} isn't ${rulesText}.` };
  if (tripAvoid().has(G.cc[to])) return { ok: false, why: `${G.name[to]} is in ${countryName(to)}, which you're avoiding.` };
  const straight = dist(G.lat[S.cur], G.lon[S.cur], G.lat[to], G.lon[to]);
  if (straight > railCap) return { ok: false, why: `${G.name[to]} is too far for one train ride on this trip (the rail range is ${fmt(railCap)} km of track).` };
  const path = railPath(S.cur, to, railCap);
  if (!path) return { ok: false, why: `There's no rail line from ${G.name[S.cur]} to ${G.name[to]} within ${fmt(railCap)} km of track.` };
  // races are free to ride and fly, so coins saved up don't buy a head start
  const free = !S.race && (P.freeTrains || 0) > 0, cost = free || S.race ? 0 : trainCost(path.km);
  if (P.coins < cost) return { ok: false, why: `A train to ${G.name[to]} costs ${cost} coins and you have ${fmt(P.coins)}.` };
  return { ok: true, info: { d: straight }, kind: 'train', fuel: 0, km: path.km, path: path.pts, cost, free };
}
// can you fly from where you are to this city right now?
function checkFlight(to) {
  const d = dist(G.lat[S.cur], G.lon[S.cur], G.lat[to], G.lon[to]), free = !S.race && (P.freeFlights || 0) > 0, cost = free || S.race ? 0 : flightCost(d, S.flights);
  const rulesText = RULES.planes === 'capitals' ? 'a capital with an airport' : RULES.planes === 'large' ? 'a city with a big airport' : 'a city with an airport';
  const airCap = planeLimit();
  if (airCap <= 0) return { ok: false, why: 'This trip has no planes.' };
  if (d > airCap) return { ok: false, why: `${G.name[to]} is ${fmt(d)} km away, past this trip's flight range of ${fmt(airCap)} km.` };
  if (!airportOK(S.cur)) return { ok: false, why: `${G.name[S.cur]} isn't ${rulesText}, so you can't fly from here.` };
  if (to === S.dest) return { ok: false, why: `You can't fly straight into ${G.name[S.dest]}. Land somewhere else and finish on the ground.` };
  if ((S.via || []).includes(to)) return { ok: false, why: `You can't fly straight into ${G.name[to]}. You have to pass through it on the ground.` };
  if (!airportOK(to)) return { ok: false, why: `${G.name[to]} isn't ${rulesText}.` };
  if (tripAvoid().has(G.cc[to])) return { ok: false, why: `${G.name[to]} is in ${countryName(to)}, which you're avoiding.` };
  if (d < 150) return { ok: false, why: `${G.name[to]} is only ${fmt(d)} km away. Drive there instead.` };
  // a class upgrade is paid on top, even on a free flight
  const fclass = flightClass().id, upgrade = classUpgrade(flightCost(d, S.flights)), total = cost + upgrade;
  if (P.coins < total) return { ok: false, why: `A ${fclass === 'economy' ? '' : flightClass().name.toLowerCase() + ' '}flight to ${G.name[to]} costs ${total} coins and you have ${fmt(P.coins)}.`, cost: total };
  return { ok: true, info: { d }, kind: 'flight', fuel: 0, km: d, cost: total, upgrade, fclass, free };
}
function travel(id, mode = 'ground') {
  if (S.done) return;
  if (S.race && Date.now() < S.race.startAt) { setMsg('Wait for the start!', 'bad'); return; }
  if (S.stakes && (id === S.cur || id === S.start || S.stops.some(s => s.id === id))) { stakesBust(`you had already stopped in ${G.name[id]}.`); return; }
  if (S.stakes && id === S.dest && viaLeft().length) { stakesBust(`${G.name[S.dest]} came before its checkpoints.`); return; }
  if (id === S.cur || id === S.start || S.stops.some(s => s.id === id)) { setMsg(`You've already stopped in ${G.name[id]} on this trip. Pick somewhere new.`, 'bad'); return; }
  if (id === S.dest && viaLeft().length) { setMsg(`Not yet: this trip passes through ${viaLeft().map(x => G.name[x]).join(' and ')} before ${G.name[S.dest]}.`, 'bad'); return; }
  const res = mode === 'fly' ? checkFlight(id) : mode === 'train' ? checkTrain(id) : checkLeg(S.opts.vehicle, S.cur, id, fuelNow(), S.tickets, tripAvoid());
  if (!res.ok && (mode === 'fly' || mode === 'train')) { setMsg(res.why, 'bad'); return; }
  if (!res.ok && S.stakes) { stakesBust(explain(res, id)); return; }
  if (!res.ok) {
    const ticketWouldHelp = VEHICLES[S.opts.vehicle].ferry && ferryLimit() > 0 && (res.why === 'tickets' || (res.why === 'range' && res.ferry));
    setMsg(explain(res, id), 'bad', ticketWouldHelp ? { id: 'ticket', label: P.consumables.ticket ? `Use a ticket (${P.consumables.ticket})` : `Buy a ticket · ${TICKET_PRICE}` } : null);
    flashRange(); return;
  }
  const snapshot = JSON.stringify({ ...S, undo: null }), prevVisit = P.visits[placeKey(id)] ? { ...P.visits[placeKey(id)] } : null;
  // in a race every town scores and refuels the same for everyone, whoever has been there before
  const v = VEH(S.opts.vehicle), tier = tierOf(id), before = visitsBefore(id), fam = S.classic || S.race ? { mult: 1, label: '' } : familiarity(before), arrived = id === S.dest;
  // a paid train ride on a road trip; on a train trip the train is your own vehicle and runs on the rail range
  const ride = res.kind === 'train' && !res.own, checkpoint = (S.via || []).includes(id);
  S.fuel = Math.max(0, S.fuel - (res.fuel || 0));
  const fuelBefore = S.fuel;
  // familiar towns refuel less, so replaying a known route gets harder
  const tired = S.classic || S.race ? 1 : refuelFactor(before);
  if (!arrived && !ride) S.fuel = res.kind === 'flight' ? v.tank : Math.min(v.tank, S.fuel + v.tank * tier.refill * tired);
  // after landing you're back on the ground: the next stop is driven unless you pick Fly again
  if (res.kind === 'flight') { S.mode = 'ground'; if (res.free) { P.freeFlights--; P.coins -= res.upgrade || 0; } else P.coins -= res.cost; renderCoins(); S.flights++; S.airKm += res.km; S.flightCoins += res.cost; }
  const classNote = res.kind === 'flight' ? landWithClass(res) : '';
  if (ride) { if (res.free) P.freeTrains--; else P.coins -= res.cost; renderCoins(); S.trains = (S.trains || 0) + 1; S.railKm = (S.railKm || 0) + res.km; S.trainCoins = (S.trainCoins || 0) + res.cost; }
  if (res.ticket) { S.tickets -= 1; P.ferries++; }
  // planes land for free but score nothing; paid trains score half (the railway did the navigating);
  // a very short hop scores less; everything else scores with familiarity and the trip's difficulty
  const legKm = res.km || res.info.d, hop = S.classic || res.kind === 'flight' ? 1 : hopFactor(legKm, S.voyage ? VEHICLES.boat.tank : v.tank);
  const bonus = checkpoint && !S.classic ? Math.round(VIA_BONUS * (S.mult || 1)) : 0;
  const pts = (arrived || res.kind === 'flight' ? 0 : Math.round(tier.pts * fam.mult * (S.mult || 1) * (ride ? 0.5 : 1) * hop)) + bonus;
  S.stops.push({ id, kind: res.kind, own: !!res.own, cost: res.cost || 0, km: legKm, path: res.path || null, pts, mult: fam.mult, famLabel: fam.label, hop, checkpoint, refill: S.fuel - fuelBefore, tier: tier.id, fresh: before === 0 });
  S.km += legKm; S.pts += pts; S.cur = id; S.scouts = []; hintIds = [];
  stakesTurn();
  S.undo = arrived || S.classic ? null : { s: snapshot, pk: placeKey(id), visit: prevVisit, refund: res.free ? res.upgrade || 0 : res.cost || 0, freeTrain: ride && res.free, freeFlight: res.kind === 'flight' && res.free };
  if (!S.classic) { const from = S.stops.length > 1 ? S.stops[S.stops.length - 2].id : S.start; bsRecordLeg(from, id, res.path || null, res.kind); bsVisited(id); }
  startSelfGlide(S.stops.length > 1 ? S.stops[S.stops.length - 2].id : S.start, id, res.path || null, res.kind);
  const pk = placeKey(id), now = Date.now();
  P.visits[pk] = { n: before + 1, first: (P.visits[pk] || {}).first || now, last: now }; P.km += legKm;
  const newFlags = S.classic ? [] : collectFlags(id, now), holo = S.classic ? [] : rollHolo(id, newFlags);
  S.lastFlagsNew = newFlags;
  // a new country is a first stamp for it, crossed into from somewhere else (not the country the trip started in)
  const cameFrom = S.stops.length > 1 ? S.stops[S.stops.length - 2].id : S.start, hadStamp = !!(P.stamps && P.stamps[ccOf(id)]);
  if (!S.classic) { if (S.stops.length === 1) recordStamp(S.start, 'road'); recordStamp(id, res.kind); }
  const newCountry = !S.classic && !hadStamp && ccOf(id) !== ccOf(cameFrom);
  saveProfile();
  const target = nextTarget(), left = dist(G.lat[id], G.lon[id], G.lat[target], G.lon[target]);
  const onward = `${fmt(left)} km to ${G.name[target]}${target !== S.dest ? `, then on to ${G.name[S.dest]}` : ''}.`;
  const hopNote = hop < 1 ? ` (short hop ×${hop.toFixed(2)})` : '';
  const cpNote = checkpoint ? ` Checkpoint reached: +${bonus} bonus.` : '';
  if (arrived) finishTrip(false);
  else if (ride) setMsg(`Train arrived in ${G.name[id]} after ${fmt(res.km)} km of track: ${res.free ? `free ride${P.freeTrains ? ` (${P.freeTrains} left)` : ''}` : `−${res.cost} coins`}, +${pts} pts (trains score half)${hopNote}.${cpNote} ${onward}`, 'good');
  else if (res.kind === 'flight') setMsg(`Landed in ${G.name[id]}: ${res.free ? `free flight${P.freeFlights ? ` (${P.freeFlights} left)` : ''}${res.upgrade ? `, −${res.upgrade} coins for the upgrade` : ''}` : `−${res.cost} coins`} and a full tank.${classNote} Landing scores no points. ${onward}`, 'good');
  else setMsg(`${res.kind === 'ferry' ? 'Ferry crossing done. ' : res.own ? `${fmt(res.km)} km of track. ` : ''}Welcome to ${G.name[id]}: +${pts} pts${!S.classic && fam.mult !== 1 ? ` (${fam.label}, ×${fam.mult})` : ''}${hopNote}.${cpNote} ${v.gauge} +${fmt(S.fuel - fuelBefore)} km${tired < 1 ? ` (familiar town: ${tired === 0.5 ? 'half' : 'a quarter of the'} usual refuel)` : ''}. ${onward}`, 'good');
  if (newFlags.length) celebrateFlags(newFlags, holo); else if (holo.length) celebrateHoloOnly(holo);
  checkAchievements();
  save(); render(); tripMap.fit(tripBounds(), false, 56, 130);
  requestAnimationFrame(() => juiceStop({ id, pts, refill: arrived ? 0 : S.fuel - fuelBefore, newCountry, rank: tier.rank, arrived }));
  if (!S.done && HOOKS.afterTravel) HOOKS.afterTravel();
}
function finishTrip(gaveUp) {
  S.done = true; S.gaveUp = gaveUp;
  if (!gaveUp) {
    // the arrival bonus shrinks with the share of the trip you flew
    const groundShare = S.km > 0 ? Math.max(0, (S.km - (S.airKm || 0) - 0.5 * (S.railKm || 0)) / S.km) : 1;
    S.groundShare = groundShare;
    const disc = tripDiscovery(); S.discovery = S.classic ? 1 : disc.share;
    // the arrival bonus grows with the trip's length; a route of towns you already know pays a quarter of it
    S.bonus = Math.round((lengthOf(S.opts.length).bonus * groundShare * (S.classic || S.race ? 1 : discoveryBonusFactor(disc.share)) + S.tickets * TICKET_BONUS) * (S.mult || 1));
    // three days away earns a double arrival bonus on the first solo trip back (never on a race or a ranked trip)
    if (P.boost && !S.race && !S.daily && !S.weekly && !S.classic) { S.boosted = S.bonus; S.bonus *= 2; P.boost = null; }
    S.total = Math.max(0, S.pts + S.bonus - S.penalties);
    P.trips += 1;
    const bk = `${S.opts.vehicle}-${S.opts.length}`; P.best[bk] = Math.max(P.best[bk] || 0, S.total);
    let coins = Math.round(S.total / 10);
    if (S.daily && P.lastDaily !== S.daily) { coins += 40; P.lastDaily = S.daily; }
    if (S.weekly && P.lastWeekly !== S.weekly) { coins += 150; P.lastWeekly = S.weekly; }
    if (!S.classic) recordFeats();
    S.coins = coins;
    P.history.unshift({ t: Date.now(), mult: S.mult || 1, flights: S.flights || 0, vehicle: S.opts.vehicle, length: S.opts.length, total: S.total, km: Math.round(S.km), fresh: tripDiscovery().fresh, stopsN: tripDiscovery().stops, route: [S.start, ...S.stops.map(s => s.id)].map(i => G.gid[i]), dest: G.gid[S.dest] });
    P.history = P.history.slice(0, 40);
    saveProfile(); addCoins(coins, `trip to ${G.name[S.dest]}`); renderLeagueChip(); publishScore(); feedTrip();
    setMsg(`You made it to ${G.name[S.dest]}!`, 'good');
    setTimeout(() => sfx('arrive'), 120);
    if (!S.classic) setTimeout(playArrivalEffect, 150);
  } else {
    S.total = 0;
    // show a real route from where you gave up, through the biggest, closest places
    S.rescue = rescueRoute();
    if (S.rescue && !S.classic) for (const rid of S.rescue.slice(1, -1)) bsNote(rid, 'rescue');
    if (S.rescue) S.rescuePaths = rescuePaths(S.rescue);
    setMsg('Trip abandoned. The green dashed line on the map is a route that works from where you stopped.');
  }
  S.passed = passedTowns();
  P.lastPlayed = Date.now();
  stakesSettle(gaveUp);
  checkAchievements();
  if (HOOKS.afterFinish) HOOKS.afterFinish(gaveUp);
}
// a route from where you are, through any checkpoints still ahead, to the destination
function rescueRoute() {
  const v = VEH(S.opts.vehicle), avoid = tripAvoid(), pts = [S.cur, ...viaLeft(), S.dest], fast = !!v.rail;
  let path = [S.cur];
  for (let i = 1; i < pts.length; i++) {
    const taken = new Set([S.start, ...S.stops.map(s => s.id), ...path.slice(0, -1), ...pts.slice(i + 1)]); taken.delete(pts[i - 1]);
    const seg = learningRoute(S.opts.vehicle, pts[i - 1], pts[i], i === 1 ? Math.max(S.fuel, v.tank * 0.3) : v.tank, Math.max(S.tickets, 1), avoid, taken, fast)
      || learningRoute(S.opts.vehicle, pts[i - 1], pts[i], v.tank, 3, avoid, taken, fast);
    if (!seg) return null;
    path = path.concat(seg.slice(1));
  }
  return path;
}
const rescuePaths = route => route.slice(1).map((id, i) => { const r = checkLeg(S.opts.vehicle, route[i], id, VEHICLES[S.opts.vehicle].rail ? VEH(S.opts.vehicle).tank * 1.5 : 1e6, 9, tripAvoid()); return r.path || null; });
// trip-shaped achievements need to know what kind of trips you have finished
function recordFeats() {
  const f = P.feats = P.feats || {}, bump = k => { f[k] = (f[k] || 0) + 1; };
  bump('veh-' + S.opts.vehicle); bump('len-' + S.opts.length);
  if (S.via && S.via.length) bump('via');
  if (S.rules.planes === 'off' && S.rules.trains === 'off' && S.rules.hints === 'off') bump('purist');
  const ids = S.stops.map(s => s.id), countries = new Set([S.start, ...ids].map(i => G.cc[i])).size, caps = new Set([S.start, ...ids].filter(i => G.fc[i] === G.capital)).size;
  f.maxCountries = Math.max(f.maxCountries || 0, countries); f.maxCapitals = Math.max(f.maxCapitals || 0, caps);
  const d = tripDiscovery(); if (d.stops >= 5 && d.fresh === d.stops) bump('allnew');
  if (!S.penalties && S.stops.length >= 4) bump('nohelp');
  if (S.voyage) f.isles = [...new Set([...(f.isles || []), G.gid[S.dest]])];
}
function passedTowns() {
  const seen = new Set([S.start, ...S.stops.map(s => s.id)]), found = new Map(); let prev = S.start;
  for (const s of S.stops) {
    const d = dist(G.lat[prev], G.lon[prev], G.lat[s.id], G.lon[s.id]), steps = Math.max(1, Math.ceil(d / 10));
    if (s.kind !== 'ferry') for (let i = 0; i <= steps; i++) { const [la, lo] = interp(G.lat[prev], G.lon[prev], G.lat[s.id], G.lon[s.id], i / steps); for (const id of nearby(la, lo, 12)) if (!seen.has(id) && G.pop[id] >= 2000 && dist(la, lo, G.lat[id], G.lon[id]) <= 12) found.set(id, true); }
    prev = s.id;
  }
  return [...found.keys()].sort((a, b) => G.pop[b] - G.pop[a]).slice(0, 12);
}
function scout() {
  if (S.done || S.scouts.length) return;
  const v = VEH(S.opts.vehicle), here = S.cur, goal = nextTarget(), dHere = dist(G.lat[here], G.lon[here], G.lat[goal], G.lon[goal]), taken = new Set([S.start, ...S.stops.map(s => s.id)]);
  if (goal !== S.dest) taken.add(S.dest);
  const reach = Math.min(S.fuel, v.coastal ? v.tank : Math.max(S.fuel, 1300)), avoid = tripAvoid();
  const cands = nearby(G.lat[here], G.lon[here], reach).filter(id => !taken.has(id) && (!v.rail || hasStation(id)) && dist(G.lat[here], G.lon[here], G.lat[id], G.lon[id]) <= reach)
    .map(id => ({ id, gain: dHere - dist(G.lat[id], G.lon[id], G.lat[goal], G.lon[goal]) })).filter(c => c.gain > 0).sort((a, b) => b.gain - a.gain);
  const maxChecks = v.rail ? 12 : 120;
  const picks = [], bands = [id => G.pop[id] >= 250000 || G.fc[id] === G.capital, id => G.pop[id] >= 10000 && G.pop[id] < 250000, id => G.pop[id] < 10000];
  for (const band of bands) {
    let checked = 0;
    for (const c of cands) {
      if (!band(c.id) || picks.includes(c.id)) continue;
      if (picks.some(p => dist(G.lat[p], G.lon[p], G.lat[c.id], G.lon[c.id]) < Math.max(25, reach * 0.12))) continue;
      if (++checked > maxChecks) break;
      if (checkLeg(S.opts.vehicle, here, c.id, fuelNow(), S.tickets, avoid).ok) { picks.push(c.id); break; }
    }
  }
  if (!picks.length) { setMsg('Your scout found nothing reachable that gets you closer. Try roadside help, or head sideways.', 'bad'); return; }
  // a business or first-class landing leaves a free scout
  if (S.freeScouts > 0) S.freeScouts--; else S.penalties += scoutCost();
  S.scouts = picks.map(id => ({ id, revealed: false }));
  if (hasPerk('instinct')) {
    let checked = 0;
    for (const c of cands) { if (picks.includes(c.id) || visitsBefore(c.id) > 0 || G.pop[c.id] < 2000) continue; if (++checked > maxChecks) break; if (checkLeg(S.opts.vehicle, here, c.id, fuelNow(), S.tickets, avoid).ok) { S.scouts.push({ id: c.id, revealed: false, fresh: true }); break; } }
  }
  hintIds = S.scouts.map(s => s.id);
  save(); render(); tripMap.fit(tripBounds(), false, 56, 130);
}
const maskName = s => s.split('').map((ch, i) => i === 0 || /[\s\-']/.test(ch) ? ch : '·').join('');
function lev(a, b) { const m = a.length, n = b.length; if (!m) return n; if (!n) return m; let prev = Array.from({ length: n + 1 }, (_, i) => i); for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; } return prev[n]; }
// Many names repeat: three Tripolis, a dozen Springfields. Typing "Tripoli, Libya", "Tripoli Libya", "Tripoli LY"
// or "Tripoli (Lebanon)" narrows the name to one country, region or area. A bare name still means the nearest.
const PLACE_ALIASES = { uk: 'GB', britain: 'GB', 'great britain': 'GB', england: 'GB', usa: 'US', us: 'US', america: 'US', uae: 'AE', drc: 'CD', car: 'CF' };
function placeMatches(id, where) {
  const alias = PLACE_ALIASES[where];
  if (alias) return ccOf(id) === alias;
  if (where.length === 2) return fold(ccOf(id)) === where;
  const names = [countryName(id), admOf(id)[0], areaName(id)].filter(Boolean).map(fold);
  return names.some(n => n === where || (where.length >= 3 && n.startsWith(where)));
}
function namedIds(raw) {
  const ids = exactIds(fold(raw));
  if (ids.length) return ids;
  const words = fold(raw).split(' ');
  // shortest qualifier first, so "San Jose Costa Rica" tries "Rica" and then "Costa Rica"
  for (let k = 1; k < words.length; k++) {
    const where = words.slice(-k).join(' '), cand = exactIds(words.slice(0, -k).join(' '));
    const hit = cand.filter(id => placeMatches(id, where));
    if (hit.length) return hit;
  }
  return [];
}
// the example echoes what the player typed: a match can come through an alternate name ("Valencia" finds France's
// Valence), and "Valence, Venezuela" is a place that doesn't exist
const typedName = raw => raw.trim().replace(/\s+/g, ' ').replace(/(^|[\s-])(\p{L})/gu, (m, a, c) => a + c.toUpperCase());
// the other countries a name turns up in, largest first, so the error can say what to type
function namesakes(ids, except) {
  const out = [];
  for (const id of [...ids].sort((a, b) => G.pop[b] - G.pop[a])) { const c = countryName(id); if (c !== countryName(except) && !out.includes(c)) out.push(c); }
  return out;
}
function submitName(raw) {
  if (!searchIndex) { setMsg('Still loading the gazetteer, one moment…'); return; }
  const key = fold(raw);
  if (!key) { setMsg('Type the name of a city, town or village.', 'bad'); return; }
  let ids = namedIds(raw);
  const allNamed = ids;
  if (!ids.length) {
    const near = nearby(G.lat[S.cur], G.lon[S.cur], Math.max(600, S.fuel * 1.5)).filter(id => Math.abs(fold(G.name[id]).length - key.length) <= 2);
    const close = near.filter(id => lev(fold(G.name[id]), key) <= (key.length > 6 ? 2 : 1)).sort((a, b) => G.pop[b] - G.pop[a]);
    setMsg(close.length ? `No place called “${raw.trim()}”. Did you mean ${[...new Set(close.slice(0, 3).map(id => G.name[id]))].join(', ')}?` : `No settlement called “${raw.trim()}” in the gazetteer. Check the spelling, or try the local name.`, 'bad');
    return;
  }
  if (S.mode === 'train') {
    const st = ids.filter(id => stationOK(id)).sort((x, y) => G.pop[y] - G.pop[x]);
    if (!st.length) { setMsg(`${G.name[ids[0]]} has no ${RULES.trains === 'capitals' ? 'capital station' : 'railway station'} you can take a train to.`, 'bad'); return; }
    $('entry-input').value = ''; travel(st[0], 'train'); return;
  }
  if (S.mode === 'fly') {
    const planes = ids.filter(id => airportOK(id)).sort((x, y) => G.pop[y] - G.pop[x]);
    if (!planes.length) { setMsg(`${G.name[ids[0]]} has no ${RULES.planes === 'capitals' ? 'capital airport' : RULES.planes === 'large' ? 'big airport' : 'airport'} you can fly to.`, 'bad'); return; }
    $('entry-input').value = ''; travel(planes[0], 'fly'); return;
  }
  if (VEHICLES[S.opts.vehicle].rail) {
    const st = ids.filter(hasStation);
    if (!st.length) { setMsg(`${G.name[ids[0]]} has no railway station. On a train trip every stop needs one.`, 'bad'); return; }
    ids = st;
  }
  const taken = new Set([S.start, ...S.stops.map(s => s.id)]);
  if (ids.every(id => taken.has(id))) { setMsg(`You've already stopped in ${G.name[ids[0]]} on this trip. Pick somewhere new.`, 'bad'); return; }
  ids = ids.filter(id => !taken.has(id)).sort((a, b) => (b === S.dest) - (a === S.dest) || G.pop[b] - G.pop[a]);
  let best = null, nearest = null, nearestD = Infinity; const avoid = tripAvoid();
  for (const id of ids.slice(0, VEHICLES[S.opts.vehicle].rail ? 6 : 300)) {
    const d = dist(G.lat[S.cur], G.lon[S.cur], G.lat[id], G.lon[id]);
    if (d < nearestD) { nearestD = d; nearest = id; }
    if (d > fuelNow() + ferryLimit()) continue;
    if (checkLeg(S.opts.vehicle, S.cur, id, fuelNow(), S.tickets, avoid).ok) { best = id; break; }
  }
  if (best != null) { $('entry-input').value = ''; travel(best); return; }
  const res = checkLeg(S.opts.vehicle, S.cur, nearest, fuelNow(), S.tickets, avoid);
  const others = namesakes(allNamed, nearest).slice(0, 3);
  setMsg((ids.length > 1 ? `The nearest ${G.name[nearest]} is in ${countryName(nearest)}. ` : '') + explain(res, nearest)
    + (others.length ? ` There's also one in ${others.join(', ')}: add the country to pick it, like “${typedName(raw)}, ${others[0]}”.` : ''), 'bad');
  flashRange();
}
