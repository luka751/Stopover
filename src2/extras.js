// ================= discovery, supplies, perks and cosmetics =================
// Discovery: the game should pay for learning new places, not for replaying a known route.
//   - familiar towns refuel less (4th and 5th visit half, 6th onwards a quarter)
//   - the arrival bonus scales with the share of stops that were first visits
//   - finished trips count toward the explorer rating by how much was new
//   - "Uncharted" trips start and end in the countries you know least
const refuelFactor = before => before >= 5 ? 0.25 : before >= 3 ? 0.5 : 1;
// driving straight to the destination teaches nothing, so no stops counts as no discovery
const discoveryShare = (fresh, stops) => stops ? fresh / stops : 0;
const discoveryBonusFactor = share => 0.25 + 0.75 * share;
function tripDiscovery() {
  if (!S) return { fresh: 0, stops: 0, share: 1 };
  const counted = S.stops.filter(s => s.id !== S.dest), fresh = counted.filter(s => s.fresh).length;
  return { fresh, stops: counted.length, share: discoveryShare(fresh, counted.length) };
}
REGIONS.push({ id: 'UNCHARTED', name: 'Uncharted' });
// the countries you know least, among those big enough to hold a trip
function unchartedCountries() {
  const k = countryKnowledge(), big = new Uint16Array(G.countries.length);
  for (let i = 0; i < G.n && G.pop[i] >= 200000; i++) big[G.cc[i]]++;
  const cands = G.countries.map((c, i) => i).filter(i => big[i] >= 2 && G.contOf[i] !== 'AN').sort((a, b) => k[a] - k[b] || big[b] - big[a]);
  return new Set(cands.slice(0, Math.max(15, Math.round(cands.length * 0.35))));
}

