// ================= feel: greeting, place ticker, stop effects, sounds, nudges, holo flags =================
// Everything here is on by default and can be switched off in Settings. Motion also backs off by itself for
// players whose system asks for reduced motion, and every sound follows the Sound effects setting.
const JUICE_DEFAULTS = { fx: true, ticker: true, greet: true, nudges: true };
const juiceOn = key => ((P.juice || {})[key] ?? JUICE_DEFAULTS[key]) !== false;
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- sounds: synthesised on the spot, short and quiet, so they sit under the flag chimes rather than over them
function sfx(kind, arg = 0) {
  if (P.sound === false) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = audio.currentTime + 0.01;
    const tone = (f, at, dur, type = 'sine', vol = 0.05, glide) => {
      const o = audio.createOscillator(), g = audio.createGain(); o.type = type; o.frequency.setValueAtTime(f, t0 + at);
      if (glide) o.frequency.exponentialRampToValueAtTime(glide, t0 + at + dur);
      g.gain.setValueAtTime(0, t0 + at); g.gain.linearRampToValueAtTime(vol, t0 + at + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      o.connect(g); g.connect(audio.destination); o.start(t0 + at); o.stop(t0 + at + dur + 0.05);
    };
    const thud = (at, dur, vol, cutoff) => {
      const n = Math.floor(audio.sampleRate * dur), buf = audio.createBuffer(1, n, audio.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 4;
      const src = audio.createBufferSource(), f = audio.createBiquadFilter(), g = audio.createGain();
      f.type = 'lowpass'; f.frequency.value = cutoff; g.gain.value = vol; src.buffer = buf; src.connect(f); f.connect(g); g.connect(audio.destination); src.start(t0 + at);
    };
    // a stop: a soft two-note pluck, brighter for smaller places, since those are the ones worth more
    if (kind === 'stop') { const f = 440 * (1 + 0.07 * arg); tone(f, 0, 0.16, 'triangle', 0.045); tone(f * 1.5, 0.06, 0.22, 'triangle', 0.035); }
    // a new country: the passport stamp coming down
    else if (kind === 'country') { thud(0, 0.16, 0.55, 700); tone(120, 0, 0.22, 'sine', 0.13, 70); tone(660, 0.14, 0.2, 'triangle', 0.03); }
    else if (kind === 'arrive') [1, 1.26, 1.5, 2].forEach((r, i) => tone(392 * r, i * 0.1, 0.55, 'triangle', 0.055));
    else if (kind === 'holo') for (let i = 0; i < 8; i++) tone(1320 + i * 210, i * 0.045, 0.4, 'sine', 0.022);
    else if (kind === 'crown') { [1, 1.26, 1.5].forEach((r, i) => tone(262 * r, i * 0.09, 0.5, 'sawtooth', 0.018)); tone(523, 0.3, 0.9, 'triangle', 0.06); tone(784, 0.3, 0.9, 'triangle', 0.03); }
  } catch { /* no sound in this browser */ }
}

// ---- the ticker beside the logo: one line at a time, gliding right to left and gone
const TICK = { q: [], busy: false };
function tick(html, o = {}) {
  if (!juiceOn(o.kind === 'greet' ? 'greet' : 'ticker')) return;
  TICK.q.push({ html, ...o });
  if (TICK.q.length > 3) TICK.q.splice(0, TICK.q.length - 3); // a burst of stops shouldn't queue a minute of text
  if (!TICK.busy) nextTick();
}
function nextTick() {
  const box = $('ticker'), m = TICK.q.shift();
  if (!box || !m) { TICK.busy = false; if (box) box.hidden = true; return; }
  TICK.busy = true; box.hidden = false;
  box.innerHTML = `<span class="tk ${m.still ? 'still' : ''}">${m.html}</span>`;
  const span = box.firstChild, W = box.clientWidth, w = span.scrollWidth;
  if (!W) { box.hidden = true; TICK.busy = false; return; } // no room in the bar (a phone): skip quietly
  const anim = m.still || reduceMotion() || w < W * 0.8
    // short lines and greetings settle in the middle, then leave; long ones glide through
    ? span.animate([{ opacity: 0, transform: 'translateX(24px)' }, { opacity: 1, transform: 'none', offset: 0.1 }, { opacity: 1, transform: 'none', offset: 0.86 }, { opacity: 0, transform: 'translateX(-24px)' }], { duration: m.hold || 4200, easing: 'ease-out' })
    : span.animate([{ transform: `translateX(${W}px)` }, { transform: `translateX(${-w}px)` }], { duration: Math.max(3800, (W + w) / 95 * 1000), easing: 'linear' });
  anim.onfinish = () => { box.hidden = true; setTimeout(nextTick, 350); };
}

// ---- hello: once per visit, fading out of the bar. Three days away earns a boosted first trip back.
const BOOST_DAYS = TUNE.rewards.boostDays;
function greetOnBoot() {
  if (MINI) return;
  const now = Date.now(), last = P.lastPlayed || 0, days = last ? (now - last) / 864e5 : 0;
  P.lastPlayed = now;
  if (last && days >= BOOST_DAYS && !P.boost) P.boost = { at: now };
  saveProfile();
  if (!last) { tick('Welcome to Stopover 👋 Name a town in range to set off towards the green sign', { still: true, hold: 7000, kind: 'greet' }); return; }
  const nm = HOOKS.greetName ? HOOKS.greetName() : P.playerName && P.playerName !== 'Traveller' ? P.playerName : '';
  const who = nm ? `<b>${esc(nm)}</b>` : '', h = new Date().getHours();
  const part = h < 5 ? 'Up late' : h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening', pick = a => a[Math.floor(Math.random() * a.length)];
  const line = P.boost ? `${who ? `${who}, you're back` : "You're back"} 👋 <span class="tk-boost">Your next trip pays a double arrival bonus</span>`
    : days >= 1 ? pick([`Welcome back${who ? `, ${who}` : ''} 👋`, `${part}${who ? `, ${who}` : ''}. Where to today?`, `${who || 'Traveller'}, the map missed you 🗺️`])
    : pick([`${who || 'Traveller'}, back at it again 👋`, `Back at it${who ? `, ${who}` : ''} 🧭`, `${part}${who ? `, ${who}` : ''}. One more trip?`]);
  tick(line, { still: true, hold: P.boost ? 8000 : 5500, kind: 'greet' });
}

// ---- the moment a stop lands: the ticker names it, points float up from it, a new country gets its stamp
function juiceStop(e) {
  const id = e.id, where = `${esc(G.name[id])} <small>${esc(placeLine(id))}</small>`;
  tick(e.newCountry ? `🛂 Entering <b>${esc(countryName(id))}</b> · ${esc(G.name[id])}` : e.arrived ? `🏁 Arrived in <b>${esc(G.name[id])}</b>` : `Welcome to ${where}`);
  if (!e.arrived) sfx(e.newCountry ? 'country' : 'stop', e.rank);
  if (!juiceOn('fx')) return;
  if (e.pts || e.refill > 0) floatPoints(id, e.pts, e.refill);
  if (e.newCountry && P.stamps && P.stamps[ccOf(id)]) stampSlam(ccOf(id));
  if (e.refill > 0) { const f = document.querySelector('#dash .gauge .fill'); if (f) { f.classList.remove('refilled'); void f.offsetWidth; f.classList.add('refilled'); } }
}
// follows the marker while the map glides to its new framing, so the number rises from the town itself
function floatPoints(id, pts, refill) {
  const wrap = $('map').parentElement, el = document.createElement('div');
  el.className = 'ptfloat'; el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `${pts ? `+${fmt(pts)}` : ''}${refill > 0 ? `<small>⛽ +${fmt(refill)} km</small>` : ''}`;
  wrap.appendChild(el);
  const t0 = performance.now(), dur = reduceMotion() ? 900 : 1500;
  const step = now => {
    const k = Math.min(1, (now - t0) / dur), [x, y] = tripMap.px(G.lon[id], G.lat[id]);
    el.style.transform = `translate(${x}px, ${y - 22 - (reduceMotion() ? 0 : 38 * (1 - (1 - k) ** 3))}px) translate(-50%, -100%)`;
    el.style.opacity = k < 0.12 ? k / 0.12 : k > 0.7 ? (1 - k) / 0.3 : 1;
    if (k < 1) requestAnimationFrame(step); else el.remove();
  };
  requestAnimationFrame(step);
}
function stampSlam(cc) {
  const wrap = $('map').parentElement, el = document.createElement('div');
  el.className = 'stampslam'; el.setAttribute('aria-hidden', 'true');
  el.innerHTML = stampSvg(cc, P.stamps[cc]);
  wrap.appendChild(el);
  const frames = reduceMotion()
    ? [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }]
    : [{ opacity: 0, transform: 'scale(2.4) rotate(-14deg)' }, { opacity: 1, transform: 'scale(0.94) rotate(-6deg)', offset: 0.12, easing: 'ease-out' },
      { transform: 'scale(1.03) rotate(-6deg)', offset: 0.18 }, { transform: 'scale(1) rotate(-6deg)', offset: 0.24 }, { opacity: 1, transform: 'scale(1) rotate(-6deg)', offset: 0.8 }, { opacity: 0, transform: 'translateY(8px) scale(1) rotate(-6deg)' }];
  el.animate(frames, { duration: 2300, easing: 'linear' }).onfinish = () => el.remove();
}

