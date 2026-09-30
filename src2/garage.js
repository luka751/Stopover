// ================= garage: vehicle models, exhaust trails, cover finishes and mottos =================
// The end-game coin sinks that only change how things look. Nothing here makes a trip easier.
//
// Vehicles come in two tiers. The emoji markers (Race car, Tram…) stay as the cheap tier. Models are drawn
// vehicles, seen from above: they turn to face the way they're going, and they're what rivals see of you in a
// race. Either kind glides along each leg instead of jumping, and an exhaust trail follows whichever you drive.

// ---- drawing helpers: every model is drawn nose-first along +x, centred on the origin, about 36 px long
const rr = (c, x, y, w, h, r) => { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); };
const fillRR = (c, x, y, w, h, r, col) => { rr(c, x, y, w, h, r); c.fillStyle = col; c.fill(); };
const dot = (c, x, y, r, col) => { c.beginPath(); c.arc(x, y, r, 0, 7); c.fillStyle = col; c.fill(); };
const wheels = (c, xs, y, w = 6, h = 3, col = '#1C1C1C') => { for (const x of xs) for (const s of [-1, 1]) fillRR(c, x - w / 2, s * y - h / 2, w, h, 1.2, col); };
const MODELS = tuned([
  { id: 'car-cab', kind: 'car', name: 'Yellow cab', price: 1000, blurb: 'Checkered stripe and a roof light.', draw: (c) => {
    wheels(c, [-9, 9], 7.6); fillRR(c, -16, -7, 32, 14, 4, '#F4C20D'); fillRR(c, -7, -6, 13, 12, 3, '#2E3A44');
    fillRR(c, -5, -3, 7, 6, 1.5, '#FFFFFF'); c.fillStyle = '#1C1C1C'; for (let i = 0; i < 6; i++) c.fillRect(-15 + i * 5, (i % 2 ? -7 : 5.5), 2.5, 1.5);
    dot(c, 15.5, -4.2, 1.4, '#FFF7C2'); dot(c, 15.5, 4.2, 1.4, '#FFF7C2'); } },
  { id: 'car-camper', kind: 'car', name: 'Campervan', price: 1800, blurb: 'Two-tone, with a pop-top roof.', draw: (c) => {
    wheels(c, [-10, 10], 8.3); fillRR(c, -17, -8, 34, 16, 5, '#2A9D8F'); fillRR(c, -15, -6.5, 26, 13, 3, '#F4F1E8');
    fillRR(c, -12, -4, 18, 8, 2, '#E76F51'); fillRR(c, 11, -6, 4, 12, 1.5, '#23363F'); dot(c, 16.5, -5, 1.3, '#FFF7C2'); dot(c, 16.5, 5, 1.3, '#FFF7C2'); } },
  { id: 'car-vintage', kind: 'car', name: 'Vintage roadster', price: 2500, blurb: 'A 1930s open tourer with a spare on the back.', draw: (c) => {
    for (const [x, y] of [[-10, -7.5], [-10, 7.5], [10, -7.5], [10, 7.5]]) { fillRR(c, x - 4.5, y - 2.4, 9, 4.8, 2.4, '#EFE4C8'); }
    wheels(c, [-10, 10], 8.6, 5.5, 2.2); fillRR(c, -16, -5.5, 34, 11, 4, '#7A1F2B');
    c.strokeStyle = '#C9A227'; c.lineWidth = .8; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(4 + i * 3, -4); c.lineTo(4 + i * 3, 4); c.stroke(); }
    fillRR(c, -9, -4.2, 9, 8.4, 2, '#3B1810'); fillRR(c, 0.5, -4.5, 1.4, 9, .7, '#BFE3F2');
    dot(c, -18, 0, 3.6, '#1C1C1C'); dot(c, -18, 0, 1.4, '#C9A227'); dot(c, 18.5, -3.4, 1.8, '#FFF7C2'); dot(c, 18.5, 3.4, 1.8, '#FFF7C2'); } },
  { id: 'car-super', kind: 'car', name: 'Supercar', price: 6000, blurb: 'Wedge nose, racing stripes, rear wing.', draw: (c) => {
    wheels(c, [-10, 10], 8, 6.5, 3); c.beginPath(); c.moveTo(19, 0); c.quadraticCurveTo(17, -7.5, 6, -8); c.lineTo(-15, -8); c.quadraticCurveTo(-18, -8, -18, -5); c.lineTo(-18, 5); c.quadraticCurveTo(-18, 8, -15, 8); c.lineTo(6, 8); c.quadraticCurveTo(17, 7.5, 19, 0); c.fillStyle = '#D7263D'; c.fill();
    fillRR(c, -7, -5.5, 12, 11, 4, '#151A22'); c.fillStyle = '#FFFFFF'; c.fillRect(-18, -2, 37, 1.3); c.fillRect(-18, 0.7, 37, 1.3);
    fillRR(c, -20.5, -8.5, 3, 17, 1, '#151A22'); dot(c, 16, -5, 1.2, '#E8F6FF'); dot(c, 16, 5, 1.2, '#E8F6FF'); } },
  { id: 'bike-racer', kind: 'bike', name: 'Road bike', price: 1000, blurb: 'Drop bars and a rider in club colours.', draw: (c) => {
    fillRR(c, -15, -1.2, 9, 2.4, 1.2, '#1C1C1C'); fillRR(c, 6, -1.2, 9, 2.4, 1.2, '#1C1C1C'); c.strokeStyle = '#8A8F94'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-10, 0); c.lineTo(10, 0); c.stroke();
    c.beginPath(); c.moveTo(8, -4.5); c.lineTo(8, 4.5); c.stroke(); c.beginPath(); c.ellipse(-2, 0, 6, 4.5, 0, 0, 7); c.fillStyle = '#1D6FB8'; c.fill(); dot(c, 4, 0, 3, '#F2B233'); } },
  { id: 'bike-cruiser', kind: 'bike', name: 'Cruiser motorbike', price: 2500, blurb: 'Chrome, leather and wide bars.', draw: (c) => {
    fillRR(c, -17, -1.8, 8, 3.6, 1.8, '#1C1C1C'); fillRR(c, 10, -1.6, 8, 3.2, 1.6, '#1C1C1C'); fillRR(c, -11, -3.2, 22, 6.4, 3, '#3A3F47');
    fillRR(c, -3, -4.2, 9, 8.4, 4, '#8B1E2B'); c.strokeStyle = '#D9DDE2'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(9, -7); c.quadraticCurveTo(12, 0, 9, 7); c.stroke();
    c.beginPath(); c.ellipse(-4, 0, 5, 4.2, 0, 0, 7); c.fillStyle = '#4A3222'; c.fill(); dot(c, 1, 0, 2.8, '#101010'); dot(c, 13.5, 0, 1.4, '#FFF7C2'); } },
  { id: 'train-steam', kind: 'train', name: 'Steam locomotive', price: 3500, blurb: 'Black boiler, red cab, and it smokes as it goes.', smoke: true, draw: (c) => {
    fillRR(c, -22, -6.5, 12, 13, 2, '#5B4636'); fillRR(c, -9, -7, 10, 14, 2, '#B0142D'); fillRR(c, -7, -5, 6, 10, 1, '#2A1A1A');
    fillRR(c, 0, -5, 19, 10, 5, '#1C1C1C'); c.strokeStyle = '#C9A227'; c.lineWidth = .9; for (const x of [5, 11]) { c.beginPath(); c.moveTo(x, -5); c.lineTo(x, 5); c.stroke(); }
    dot(c, 14, 0, 2.4, '#3A3A3A'); dot(c, 14, 0, 1.2, '#0A0A0A'); c.beginPath(); c.moveTo(19, -5.5); c.lineTo(23, 0); c.lineTo(19, 5.5); c.closePath(); c.fillStyle = '#8A8F94'; c.fill(); dot(c, 19.5, 0, 1.5, '#FFE9A8'); } },
  { id: 'train-bullet', kind: 'train', name: 'High-speed locomotive', price: 5000, blurb: 'A long white nose and a blue stripe, with a carriage behind.', draw: (c) => {
    fillRR(c, -38, -5, 20, 10, 2, '#F4F6F8'); c.fillStyle = '#2F5BEA'; c.fillRect(-38, -1, 20, 2);
    c.beginPath(); c.moveTo(-16, -5.5); c.lineTo(8, -5.5); c.bezierCurveTo(18, -5.5, 24, -2, 24, 0); c.bezierCurveTo(24, 2, 18, 5.5, 8, 5.5); c.lineTo(-16, 5.5); c.closePath(); c.fillStyle = '#F4F6F8'; c.fill();
    c.strokeStyle = '#B9C2CC'; c.lineWidth = .8; c.stroke(); c.fillStyle = '#2F5BEA'; c.fillRect(-16, -1, 26, 2);
    c.beginPath(); c.moveTo(11, -4); c.bezierCurveTo(17, -4, 20, -1.5, 20, 0); c.bezierCurveTo(20, 1.5, 17, 4, 11, 4); c.closePath(); c.fillStyle = '#1A2230'; c.fill();
    c.strokeStyle = '#555'; c.lineWidth = 1; c.beginPath(); c.moveTo(-8, -4); c.lineTo(-2, 4); c.stroke(); } },
  { id: 'boat-tallship', kind: 'boat', name: 'Tall ship', price: 4000, blurb: 'Three masts under full sail.', draw: (c) => {
    c.beginPath(); c.moveTo(22, 0); c.quadraticCurveTo(14, -7, -16, -6); c.lineTo(-18, 0); c.lineTo(-16, 6); c.quadraticCurveTo(14, 7, 22, 0); c.fillStyle = '#6B4226'; c.fill(); c.strokeStyle = '#3E2614'; c.lineWidth = .8; c.stroke();
    fillRR(c, -14, -4, 30, 8, 3, '#B98A5E'); for (const x of [-8, 2, 12]) { c.beginPath(); c.moveTo(x - 1.5, -10); c.quadraticCurveTo(x + 4, 0, x - 1.5, 10); c.lineTo(x - 3, 10); c.quadraticCurveTo(x + 2, 0, x - 3, -10); c.closePath(); c.fillStyle = '#FBF8EF'; c.fill(); c.strokeStyle = '#C8BFA8'; c.stroke(); }
    c.strokeStyle = '#3E2614'; c.lineWidth = 1; c.beginPath(); c.moveTo(22, 0); c.lineTo(28, 0); c.stroke(); } },
  { id: 'boat-yacht', kind: 'boat', name: 'Luxury yacht', price: 8000, blurb: 'Teak decks, tinted glass and a helipad.', draw: (c) => {
    c.beginPath(); c.moveTo(24, 0); c.bezierCurveTo(18, -8, 4, -8.5, -18, -8); c.lineTo(-20, -6); c.lineTo(-20, 6); c.lineTo(-18, 8); c.bezierCurveTo(4, 8.5, 18, 8, 24, 0); c.fillStyle = '#FFFFFF'; c.fill(); c.strokeStyle = '#AEB8C2'; c.lineWidth = .9; c.stroke();
    fillRR(c, -17, -6, 34, 12, 4, '#C8A27A'); fillRR(c, -8, -4.8, 20, 9.6, 4, '#FFFFFF'); fillRR(c, -4, -3.2, 13, 6.4, 3, '#1E3A55');
    dot(c, -12.5, 0, 3.6, '#2B2B2B'); c.fillStyle = '#FFFFFF'; c.font = '700 5px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('H', -12.5, .3); } },
  { id: 'plane-biplane', kind: 'plane', name: 'Retro biplane', price: 3500, blurb: 'Red and yellow, with a spinning propeller. Flies your flights.', draw: (c, t) => {
    fillRR(c, -4, -18, 9, 36, 3, '#F2B233'); c.strokeStyle = '#B07A10'; c.lineWidth = .8; for (const y of [-12, 12]) { c.beginPath(); c.moveTo(-4, y); c.lineTo(5, y); c.stroke(); }
    fillRR(c, -18, -2.6, 30, 5.2, 2.6, '#C42B2B'); fillRR(c, -19, -7, 4, 14, 1.5, '#F2B233'); dot(c, 0, 0, 2.2, '#3B2A1A');
    c.save(); c.translate(13.5, 0); c.rotate(t / 25); c.fillStyle = 'rgba(40,40,40,.75)'; c.fillRect(-.8, -6, 1.6, 12); c.restore(); dot(c, 13.5, 0, 1.3, '#2B2B2B'); } },
  { id: 'plane-jet', kind: 'plane', name: 'Private jet', price: 10000, blurb: 'Swept wings and a gold cheatline. Flies your flights.', draw: (c) => {
    c.beginPath(); c.moveTo(4, -2); c.lineTo(-8, -17); c.lineTo(-12, -17); c.lineTo(-5, -2); c.moveTo(4, 2); c.lineTo(-8, 17); c.lineTo(-12, 17); c.lineTo(-5, 2); c.fillStyle = '#E6EAEE'; c.fill();
    c.beginPath(); c.moveTo(-15, -1.5); c.lineTo(-21, -7); c.lineTo(-23, -7); c.lineTo(-19, -1.5); c.moveTo(-15, 1.5); c.lineTo(-21, 7); c.lineTo(-23, 7); c.lineTo(-19, 1.5); c.fill();
    c.beginPath(); c.moveTo(22, 0); c.bezierCurveTo(20, -3, 14, -3.2, 8, -3.2); c.lineTo(-20, -2.4); c.lineTo(-22, 0); c.lineTo(-20, 2.4); c.lineTo(8, 3.2); c.bezierCurveTo(14, 3.2, 20, 3, 22, 0); c.fillStyle = '#FFFFFF'; c.fill(); c.strokeStyle = '#AEB8C2'; c.lineWidth = .7; c.stroke();
    c.fillStyle = '#C9A227'; c.fillRect(-20, -.6, 38, 1.2); fillRR(c, 15, -1.8, 4, 3.6, 1.6, '#1E2A38'); } },
], TUNE.shop.models);
const MODEL_KINDS = [['car', 'Car'], ['bike', 'Bike'], ['boat', 'Boat'], ['train', 'Train'], ['plane', 'Flights']];
const modelFor = kind => { const id = ((P.equip || {}).models || {})[kind]; return MODELS.find(m => m.id === id && m.kind === kind) || null; };
// a model drawn at (x, y) facing angle a (radians, screen space); a soft shadow lifts it off the map
function drawModel(ctx, m, x, y, a, scale = 1, halo = null) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(scale, scale);
  if (halo) { ctx.beginPath(); ctx.ellipse(0, 0, 25, 14, 0, 0, 7); ctx.fillStyle = halo; ctx.fill(); }
  // one soft shadow under the whole vehicle (a canvas shadow would darken every part it's built from)
  ctx.beginPath(); ctx.ellipse(1.5, 2.5, m.kind === 'plane' ? 16 : 20, m.kind === 'plane' ? 14 : 8, 0, 0, 7); ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fill();
  m.draw(ctx, performance.now()); ctx.restore();
}
// an exhaust trail in the shop: a car with its particles strung out behind it
function paintExhaustPreview(canvas, id) {
  const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth || 96, h = canvas.clientHeight || 56;
  canvas.width = w * dpr; canvas.height = h * dpr; const c = canvas.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
  for (let i = 0; i < 16; i++) { const k = i / 16; drawParticle(c, { kind: id, seed: (i * 0.618) % 1, hue: i * 22 }, w * .72 - 8 - k * w * .6, h / 2 + Math.sin(i * 1.7) * 4 * k - k * 6, k * .85); }
  drawModel(c, MODELS.find(m => m.id === 'car-cab'), w * .74, h / 2, 0, .7);
}
function paintModelPreview(canvas, id) {
  const m = MODELS.find(x => x.id === id); if (!m) return;
  const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth || 96, h = canvas.clientHeight || 56;
  canvas.width = w * dpr; canvas.height = h * dpr; const c = canvas.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
  drawModel(c, m, w / 2, h / 2, -0.35, Math.min(w / 50, h / 34));
}