// ---- supplies: a short list of one-off help that changes a trip. Each is used from the Tools menu.
CONSUMABLES.splice(0, CONSUMABLES.length,
  { id: 'jerrycan', name: 'Jerrycan', icon: '⛽', price: 40, blurb: 'Use during a trip: +30% of your tank, right where you are. For the leg that is just out of reach.' },
  { id: 'ticket', name: 'Ferry ticket', icon: '🎫', price: 45, blurb: 'Use during a trip: one extra ferry crossing, when an island is the only way on.' },
  { id: 'tow', name: 'Tow truck', icon: '🛻', price: 70, blurb: 'Use during a trip: undo your last leg. For the wrong Springfield, or a dead end you drove into.' },
);
// ---- upgrades: permanent, and each one changes how a trip plays. Bigger ones need a passport league.
const PERKS = [
  { id: 'mechanic', name: 'Mechanic', icon: '🔧', price: 350, league: 0, blurb: 'Roadside help costs 40 points instead of 75, works under 60% of a tank and fills it to 60%.' },
  { id: 'scouts', name: 'Field scout', icon: '🔭', price: 400, league: 0, blurb: 'Scout ahead costs 10 points instead of 20, and revealing a scouted name is free.' },
  { id: 'season', name: 'Ferry season ticket', icon: '⛴️', price: 500, league: 1, blurb: 'One extra ferry ticket on every car and bike trip.' },
  { id: 'travelcard', name: 'Travel card', icon: '💳', price: 600, league: 1, blurb: 'Paid trains and flights on road trips cost 25% less.' },
  { id: 'instinct', name: "Explorer's instinct", icon: '🧠', price: 750, league: 2, blurb: 'Scout ahead also shows one reachable town you have never visited, for a bigger discovery bonus.' },
  { id: 'tank', name: 'Long-range tank', icon: '🚀', price: 1500, league: 3, blurb: 'Every vehicle carries 10% more range, on every trip.' },
];
const hasPerk = id => !RACE_FAIR && !(S && S.race) && !!(P && P.owned && P.owned.includes('perk:' + id));
const scoutCost = () => hasPerk('scouts') ? 10 : SCOUT_COST;
const revealCost = () => hasPerk('scouts') ? 0 : REVEAL_COST;
const helpCost = () => hasPerk('mechanic') ? 40 : HELP_COST;
const helpThreshold = () => hasPerk('mechanic') ? 0.6 : 0.5;
const seasonTickets = o => hasPerk('season') && VEHICLES[o.vehicle].ferry && ferryLimit() > 0 ? 1 : 0;
// Retired shop items are paid back at the price they sold for, once.
const RETIRED_SUPPLIES = { compass: 30, airmiles: 60, guide: 60, booster: 70, spare: 80, freeze: 100 };
const RETIRED_PERKS = { scholar: 450, tutor: 450, eye: 600, railcard: 300, flyer: 400 };
function settleRetiredItems() {
  if (P.econ >= 2) return;
  let refund = 0;
  for (const [id, price] of Object.entries(RETIRED_SUPPLIES)) { refund += (P.consumables[id] || 0) * price; delete P.consumables[id]; }
  if (P.freeTrains > 2) { refund += Math.floor((P.freeTrains - 2) / 3) * 90; P.freeTrains = Math.min(P.freeTrains, 2); }
  if ((P.magnetUntil || 0) > Date.now()) refund += 180;
  delete P.magnetUntil;
  // a railcard or frequent flyer becomes the travel card; owning both pays the cheaper one back
  const travel = ['railcard', 'flyer'].filter(id => P.owned.includes('perk:' + id));
  if (travel.length) { P.owned.push('perk:travelcard'); if (travel.length === 2) refund += RETIRED_PERKS.railcard; }
  for (const id of ['scholar', 'tutor', 'eye']) if (P.owned.includes('perk:' + id)) refund += RETIRED_PERKS[id];
  P.owned = [...new Set(P.owned.filter(k => !Object.keys(RETIRED_PERKS).some(id => k === 'perk:' + id)))];
  if (P.owned.includes('sign:japan')) { P.owned = P.owned.filter(k => k !== 'sign:japan'); P.owned.push('sign:asphalt'); }
  if (P.equip.sign === 'japan') P.equip.sign = 'asphalt';
  P.owned = [...new Set(P.owned)]; P.econ = 2; P.coins += refund; saveProfile();
  if (refund) setTimeout(() => toast(`The shop was reworked: ${fmt(refund)} coins paid back for retired items`), 1500);
}
// Stranded with no ticket is not a lost trip: spend one you own, or buy one here at the shop price.
function buyTicketNow() {
  if (!S || S.done) return;
  if (P.consumables.ticket > 0) P.consumables.ticket--;
  else if (P.coins >= TICKET_PRICE) { P.coins -= TICKET_PRICE; renderCoins(); }
  else { setMsg(`A ferry ticket costs ${TICKET_PRICE} coins and you have ${fmt(P.coins)}. Score a few more stops first.`, 'bad'); return; }
  S.tickets++; S.ticketsTotal++;
  saveProfile(); save();
  setMsg('🎫 Ferry ticket added. Name the port on the far side again.', 'good');
  render();
}
function useJerrycan() { const v = VEH(S.opts.vehicle); P.consumables.jerrycan--; S.fuel = Math.min(v.tank, S.fuel + v.tank * 0.3); saveProfile(); setMsg(`⛽ Jerrycan used: +${fmt(v.tank * 0.3)} km.`, 'good'); save(); render(); tripMap.fit(tripBounds(), false, 56, 130); }