// ---- almost there: the nearest goals, told when you can still act on them
function nudges(focusCcs = [], limit = 3) {
  if ((S && S.classic) || MINI) return [];
  const k = countryKnowledge(), out = [], cat = flagCatalog();
  // country covers: a handful of places short of the 25 that earn one
  G.countries.forEach((c, i) => { const n = k[i], cc = c[0]; if (n >= COVER_UNLOCK - 6 && n < COVER_UNLOCK && COVERS_HAS(cc)) out.push({ icon: '🛂', text: `${COVER_UNLOCK - n} more ${COVER_UNLOCK - n === 1 ? 'place' : 'places'} in ${ccName(cc)} ${COVER_UNLOCK - n === 1 ? 'earns' : 'earn'} its passport cover`, near: (COVER_UNLOCK - n) / 6, cc }); });
  // crowns: close enough to take one from its holder
  if (HOOKS.crownOf) G.countries.forEach((c, i) => { const cr = HOOKS.crownOf(c[0]), n = k[i]; if (cr && !cr.mine && n > 0 && cr.n - n < 5 && cr.n >= n) out.push({ icon: '👑', text: `${cr.n - n + 1} more in ${ccName(c[0])} takes the crown from ${cr.who}`, near: (cr.n - n + 1) / 5, cc: c[0] }); });
  // flag albums: one or two flags from their next payout
  if (cat) for (const [cc, list] of cat.byCc) {
    const have = list.filter(f => owns(f.key)).length; if (!have) continue;
    const step = albumSteps(list.length).find(s => have < Math.ceil(list.length * ALBUM_STEPS[s])); if (step == null) continue;
    const need = Math.ceil(list.length * ALBUM_STEPS[step]) - have;
    if (need <= 2) out.push({ icon: '📘', text: `${need} more ${need === 1 ? 'flag' : 'flags'} ${step === 3 ? (need === 1 ? 'completes' : 'complete') : `${need === 1 ? 'fills' : 'fill'} ${ALBUM_STEPS[step] * 100}% of`} ${ccName(cc)}'s album · +${albumReward(list.length, step)}`, near: need / 3, cc });
  }
  // the next flag rank, and the next league
  const fc = flagCounts(), next = FLAG_RANKS[FLAG_RANKS.indexOf(flagRankOf(fc.have)) + 1];
  if (next && next.at - fc.have <= 12) out.push({ icon: '🚩', text: `${next.at - fc.have} more flags make you a ${next.name}`, near: (next.at - fc.have) / 12 });
  const r = explorerRating(), lg = LEAGUES[LEAGUES.indexOf(leagueOf(r.total)) + 1];
  if (lg && lg.at - r.total <= 25) out.push({ icon: '📘', text: `${lg.at - r.total} rating from ${lg.name}`, near: (lg.at - r.total) / 25 });
  // what this trip touched comes first, then whatever is closest
  return out.sort((a, b) => (focusCcs.includes(b.cc) - focusCcs.includes(a.cc)) || a.near - b.near).slice(0, limit);
}
const COVERS_HAS = cc => !COVERS.data || !!COVERS.data.countries[cc];
function nudgesHtml(focusCcs, limit) {
  if (!juiceOn('nudges')) return '';
  const list = nudges(focusCcs, limit); if (!list.length) return '';
  return `<div class="nudges"><div class="label">Almost there</div><ul>${list.map(n => `<li><span aria-hidden="true">${n.icon}</span>${esc(n.text)}</li>`).join('')}</ul></div>`;
}