// ---- exhaust trails: particles left behind while a vehicle is moving
const EXHAUSTS = TUNE.shop.exhausts;
const CONFETTI = ['#EF476F', '#FFD166', '#06D6A0', '#118AB2', '#8A3FFC'];
function drawParticle(ctx, p, x, y, k) {
  const fade = 1 - k;
  switch (p.kind) {
    case 'smoke': ctx.globalAlpha = .45 * fade; dot(ctx, x, y, 2.5 + 7 * k, '#9AA0A6'); break;
    case 'bubbles': ctx.globalAlpha = .8 * fade; ctx.beginPath(); ctx.arc(x, y, 1.5 + 2.5 * k, 0, 7); ctx.strokeStyle = '#5AAAE8'; ctx.lineWidth = 1.2; ctx.stroke(); break;
    case 'hearts': { ctx.globalAlpha = fade; const s = 3 + 2 * k; ctx.fillStyle = '#E3367A'; ctx.beginPath(); ctx.moveTo(x, y + s * .9); ctx.bezierCurveTo(x - s * 1.4, y - s * .2, x - s * .6, y - s * 1.3, x, y - s * .4); ctx.bezierCurveTo(x + s * .6, y - s * 1.3, x + s * 1.4, y - s * .2, x, y + s * .9); ctx.fill(); break; }
    case 'sparkle': { ctx.globalAlpha = fade; const s = 3.5 * (1 - k * .6); ctx.fillStyle = '#F2C230'; ctx.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? s * .35 : s, a = i * Math.PI / 4 + p.seed; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.fill(); break; }
    case 'confetti': ctx.globalAlpha = fade; ctx.save(); ctx.translate(x, y); ctx.rotate(p.seed * 6 + k * 8); ctx.fillStyle = CONFETTI[Math.floor(p.seed * 5) % 5]; ctx.fillRect(-2, -1, 4, 2); ctx.restore(); break;
    case 'flames': ctx.globalAlpha = .85 * fade; dot(ctx, x, y, 4 * (1 - k * .7), k < .3 ? '#FFE08A' : k < .6 ? '#F2862A' : '#C42B2B'); break;
    case 'rainbow': ctx.globalAlpha = .8 * fade; dot(ctx, x, y, 3.2, `hsl(${(p.hue + k * 40) % 360} 85% 58%)`); break;
  }
  ctx.globalAlpha = 1;
}

