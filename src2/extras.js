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
// (the list itself is TUNE.shop.supplies, in tune.json)
// ---- upgrades: permanent, and each one changes how a trip plays. Bigger ones need a passport league.
const PERKS = TUNE.shop.perks;
const hasPerk = id => !MINI && !RACE_FAIR && !(S && S.race) && !!(P && P.owned && P.owned.includes('perk:' + id));
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
const SIGNS = TUNE.shop.signs;
const TRAILS = TUNE.shop.trails;
const EFFECTS = TUNE.shop.effects;
const INK_PACKS = TUNE.shop.inkPacks;
const SOUND_PACKS = TUNE.shop.soundPacks;
const HOLO = TUNE.shop.holo;
function ensureEquipDefaults() {
  // Winter was retired (it looked like Satellite): anyone who owned it gets Satellite
  if (P.owned.includes('style:winter')) { P.owned = P.owned.filter(x => x !== 'style:winter'); if (!P.owned.includes('style:satellite')) P.owned.push('style:satellite'); }
  if (P.equip.style === 'winter') P.equip.style = 'satellite';
  const e = P.equip; e.models ||= {}; e.sign ||= 'eroad'; e.trail ||= 'solid'; e.effect ||= 'puff'; if (e.effect === 'none' && !P.effectChosen) e.effect = 'puff'; e.ink ||= 'classic'; e.sound ||= 'bells'; e.theme ||= 'field';
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
const THEMES = TUNE.shop.themes;
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