// ---- holo flags: now and then a flag comes as a foil. New flags can, and flags you already own can on a
// return visit, so a town you know well still has something to give.
const { holoNew: HOLO_NEW, holoAgain: HOLO_AGAIN, holoPay: HOLO_PAY } = TUNE.rewards;
const isHolo = (key, p = P) => !!(p.holo && p.holo[key]);
// the foil sits over the flag picture only, not its caption
const holoWrap = (imgHtml, on) => on ? `<span class="foilflag">${imgHtml}<span class="holotag">HOLO</span></span>` : imgHtml;
const holoCount = (p = P) => Object.keys(p.holo || {}).filter(k => p.flagsSeen && p.flagsSeen[k]).length;
function rollHolo(id, fresh) {
  if (!S || S.classic || MINI || !FLAGS.ready) return [];
  P.holo = P.holo || {}; const got = [];
  for (const key of flagKeysFor(id)) {
    if (!P.flagsSeen[key] || P.holo[key]) continue;
    if (Math.random() < (fresh.includes(key) ? HOLO_NEW : HOLO_AGAIN)) { P.holo[key] = Date.now(); got.push(key); }
  }
  return got;
}
// a holo on a return visit has no new flags to ride along with, so it gets the drop card to itself
function celebrateHoloOnly(keys) {
  const cat = flagCatalog(); if (!cat) return;
  const flags = keys.map(k => cat.byKey.get(k)).filter(Boolean); if (!flags.length) return;
  const coins = flags.reduce((t, f) => t + RARITY[f.rarity].coins * HOLO_PAY, 0);
  P.coins += coins; renderCoins(); bumpCoins(); saveProfile();
  showFlagDrop(flags, coins, [], flags.map(f => ({ icon: '✨', text: `Holo ${f.label}`, coins: RARITY[f.rarity].coins * HOLO_PAY, big: true })), { holo: new Set(keys), title: flags.length > 1 ? `${flags.length} holo flags` : 'Holo flag' });
  sfx('holo');
}