// ---- cosmetics
const SIGNS = [
  { id: 'eroad', name: 'European road sign', price: 0, blurb: 'The green E-road direction sign.' },
  { id: 'interstate', name: 'US interstate', price: 120, blurb: 'Blue and red interstate shield colours.' },
  { id: 'motorway', name: 'UK motorway', price: 120, blurb: 'White on motorway blue.' },
  { id: 'ortstafel', name: 'German town sign', price: 120, blurb: 'Black on yellow, like an Ortstafel.' },
  { id: 'asphalt', name: 'Asphalt', price: 150, blurb: 'White road paint on black tarmac, with a centre line.' },
];
const TRAILS = [
  { id: 'solid', name: 'Solid line', price: 0, blurb: 'The classic route line.' },
  { id: 'dotted', name: 'Dotted', price: 60, blurb: 'Round dots all the way.' },
  { id: 'glow', name: 'Glow', price: 90, blurb: 'Your route shines on the map.' },
  { id: 'march', name: 'Marching dashes', price: 120, blurb: 'Dashes that keep moving along your route.' },
  { id: 'rainbow', name: 'Rainbow', price: 150, blurb: 'Colours that flow along your route.' },
];
const EFFECTS = [
  { id: 'puff', name: 'Confetti puff', price: 0, blurb: 'A short burst of confetti when you arrive.' },
  { id: 'none', name: 'No effect', price: 0, blurb: 'Arrive quietly.' },
  { id: 'fireworks', name: 'Fireworks', price: 120, blurb: 'Fireworks over the map when you arrive.' },
  { id: 'confetti', name: 'Confetti stamp', price: 100, blurb: 'An ARRIVED stamp and a shower of confetti.' },
];
const INK_PACKS = {
  classic: { name: 'Border-post inks', price: 0, inks: ['#A32D2D', '#185FA5', '#2E7D32', '#5B3FA6', '#2B2B2B', '#B3541E'] },
  navy: { name: 'Consular navy', price: 50, inks: ['#1B2A4A', '#23395D', '#2E4A7D', '#3B5B92'] },
  neon: { name: 'Neon inks', price: 80, inks: ['#FF2E88', '#00A6E0', '#1FBF3A', '#FF8A00', '#9B26FF'] },
  gold: { name: 'Gold foil', price: 120, inks: ['#B8860B', '#C9A227', '#9C7A1C', '#D4AF37'] },
};
const SOUND_PACKS = {
  bells: { name: 'Bells', icon: '🔔', price: 0, type: 'triangle', base: 523.25, gap: 0.075, decay: 0.45 },
  marimba: { name: 'Marimba', icon: '🪘', price: 50, type: 'sine', base: 261.63, gap: 0.09, decay: 0.3 },
  arcade: { name: 'Arcade', icon: '👾', price: 50, type: 'square', base: 523.25, gap: 0.05, decay: 0.18, gain: 0.035 },
  harp: { name: 'Harp', icon: '🎼', price: 60, type: 'sine', base: 783.99, gap: 0.06, decay: 0.9 },
};
const HOLO = { name: 'Holo shine', price: 300, blurb: 'Legendary flags shimmer in your collection and on the flag card.' };
function ensureEquipDefaults() {
  // Winter was retired (it looked like Satellite): anyone who owned it gets Satellite
  if (P.owned.includes('style:winter')) { P.owned = P.owned.filter(x => x !== 'style:winter'); if (!P.owned.includes('style:satellite')) P.owned.push('style:satellite'); }
  if (P.equip.style === 'winter') P.equip.style = 'satellite';
  const e = P.equip; e.sign ||= 'eroad'; e.trail ||= 'solid'; e.effect ||= 'puff'; if (e.effect === 'none' && !P.effectChosen) e.effect = 'puff'; e.ink ||= 'classic'; e.sound ||= 'bells'; e.theme ||= 'field';
  if (!THEMES[e.theme]) e.theme = 'field';
  document.documentElement.classList.toggle('holo', !!e.holo);
  applyInterfaceTheme();
}