// ---- the glide: a move is drawn along its leg over about a second, then the vehicle settles at the stop
// A glide lives in lat/lon, so the map can pan or zoom mid-move and the vehicle stays on its road.
const GLIDE = { self: null, rivals: new Map(), parts: [], raf: 0, heading: null };
// how long a leg takes and how closely a vehicle follows its path: tune.json → glide (Studio: Gameplay → Vehicle movement)
const GLIDE_TUNE = TUNE.glide || { minMs: 1100, maxMs: 2400, flightMs: 2400, msPerPixel: 5, smoothing: 0.004, lookAhead: 0.05 };
const glideOn = () => juiceOn('fx') && !reduceMotion();
function kickMapAnim() {
  if (GLIDE.raf) return;
  const step = () => { tripMap.draw(); const now = performance.now(), busy = (GLIDE.self && now < GLIDE.self.end) || [...GLIDE.rivals.values()].some(g => now < g.end) || GLIDE.parts.length;
    GLIDE.raf = busy ? requestAnimationFrame(step) : 0; };
  GLIDE.raf = requestAnimationFrame(step);
}
// a leg as lat/lon points: a road or rail path when there is one, a great circle otherwise
function legLatLon(a, b, path) {
  if (path && path.length > 1) return path.map(([la, lo]) => [la, lo]);
  const out = []; for (let i = 0; i <= 32; i++) out.push(interp(G.lat[a], G.lon[a], G.lat[b], G.lon[b], i / 32)); return out;
}
// Rail and road paths carry every bend of the track, down to a few metres. Followed point by point, a vehicle
// shivers left and right, so a glide drops the bends too small to see (Ramer–Douglas–Peucker, tolerance a small
// share of the leg) and faces a point a little further along the route rather than the next point.
function simplifyPath(pts, tolKm) {
  if (pts.length < 3) return pts;
  const k = Math.cos(pts[0][0] * Math.PI / 180), xy = pts.map(([la, lo]) => [lo * 111.32 * k, la * 110.57]), keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(), [ax, ay] = xy[a], [bx, by] = xy[b], len = Math.hypot(bx - ax, by - ay) || 1e-9;
    let far = -1, worst = tolKm;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((bx - ax) * (ay - xy[i][1]) - (ax - xy[i][0]) * (by - ay)) / len; if (d > worst) { worst = d; far = i; } }
    if (far > 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
function makeGlide(pts, kind, ms) {
  const raw = [0]; for (let i = 1; i < pts.length; i++) raw.push(raw[i - 1] + dist(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
  pts = simplifyPath(pts, Math.max(0.3, raw[raw.length - 1] * GLIDE_TUNE.smoothing));
  const segs = [0]; for (let i = 1; i < pts.length; i++) segs.push(segs[i - 1] + dist(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
  const now = performance.now(), total = segs[segs.length - 1] || 1;
  return { pts, segs, total, look: total * GLIDE_TUNE.lookAhead, kind, start: now, end: now + ms, lastEmit: now };
}
// the point a distance d (km) along a glide's path
function glidePoint(g, d) {
  d = Math.min(g.total, Math.max(0, d));
  let i = 1; while (i < g.segs.length - 1 && g.segs[i] < d) i++;
  const a = g.pts[i - 1], b = g.pts[i] || a, f = (d - g.segs[i - 1]) / Math.max(1e-9, g.segs[i] - g.segs[i - 1]);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}
// where a glide is at time t: lat, lon, and two points a little behind and ahead on the route to face along it
function glideAt(g, t) {
  const k = Math.min(1, Math.max(0, (t - g.start) / (g.end - g.start))), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2, d = e * g.total;
  const [la, lo] = glidePoint(g, d), look = g.look || 0;
  return { la, lo, behind: glidePoint(g, Math.min(d - look, g.total - 2 * look)), ahead: glidePoint(g, Math.max(d + look, 2 * look)), k };
}
function startSelfGlide(from, to, path, kind) {
  if (!glideOn()) return;
  let pts = legLatLon(from, to, path);
  // typed on before the last glide landed: carry on from where the vehicle is, through the rest of that leg
  const now = performance.now(), prev = GLIDE.self;
  if (prev && now < prev.end) {
    const k = Math.min(1, Math.max(0, (now - prev.start) / (prev.end - prev.start))), d = (k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2) * prev.total;
    pts = [glidePoint(prev, d), ...prev.pts.filter((_, i) => prev.segs[i] > d), ...pts.slice(1)];
  }
  // slow enough to watch the vehicle cross the map: minMs to maxMs by distance on screen, flights take flightMs
  let px = 0; for (let i = 1; i < pts.length; i++) { const [x1, y1] = tripMap.px(pts[i - 1][1], pts[i - 1][0]), [x2, y2] = tripMap.px(pts[i][1], pts[i][0]); px += Math.hypot(x2 - x1, y2 - y1); }
  GLIDE.self = makeGlide(pts, kind, kind === 'flight' ? GLIDE_TUNE.flightMs : Math.max(GLIDE_TUNE.minMs, Math.min(GLIDE_TUNE.maxMs, px * GLIDE_TUNE.msPerPixel)));
  kickMapAnim();
}
const angleOn = (m, a, b) => { const [x1, y1] = m.px(a[1], a[0]), [x2, y2] = m.px(b[1], b[0]); return Math.atan2(y2 - y1, x2 - x1); };
function emitParts(g, fx, la, lo, ang, now) {
  if (!fx) return;
  const n = Math.min(4, Math.floor((now - g.lastEmit) / 28)); if (!n) return; g.lastEmit = now;
  for (let i = 0; i < n; i++) GLIDE.parts.push({ kind: fx, la, lo, t0: now, life: fx === 'rainbow' ? 1650 : 1350, back: -15, side: (Math.random() - .5) * 6, ang, drift: [(Math.random() - .5) * 10, -4 - Math.random() * 8], seed: Math.random(), hue: (now / 6) % 360 });
}
const TRAIL_SCALE = 1.3;
function drawParts(m, ctx) {
  const now = performance.now();
  GLIDE.parts = GLIDE.parts.filter(p => now - p.t0 < p.life);
  for (const p of GLIDE.parts) {
    const k = (now - p.t0) / p.life, [x, y] = m.px(p.lo, p.la), c = Math.cos(p.ang), s = Math.sin(p.ang);
    // drawn a touch bigger than the shop preview, so a trail reads on the map
    ctx.save(); ctx.translate(x + c * p.back - s * p.side + p.drift[0] * k, y + s * p.back + c * p.side + p.drift[1] * k); ctx.scale(TRAIL_SCALE, TRAIL_SCALE);
    drawParticle(ctx, p, 0, 0, k); ctx.restore();
  }
}
// the player's own vehicle on the trip map, in place of the old fixed marker
function drawSelf(m, ctx, pal) {
  const now = performance.now(), g = GLIDE.self && now < GLIDE.self.end + 30 ? GLIDE.self : null;
  let la = G.lat[S.cur], lo = G.lon[S.cur], ang = GLIDE.heading, kind = S.stops.length ? S.stops[S.stops.length - 1].kind : 'road';
  if (g) { const at = glideAt(g, now); la = at.la; lo = at.lo; ang = angleOn(m, at.behind, at.ahead); GLIDE.heading = ang; kind = g.kind; }
  if (ang == null) { const next = [...viaLeft(), S.dest][0]; ang = angleOn(m, [G.lat[S.cur], G.lon[S.cur]], [G.lat[next], G.lon[next]]); }
  // the vehicle of the last leg stays on the map until the next one leaves: the plane after a flight, the train
  // after a paid train ride, the boat after a ferry, even though the next leg goes back to your own vehicle
  const own = S.opts.vehicle, flying = kind === 'flight', railed = kind === 'train' && !VEHICLES[own].rail, ferried = kind === 'ferry' && own !== 'boat';
  const model = flying ? modelFor('plane') : railed ? modelFor('train') : ferried ? modelFor('boat') : modelFor(own);
  const fx = (P.equip || {}).exhaust || (model && model.smoke ? 'smoke' : null), [x, y] = m.px(lo, la);
  if (g) emitParts(g, fx, la, lo, ang, now);
  drawParts(m, ctx);
  if (model) { drawModel(ctx, model, x, y, ang, flying ? 1.05 : .95); return; }
  if (flying) { ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.font = '22px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#2B2B2B'; ctx.fillText('✈', 0, 1); ctx.restore(); return; }
  const boatMarker = MARKERS.find(x2 => x2.id === (P.equip.markers || {}).boat);
  ctx.beginPath(); ctx.arc(x, y, 15, 0, 7); ctx.fillStyle = pal.land; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = pal.ink; ctx.stroke();
  ctx.font = '17px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = pal.ink; ctx.fillText(railed ? markerFor('train') : ferried ? (boatMarker ? boatMarker.icon : '⛴️') : markerFor(own), x, y + 1);
}
// a rival in a race: the model they chose for this vehicle, ringed in their username's colour; their fruit disc if they have none
function drawRival(m, ctx, pal, id, gid, vehicle, look, tryLabel) {
  const now = performance.now(), at = G.byGid.get(gid); if (at == null) return;
  let g = GLIDE.rivals.get(id);
  if (!g || g.to !== gid) {
    const from = g ? G.byGid.get(g.to) : null;
    g = from != null && from !== at && glideOn() ? { ...makeGlide(legLatLon(from, at), 'road', GLIDE_TUNE.minMs), to: gid } : { to: gid, end: 0, still: true, heading: g && g.heading };
    GLIDE.rivals.set(id, g); if (!g.still) kickMapAnim();
  }
  let la = G.lat[at], lo = G.lon[at], ang = g.heading ?? 0;
  if (!g.still && now < g.end + 30) { const p = glideAt(g, now); la = p.la; lo = p.lo; ang = g.heading = angleOn(m, p.behind, p.ahead); emitParts(g, look.fx, la, lo, ang, now); }
  const [x, y] = m.px(lo, la), model = MODELS.find(x2 => x2.id === (look.ride || {})[vehicle] && x2.kind === vehicle);
  if (model) {
    drawModel(ctx, model, x, y, ang, .85, look.color + '55');
    ctx.beginPath(); ctx.arc(x, y - 16, 8, 0, 7); ctx.fillStyle = pal.land; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = look.color; ctx.stroke();
    ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(look.done ? '🏁' : look.emoji, x, y - 15.5);
  } else {
    ctx.beginPath(); ctx.arc(x, y, 12, 0, 7); ctx.fillStyle = look.color; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = pal.halo || '#FFFFFF'; ctx.stroke();
    ctx.font = '13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(look.done ? '🏁' : look.emoji, x, y + 1);
  }
  tryLabel(look.label, x + 15, y + 15, { size: 12, weight: 700, color: look.color });
}

// ---- passport cover finishes: drawn over any cover, league or country
const COVER_FINISHES = {
  gold: { name: 'Embossed gold', price: 1000, blurb: 'Gold-foil lettering and a pressed double border.', ink: 'url(#cf-gold)',
    defs: '<linearGradient id="cf-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F7E08A"/><stop offset=".45" stop-color="#C9962A"/><stop offset=".7" stop-color="#FFF1B8"/><stop offset="1" stop-color="#A87718"/></linearGradient>',
    over: '<rect x="20" y="14" width="190" height="282" rx="6" fill="none" stroke="url(#cf-gold)" stroke-width="2.4"/><rect x="25" y="19" width="180" height="272" rx="4" fill="none" stroke="url(#cf-gold)" stroke-width=".9"/>' },
  parchment: { name: 'Vintage parchment', price: 1500, blurb: 'Aged paper, sepia ink and foxed edges.', color: '#D8C08F', ink: '#5B3A1E',
    defs: '<radialGradient id="cf-foxed" cx=".5" cy=".45" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#5B3A1E" stop-opacity=".45"/></radialGradient>',
    over: '<rect width="220" height="310" rx="10" fill="url(#cf-foxed)"/><circle cx="170" cy="70" r="18" fill="#8B5A2B" opacity=".08"/><circle cx="50" cy="250" r="26" fill="#8B5A2B" opacity=".07"/><circle cx="185" cy="230" r="9" fill="#8B5A2B" opacity=".1"/>' },
  leather: { name: 'Tooled leather', price: 2000, blurb: 'Brown hide with a stitched edge.', color: '#6B3A1F', ink: '#E8C888',
    defs: '<pattern id="cf-grain" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 3h3M3 0v2M4 5h2" stroke="#000" stroke-opacity=".12" stroke-width=".8"/></pattern>',
    over: '<rect width="220" height="310" rx="10" fill="url(#cf-grain)"/><rect x="21" y="11" width="188" height="288" rx="7" fill="none" stroke="#E8C888" stroke-opacity=".75" stroke-width="1.4" stroke-dasharray="5 4"/>' },
  obsidian: { name: 'Obsidian', price: 3000, blurb: 'Volcanic black glass with silver lettering and a glossy sheen.', color: '#0C0C10', ink: 'url(#cf-silver)',
    defs: '<linearGradient id="cf-silver" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F1F3F6"/><stop offset=".5" stop-color="#8E96A1"/><stop offset="1" stop-color="#E3E7EC"/></linearGradient><linearGradient id="cf-sheen" x1="0" y1="0" x2="1" y2="1"><stop offset=".3" stop-color="#FFF" stop-opacity="0"/><stop offset=".45" stop-color="#FFF" stop-opacity=".16"/><stop offset=".55" stop-color="#FFF" stop-opacity="0"/></linearGradient>',
    over: '<rect width="220" height="310" rx="10" fill="url(#cf-sheen)"/>' },
  holo: { name: 'Holographic', price: 5000, blurb: 'A foil cover that runs through every colour.', color: 'url(#cf-holo)', ink: '#23233A',
    defs: '<linearGradient id="cf-holo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFD6E8"/><stop offset=".25" stop-color="#C8F1FF"/><stop offset=".5" stop-color="#E4D4FF"/><stop offset=".75" stop-color="#D2FFE4"/><stop offset="1" stop-color="#FFF1C2"/></linearGradient><linearGradient id="cf-holoshine" x1="0" y1="1" x2="1" y2="0"><stop offset=".35" stop-color="#FFF" stop-opacity="0"/><stop offset=".5" stop-color="#FFF" stop-opacity=".55"/><stop offset=".65" stop-color="#FFF" stop-opacity="0"/></linearGradient>',
    over: '<rect width="220" height="310" rx="10" fill="url(#cf-holoshine)"/>' },
};
for (const [id, f] of Object.entries(TUNE.shop.finishes)) Object.assign(COVER_FINISHES[id] || {}, f);
// the finish a passport carries: yours from your equipment, anyone else's from their public profile
const finishOf = p => { const f = ((p || {}).equip || {}).finish; return COVER_FINISHES[f] ? f : null; };

// ---- mottos: a line of your own under your name, bought, not earned
const MOTTOS = TUNE.shop.mottos;
const mottoText = id => (MOTTOS.find(m => m.id === id) || {}).text || '';
const myMotto = () => P.motto && P.owned.includes('motto:' + P.motto) ? P.motto : null;