// ---- streak milestones: the flag streak pays out as it reaches round numbers
const STREAK_MILESTONES = TUNE.rewards.streakMilestones;
function streakMilestone(n) {
  const m = STREAK_MILESTONES.find(([d]) => d === n); if (!m) return null;
  P.streakPaid = P.streakPaid || {};
  const key = `${n}:${(P.flagStreak || {}).start || ''}`; if (P.streakPaid[key]) return null;
  P.streakPaid[key] = Date.now();
  return { icon: '🔥', text: `${n}-day streak milestone`, coins: m[1], big: true };
}

// ---- sharing a finished trip: a few lines anyone can read, one square per stop
function shareText() {
  const sq = s => s.id === S.dest ? '🏁' : s.kind === 'ferry' ? '⛴️' : s.kind === 'flight' ? '✈️' : s.kind === 'train' ? '🚆' : s.fresh ? '🟩' : '🟨';
  const head = S.weekly ? `Stopover weekly challenge ${S.weekly}` : S.daily ? `Stopover daily ${S.daily}` : `Stopover · ${lengthOf(S.opts.length).name} ${VEHICLES[S.opts.vehicle].name.toLowerCase()} trip`;
  // the link opens the same puzzle for whoever taps it: the daily trip is the daily game's too, so a friend can play
  // it there without an account; the weekly challenge lives in the full game
  const url = /^https?:/.test(location.protocol) && !/localhost|127\.0\.0\.1/.test(location.host) ? '\n' + location.origin + (S.daily ? '/?play=daily' : S.weekly ? '/world?play=weekly' : '/world') : '';
  return `${head}\n${markerFor(S.opts.vehicle)} ${G.name[S.start]} → ${G.name[S.dest]}\n${S.stops.map(sq).join('')}\n${fmt(S.total)} pts · ${fmt(S.km)} km · ${S.stops.length} stops${url}`;
}
async function shareTrip() {
  const text = shareText();
  if (window.sa_event) sa_event('shared_' + (S.daily ? 'daily' : S.weekly ? 'weekly' : 'trip'));
  try { if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({ text }); return; } } catch { return; }
  try { await navigator.clipboard.writeText(text); toast('Copied. Paste it anywhere.'); } catch { toast(text.replace(/\n/g, ' · ')); }
}

// ---- settings: one switch per kind of feel
function renderJuiceSettings() {
  const el = $('juice-settings'); if (!el) return;
  const rows = [['fx', 'Celebrations', 'Points rising from each stop, a stamp for every new country, confetti on arrival.'], ['ticker', 'Place ticker', 'The name of each place you reach glides past next to the logo.'],
    ['greet', 'Greeting', 'A hello in the bar when you come back.'], ['nudges', 'Almost-there hints', 'How close you are to the next cover, album, crown or rank.']];
  el.innerHTML = rows.map(([k, name, blurb]) => `<div class="switchrow"><div><b>${name}</b><small>${blurb}</small></div><label class="toggle"><input type="checkbox" data-juice="${k}" ${juiceOn(k) ? 'checked' : ''} aria-label="${name}"><span></span></label></div>`).join('');
  el.querySelectorAll('[data-juice]').forEach(b => b.onchange = () => { P.juice = { ...(P.juice || {}), [b.dataset.juice]: b.checked }; saveProfile(); if (S) render(); });
}