// ---- route trails
function strokeTrail(ctx, pts, color, pal, stroke) {
  const t = P.equip.trail;
  if (t === 'dotted') { ctx.lineCap = 'round'; if (!pal.glow) stroke(pts, pal.halo, 7, [0.1, 9]); stroke(pts, color, 5, [0.1, 9]); ctx.lineCap = 'butt'; return; }
  if (t === 'glow') { ctx.shadowColor = color; ctx.shadowBlur = 14; stroke(pts, color, 3.5); stroke(pts, '#FFFFFF', 1.2); ctx.shadowBlur = 0; return; }
  if (t === 'march') { if (!pal.glow) stroke(pts, pal.halo, 6); ctx.lineDashOffset = -performance.now() / 45; stroke(pts, color, 3.5, [10, 7]); ctx.lineDashOffset = 0; return; }
  if (t === 'rainbow') {
    if (!pal.glow) stroke(pts, pal.halo, 7);
    for (let i = 1; i < pts.length; i++) stroke([pts[i - 1], pts[i]], `hsl(${(i * 11 + performance.now() / 60) % 360} 85% 50%)`, 3.5);
    return;
  }
  if (!pal.glow) stroke(pts, pal.halo, 6); stroke(pts, color, 3);
}
// moving trails redraw the trip map a dozen times a second while it is on screen
setInterval(() => {
  if (!S || S.classic || !G || document.hidden || document.querySelector('dialog[open]')) return;
  if (P.equip.trail === 'march' || P.equip.trail === 'rainbow') tripMap.draw();
}, 85);

// ---- arrival effects, drawn on a canvas over the trip map
function playArrivalEffect() {
  const kind = P.equip.effect || 'puff'; if (kind === 'none' || !juiceOn('fx') || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const wrap = $('map').parentElement; let cv = $('fx');
  if (!cv) { cv = document.createElement('canvas'); cv.id = 'fx'; cv.setAttribute('aria-hidden', 'true'); wrap.appendChild(cv); }
  const r = wrap.getBoundingClientRect(), dpr = window.devicePixelRatio || 1, ctx = cv.getContext('2d');
  cv.width = r.width * dpr; cv.height = r.height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = r.width, H = r.height, parts = [], t0 = performance.now(), dur = kind === 'puff' ? 2200 : 3200;
  const colors = ['#FFD166', '#EF476F', '#06D6A0', '#118AB2', '#F2622A', '#FFFFFF'];
  if (kind === 'fireworks') {
    for (let b = 0; b < 6; b++) { const x = W * (0.2 + Math.random() * 0.6), y = H * (0.15 + Math.random() * 0.35), delay = b * 380, c = colors[b % colors.length];
      for (let i = 0; i < 46; i++) { const a = Math.random() * 7, s = 1.5 + Math.random() * 3; parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, c, delay, life: 1100 + Math.random() * 500, size: 2.2 }); } }
  } else if (kind === 'puff') {
    // the free one: a single burst from the bottom of the map, lighter than the paid confetti and without its stamp
    for (let i = 0; i < 70; i++) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.3, s = 7 + Math.random() * 6; parts.push({ x: W / 2 + (Math.random() - 0.5) * 60, y: H + 10, vx: Math.cos(a) * s, vy: Math.sin(a) * s, c: colors[i % colors.length], delay: 0, life: dur, size: 4 + Math.random() * 3, spin: Math.random() * 6, puff: true }); }
  } else {
    for (let i = 0; i < 160; i++) parts.push({ x: Math.random() * W, y: -20 - Math.random() * H * 0.6, vx: (Math.random() - 0.5) * 1.5, vy: 2 + Math.random() * 3, c: colors[i % colors.length], delay: 0, life: dur, size: 4 + Math.random() * 4, spin: Math.random() * 6 });
    const stamp = document.createElement('div'); stamp.className = 'arrivedstamp'; stamp.textContent = 'Arrived'; stamp.setAttribute('aria-hidden', 'true'); wrap.appendChild(stamp); setTimeout(() => stamp.remove(), dur);
  }
  const frame = now => {
    const el = now - t0; ctx.clearRect(0, 0, W, H);
    for (const p of parts) {
      const t = el - p.delay; if (t < 0 || t > p.life) continue;
      const k = t / 16;
      // the puff is thrown up and falls back under gravity, easing sideways as it slows
      const x = p.x + (p.puff ? p.vx * 30 * (1 - Math.exp(-k / 30)) : p.vx * k), y = p.y + p.vy * k + (kind === 'fireworks' ? 0.02 * k * k : p.puff ? 0.13 * k * k : 0);
      ctx.globalAlpha = kind === 'fireworks' ? 1 - t / p.life : p.puff ? Math.min(1, (1 - t / p.life) / 0.35) : 1; ctx.fillStyle = p.c;
      if (kind === 'fireworks') { ctx.beginPath(); ctx.arc(x, y, p.size, 0, 7); ctx.fill(); }
      else { ctx.save(); ctx.translate(x, y); ctx.rotate(p.spin * t / 400); ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); ctx.restore(); }
    }
    ctx.globalAlpha = 1;
    if (el < dur) requestAnimationFrame(frame); else ctx.clearRect(0, 0, W, H);
  };
  requestAnimationFrame(frame);
}

// ---- in-trip supplies
function useTow() {
  if (!S.undo) return;
  const u = S.undo, last = S.stops[S.stops.length - 1];
  const restored = JSON.parse(u.s);
  if (u.visit) P.visits[u.pk] = u.visit; else delete P.visits[u.pk];
  if (u.refund) P.coins += u.refund;
  if (u.freeTrain) P.freeTrains = (P.freeTrains || 0) + 1;
  if (u.freeFlight) P.freeFlights = (P.freeFlights || 0) + 1;
  P.km = Math.max(0, P.km - (last ? last.km : 0));
  P.consumables.tow--;
  S = restored; useVoyage(S); RULES = migrateRules(S.rules); hintIds = [];
  saveProfile(); renderCoins(); save();
  setMsg(`🛻 Towed back to ${G.name[S.cur]}. That leg never happened${u.refund ? ` and ${u.refund} coins came back` : ''}. Flags you collected stay yours.`, 'good');
  render(); tripMap.fit(tripBounds(), false, 56, 130);
}

// ================= interface themes =================
// A theme recolours the whole interface: page, panels, text, lines and the accent on buttons and toggles.
// The destination sign keeps its own look (signs are sold separately), and map styles stay separate too.
// Each theme has a day and a night version, so the 🌙 button keeps working.
const THEMES = {
  field: { name: 'Field guide', price: 0, blurb: 'The original: sage paper and road-sign green.' },
  sandstone: { name: 'Sandstone', price: 300, blurb: 'Warm desert paper with terracotta buttons.',
    day: { page: '#F1E8DA', panel: '#FFFBF4', panel2: '#F6EDE0', ink: '#2B1E14', muted: '#7A6553', line: '#E0CFBA', accent: '#B5532C' },
    night: { page: '#17110C', panel: '#211812', panel2: '#2A1F17', ink: '#F2E6D8', muted: '#B39C86', line: '#3A2C21', accent: '#D9703F' } },
  nordic: { name: 'Nordic', price: 300, blurb: 'Pale fjord greys and deep sea blue.',
    day: { page: '#E8EDF1', panel: '#FFFFFF', panel2: '#F1F5F8', ink: '#16212B', muted: '#5B6B78', line: '#D0DAE2', accent: '#1F5C99' },
    night: { page: '#0B1219', panel: '#121C25', panel2: '#17232E', ink: '#E3ECF3', muted: '#8FA2B2', line: '#243442', accent: '#4E93D6' } },
  sakura: { name: 'Sakura', price: 350, blurb: 'Blossom pink with a plum accent.',
    day: { page: '#F7EAEE', panel: '#FFFBFC', panel2: '#FBF0F3', ink: '#2E1622', muted: '#85606F', line: '#EDD3DC', accent: '#A63A6B' },
    night: { page: '#170C12', panel: '#21121A', panel2: '#2A1822', ink: '#F6E4EC', muted: '#BE93A6', line: '#3C2330', accent: '#E0679F' } },
  lagoon: { name: 'Lagoon', price: 350, blurb: 'Clear aqua water and teal buttons.',
    day: { page: '#E2F1F0', panel: '#FBFFFF', panel2: '#EDF7F6', ink: '#0F2A2A', muted: '#4F7270', line: '#C7E0DE', accent: '#0E7C7B' },
    night: { page: '#071514', panel: '#0D1F1E', panel2: '#122827', ink: '#DDF2F0', muted: '#86ADAA', line: '#1D3836', accent: '#2BB3AE' } },
  mediterranean: { name: 'Mediterranean', price: 400, blurb: 'Whitewashed walls, cobalt doors, a lemon highlight.',
    day: { page: '#EEF1F6', panel: '#FFFFFF', panel2: '#F3F6FB', ink: '#101A33', muted: '#56627E', line: '#D5DCEA', accent: '#1F46B8', fuel: '#E8B400' },
    night: { page: '#080D1C', panel: '#0F1628', panel2: '#141D33', ink: '#E6ECFA', muted: '#8C99BA', line: '#222D48', accent: '#5B80F0', fuel: '#F2C94C' } },
  graphite: { name: 'Graphite', price: 400, blurb: 'Neutral greys with road-marking yellow.',
    day: { page: '#E9E9E7', panel: '#FAFAF9', panel2: '#F0F0EE', ink: '#1C1C1B', muted: '#62625F', line: '#D4D4D0', accent: '#2B2B2A', accentInk: '#FFD23F' },
    night: { page: '#0F0F0F', panel: '#181818', panel2: '#1F1F1F', ink: '#EDEDEA', muted: '#9A9A95', line: '#2E2E2C', accent: '#FFD23F', accentInk: '#141414' } },
  forest: { name: 'Black Forest', price: 400, blurb: 'Pine greens, bark browns and amber.',
    day: { page: '#E4EAE0', panel: '#FAFCF8', panel2: '#EEF3EA', ink: '#17231A', muted: '#5A6A5C', line: '#CFDAC9', accent: '#2F5E3A', fuel: '#D98E04' },
    night: { page: '#0A110C', panel: '#111B14', panel2: '#16231A', ink: '#E0EDE2', muted: '#8EA792', line: '#213225', accent: '#58A06A', fuel: '#F0A92B' } },
  lavender: { name: 'Provence', price: 350, blurb: 'Lavender fields at dusk.',
    day: { page: '#EDEAF5', panel: '#FDFCFF', panel2: '#F3F0FA', ink: '#1F1A33', muted: '#6A6285', line: '#DAD4EA', accent: '#6441A5' },
    night: { page: '#100D1A', panel: '#181425', panel2: '#1E192E', ink: '#ECE8F7', muted: '#A59DC2', line: '#2C2542', accent: '#9C7BE0' } },
  savanna: { name: 'Savanna', price: 450, blurb: 'Golden grass, red earth and a sunset orange.',
    day: { page: '#F3E9CF', panel: '#FFFBEF', panel2: '#F8F0DC', ink: '#2A1D08', muted: '#7C6A45', line: '#E6D5AA', accent: '#C2410C' },
    night: { page: '#150F05', panel: '#20180A', panel2: '#292010', ink: '#F5EAD0', muted: '#BBA67A', line: '#3A2E17', accent: '#F26B2A' } },
  aurora: { name: 'Aurora', price: 500, blurb: 'Polar night with green and violet lights.',
    day: { page: '#E6EEF0', panel: '#FBFEFE', panel2: '#EFF5F6', ink: '#0F1E24', muted: '#50686F', line: '#CDDDE1', accent: '#0F8A6B' },
    night: { page: '#050A12', panel: '#0B1422', panel2: '#0F1A2C', ink: '#E2F4F0', muted: '#86A5B0', line: '#1A2940', accent: '#3DDC97', accentInk: '#04140D', route: '#B57BFF' } },
  terminal: { name: 'Terminal', price: 500, blurb: 'Phosphor green on black. Amber paper by day.',
    day: { page: '#F4ECD8', panel: '#FFF9EA', panel2: '#F7EFDA', ink: '#2A2010', muted: '#7D6C49', line: '#E4D6B2', accent: '#A35C00' },
    night: { page: '#030603', panel: '#081008', panel2: '#0C160C', ink: '#B8F5B0', muted: '#6FA86A', line: '#173017', accent: '#39FF14', accentInk: '#031003', good: '#39FF14' } },
  candy: { name: 'Candy shop', price: 450, blurb: 'Mint, bubblegum and a lot of fun.',
    day: { page: '#E9F7F1', panel: '#FFFFFF', panel2: '#F0FAF5', ink: '#1E2433', muted: '#5F6B80', line: '#CFEDE0', accent: '#E3367A' },
    night: { page: '#0E1117', panel: '#161B25', panel2: '#1B2230', ink: '#F0F4FB', muted: '#9AA6BC', line: '#28314A', accent: '#FF5C9E' } },
};
// a hand-drawn preview of a theme's panel and button, for the shop
const themeSwatch = (id, night) => {
  const t = THEMES[id], c = t.day ? (night ? t.night : t.day) : (night ? { page: '#0C1411', panel: '#131D19', ink: '#E5EDE8', line: '#26352F', accent: '#0E7B44' } : { page: '#EDF0EA', panel: '#FFFFFF', ink: '#16221D', line: '#D3DAD2', accent: '#0B6B3A' });
  return `<svg viewBox="0 0 120 70" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="background:${c.page}" aria-hidden="true"><rect width="120" height="70" fill="${c.page}"/><rect x="8" y="8" width="66" height="54" rx="5" fill="${c.panel}" stroke="${c.line}"/><rect x="14" y="15" width="40" height="5" rx="2" fill="${c.ink}"/><rect x="14" y="25" width="52" height="3" rx="1.5" fill="${c.ink}" opacity=".35"/><rect x="14" y="32" width="46" height="3" rx="1.5" fill="${c.ink}" opacity=".35"/><rect x="14" y="44" width="30" height="11" rx="3" fill="${c.accent}"/><rect x="80" y="8" width="32" height="10" rx="5" fill="${c.panel}" stroke="${c.line}"/><rect x="80" y="23" width="32" height="10" rx="5" fill="${c.accent}"/><circle cx="96" cy="50" r="10" fill="${c.panel}" stroke="${c.line}"/></svg>`;
};
function themeVars(c) {
  const v = { '--page': c.page, '--panel': c.panel, '--panel-2': c.panel2, '--ink': c.ink, '--muted': c.muted, '--line': c.line, '--accent': c.accent, '--accent-ink': c.accentInk || '#FFFFFF', '--focus': c.accent };
  if (c.fuel) v['--fuel'] = c.fuel; if (c.good) v['--good'] = c.good; if (c.route) v['--route'] = c.route;
  return Object.entries(v).map(([k, x]) => `${k}: ${x};`).join(' ');
}
function applyInterfaceTheme() {
  let el = document.getElementById('theme-css');
  if (!el) {
    el = document.createElement('style'); el.id = 'theme-css';
    el.textContent = Object.entries(THEMES).filter(([, t]) => t.day).map(([id, t]) => `:root[data-skin="${id}"] { ${themeVars(t.day)} }
@media (prefers-color-scheme: dark) { :root[data-skin="${id}"]:not([data-theme="light"]) { ${themeVars(t.night)} } }
:root[data-skin="${id}"][data-theme="dark"] { ${themeVars(t.night)} }`).join('\n');
    document.head.appendChild(el);
  }
  const id = P.equip.theme;
  if (id && id !== 'field' && THEMES[id]) document.documentElement.dataset.skin = id; else delete document.documentElement.dataset.skin;
}
