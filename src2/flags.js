// ================= flag collection =================
// Every flag that flies over a place you can stop in: the country, its region (or breakaway area) and the city itself.
// Stopping somewhere new unlocks its flags, and the game makes a moment of it:
//   rarity    – countries common, regions uncommon, cities rarer the smaller they are (breakaway areas legendary)
//   albums    – each country is an album; 25/50/75/100% of its flags pay a bonus, continents too
//   wanted    – three bounty flags a day (near, mid, far), with a bonus for all three
//   streak    – collect a flag on consecutive days for a coin multiplier up to ×1.5
//   rank      – collector ranks, and up to +150 explorer rating, so a bigger collection lifts your passport league
const FLAG_KINDS = [{ id: 'country', name: 'Countries', one: 'Country' }, { id: 'region', name: 'Regions', one: 'Region' }, { id: 'city', name: 'Cities', one: 'City' }];
const RARITY = TUNE.flags.rarity;
const FLAG_RANKS = TUNE.flags.ranks;
const { albumSteps: ALBUM_STEPS, albumPay: ALBUM_PAY, ratingMax: FLAG_RATING_MAX, wantedBonus: WANTED_BONUS, sweepBonus: SWEEP_BONUS } = TUNE.flags;
const wantedMult = () => 3;
const flagRankOf = n => { let r = FLAG_RANKS[0]; for (const x of FLAG_RANKS) if (n >= x.at) r = x; return r; };
const flagRating = n => Math.round(FLAG_RATING_MAX * (1 - Math.exp(-n / 400)));
const dayNumber = day => Math.round(new Date(day + 'T12:00:00').getTime() / 864e5);
const localDay = (t = new Date()) => `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
const REGION_NAME = id => (REGIONS.find(r => r.id === id) || { name: { AN: 'Antarctica' }[id] || id }).name;
// the flags a place unlocks, whether or not their pictures have downloaded yet
function flagKeysFor(id) {
  const out = [], adm = admOf(id), add = key => { if (flagEntry(key)) out.push(key); };
  add('g:' + G.gid[id]);
  if (adm[1]) add('a:' + adm[1]);
  const ar = areaName(id); if (ar) add('x:' + ar);
  add('c:' + ccOf(id));
  return out;
}

// ---- catalogue: every collectable flag, where it flies, how rare it is
let flagCat = null;
function flagCatalog() {
  if (flagCat) return flagCat;
  if (!FLAGS.ready || !G) return null;
  const admByGid = new Map(), bestInAdm = new Map(), capital = new Map();
  G.admList.forEach((a, i) => { if (a[1] && a[2] && G.admCount[i]) admByGid.set(String(a[1]), i); });
  for (let i = 0; i < G.n; i++) {
    const b = bestInAdm.get(G.adm[i]); if (b == null || G.pop[i] > G.pop[b]) bestInAdm.set(G.adm[i], i);
    if (G.fc[i] === G.capital && !capital.has(G.cc[i])) capital.set(G.cc[i], i);
  }
  // where each named area flies its flag: its biggest settlement. Regions lying inside a disputed territory are disputed too.
  const areaAt = {}, admArea = new Map();
  for (let i = 0; i < G.n; i++) { const nm = areaName(i); if (!nm) continue; if (!areaAt[nm] || G.pop[i] > G.pop[areaAt[nm].at]) areaAt[nm] = { cc: ccOf(i), at: i }; if (G.area[i]) { const c = admArea.get(G.adm[i]) || admArea.set(G.adm[i], { inside: 0, name: nm }).get(G.adm[i]); c.inside++; } }
  const disputedAdm = ai => { const c = admArea.get(ai); return c && DISPUTED[c.name] && c.inside >= G.admCount[ai] * 0.6 ? c.name : null; };
  const all = [];
  for (const key of Object.keys(FLAGS.keys)) {
    const p = key[0], rest = key.slice(2);
    if (p === 'c') {
      const ci = G.ccIndex[rest]; if (ci == null || !G.placeCount[ci]) continue;
      let at = capital.get(ci); if (at == null) { const a = G.anchors.find(x => x.i === ci); at = a ? nearby(a.lat, a.lon, 200).filter(i => G.cc[i] === ci).sort((x, y) => G.pop[y] - G.pop[x])[0] : null; }
      const dis = rest === 'EH' ? 'Western Sahara' : null;
      all.push({ key, kind: 'country', cc: rest, label: ccName(rest), at, rarity: dis ? 4 : 0, disputed: dis });
    } else if (p === 'a') {
      const ai = admByGid.get(rest); if (ai == null) continue; const a = G.admList[ai];
      const dis = disputedAdm(ai);
      all.push({ key, kind: 'region', cc: a[2].split('.')[0], label: a[0], at: bestInAdm.get(ai), rarity: dis ? 4 : 1, disputed: dis });
    } else if (p === 'x') {
      const x = areaAt[rest]; if (!x) continue;
      all.push({ key, kind: 'region', cc: x.cc, label: rest, at: x.at, rarity: 4, disputed: DISPUTED[rest] ? rest : null });
    } else if (p === 'g') {
      const id = G.byGid.get(+rest); if (id == null) continue;
      const dis = G.area[id] && DISPUTED[areaName(id)] ? areaName(id) : null, pop = G.pop[id], rarity = dis ? 4 : pop >= 100000 || G.fc[id] === G.capital ? 2 : pop >= 40000 ? 3 : 4;
      all.push({ key, kind: 'city', cc: ccOf(id), label: G.name[id], pop, at: id, rarity, disputed: dis });
    }
  }
  const order = { country: 0, region: 1, city: 2 };
  all.sort((a, b) => order[a.kind] - order[b.kind] || (a.kind === 'city' ? b.pop - a.pop : a.label.localeCompare(b.label)));
  const byKey = new Map(all.map(f => [f.key, f])), byCc = new Map(), byCont = new Map();
  for (const f of all) {
    (byCc.get(f.cc) || byCc.set(f.cc, []).get(f.cc)).push(f);
    if (f.kind === 'country') { const c = G.contOf[G.ccIndex[f.cc]]; (byCont.get(c) || byCont.set(c, []).get(c)).push(f); }
  }
  return flagCat = { all, byKey, byCc, byCont };
}
const owns = key => !!P.flagsSeen[key];
function flagCounts(p = P) {
  const cat = flagCatalog(), owns = key => !!p.flagsSeen[key];
  if (!cat) return { have: Object.keys(p.flagsSeen).length, total: 0, kinds: {}, rarity: [] };
  const kinds = Object.fromEntries(FLAG_KINDS.map(k => [k.id, { have: 0, total: 0 }])), rarity = RARITY.map(() => ({ have: 0, total: 0 }));
  let have = 0;
  for (const f of cat.all) { const o = owns(f.key); kinds[f.kind].total++; rarity[f.rarity].total++; if (o) { kinds[f.kind].have++; rarity[f.rarity].have++; have++; } }
  return { have, total: cat.all.length, kinds, rarity };
}
const albumOf = (cc, p = P) => { const list = (flagCatalog() && flagCat.byCc.get(cc)) || []; return { list, have: list.filter(f => !!p.flagsSeen[f.key]).length, total: list.length }; };
const albumSteps = total => total >= 8 ? [0, 1, 2, 3] : [3];
const albumReward = (total, step) => total >= 8 ? Math.round((15 + total * 2) * ALBUM_PAY[step]) : 15 + total * 6;

// ---- daily wanted board
function wantedToday() {
  const cat = flagCatalog(); if (!cat) return null;
  const day = localDay();
  if (P.wanted && P.wanted.day === day) return P.wanted;
  let anchor = S && !S.classic ? S.cur : null;
  if (anchor == null) { const last = Object.entries(P.visits).sort((a, b) => b[1].last - a[1].last)[0]; anchor = last ? G.byGid.get(+last[0].slice(1)) : null; }
  if (anchor == null) anchor = G.byGid.get(2988507) ?? 0; // Paris
  // a bought reroll (sinks.js) seeds a new board and keeps away from the flags it replaced
  const roll = P.wantedRoll && P.wantedRoll.day === day ? P.wantedRoll : null;
  const r = rng('wanted-' + day + '-' + PLAYER_ID + (roll ? '-r' + roll.n : '')), taken = new Set(roll ? roll.avoid : []);
  const open = cat.all.filter(f => f.at != null && !owns(f.key)).map(f => ({ f, d: dist(G.lat[anchor], G.lon[anchor], G.lat[f.at], G.lon[f.at]) }));
  const pick = (lo, hi) => {
    const band = open.filter(x => x.d >= lo && x.d <= hi && !taken.has(x.f.key) && x.f.kind !== 'country').sort((a, b) => (G.pop[b.f.at] || 0) - (G.pop[a.f.at] || 0)).slice(0, 40);
    const any = band.length ? band : open.filter(x => !taken.has(x.f.key)).sort((a, b) => a.d - b.d).slice(0, 40);
    if (!any.length) return null; const x = any[Math.floor(r() * any.length)]; taken.add(x.f.key); return x.f.key;
  };
  const list = [pick(40, 450), pick(450, 1400), pick(1400, 4500)].filter(Boolean).map(key => ({ key, done: false }));
  P.wanted = { day, list, swept: false }; saveProfile();
  return P.wanted;
}
const untilMidnight = () => { const t = new Date(), m = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1); const mins = Math.round((m - t) / 60000); return `${Math.floor(mins / 60)}h ${mins % 60}m`; };

// ---- collecting
function collectFlags(id, when = Date.now()) {
  const fresh = []; if (MINI) return fresh; // the daily game has no flag collection
  for (const key of flagKeysFor(id)) if (!P.flagsSeen[key]) { P.flagsSeen[key] = when; fresh.push(key); }
  return fresh;
}
// silently mark album and continent milestones already passed, so old collections don't pay out twice
function settleMilestones() {
  const cat = flagCatalog(); if (!cat) return;
  P.flagSets = P.flagSets || {};
  for (const [cc, list] of cat.byCc) { const have = list.filter(f => owns(f.key)).length; for (const s of albumSteps(list.length)) if (have >= Math.ceil(list.length * ALBUM_STEPS[s])) P.flagSets[cc + '#' + s] = P.flagSets[cc + '#' + s] || 1; }
  for (const [c, list] of cat.byCont) { const have = list.filter(f => owns(f.key)).length; [0.5, 1].forEach((fr, s) => { if (have >= Math.ceil(list.length * fr)) P.flagSets['cont:' + c + '#' + s] = P.flagSets['cont:' + c + '#' + s] || 1; }); }
}
// places you stopped in before the collection existed (or before the flags loaded) still count, without the fanfare
function flagsBackfill() {
  if (!FLAGS.ready || !G) return;
  let added = 0;
  for (const [k, v] of Object.entries(P.visits)) { const id = G.byGid.get(+k.slice(1)); if (id != null) added += collectFlags(id, v.first || Date.now()).length; }
  if (P.flagsViewedAt == null) P.flagsViewedAt = Date.now();
  settleMilestones(); wantedToday(); saveProfile();
  if (added) { checkAchievements(); renderLeagueChip(); }
  renderFlagBadge();
}
// the reward moment: coins by rarity, streak, bounties, album and continent milestones, rank-ups
function celebrateFlags(fresh, holo = []) {
  const cat = flagCatalog(); if (!cat || !fresh.length) return;
  const flags = fresh.map(k => cat.byKey.get(k)).filter(Boolean); if (!flags.length) return;
  const c = flagCounts(), rankBefore = flagRankOf(c.have - flags.length), rankAfter = flagRankOf(c.have);
  // streak: one collecting day after another
  const day = localDay(), yesterday = localDay(new Date(Date.now() - 864e5)), st = P.flagStreak = P.flagStreak || { day: null, n: 0, best: 0 };
  let streakUp = false;
  if (st.day !== day) { st.n = st.day === yesterday ? st.n + 1 : 1; if (st.n === 1) st.start = day; st.day = day; st.best = Math.max(st.best || 0, st.n); streakUp = st.n > 1; }
  const mult = 1 + 0.1 * (Math.min(6, st.n) - 1);
  const lines = []; let coins = 0;
  for (const f of flags) coins += RARITY[f.rarity].coins;
  coins = Math.round(coins * mult);
  // wanted board
  const w = wantedToday();
  if (w) for (const b of w.list) if (!b.done && fresh.includes(b.key)) { b.done = true; const f = cat.byKey.get(b.key), pay = RARITY[f.rarity].coins * wantedMult() + WANTED_BONUS; coins += pay; lines.push({ icon: '🎯', text: `Wanted flag found: ${f.label}`, coins: pay }); }
  if (w && !w.swept && w.list.length && w.list.every(b => b.done)) { w.swept = true; coins += SWEEP_BONUS; lines.push({ icon: '🧹', text: 'Clean sweep: every wanted flag today', coins: SWEEP_BONUS }); }
  // albums
  P.flagSets = P.flagSets || {};
  const albums = [...new Set(flags.map(f => f.cc))].map(cc => {
    const a = albumOf(cc), before = a.have - flags.filter(f => f.cc === cc).length;
    for (const s of albumSteps(a.total)) {
      const need = Math.ceil(a.total * ALBUM_STEPS[s]), key = cc + '#' + s;
      if (a.have >= need && !P.flagSets[key]) { P.flagSets[key] = Date.now(); const pay = albumReward(a.total, s); coins += pay; lines.push({ icon: s === 3 ? '🏆' : '📘', text: s === 3 ? `${ccName(cc)} album complete!` : `${ccName(cc)} album ${ALBUM_STEPS[s] * 100}% full`, coins: pay, big: s === 3 }); }
    }
    return { cc, before, have: a.have, total: a.total };
  });
  // continents: every country flag
  for (const f of flags.filter(x => x.kind === 'country')) {
    const cont = G.contOf[G.ccIndex[f.cc]], list = cat.byCont.get(cont) || [], have = list.filter(x => owns(x.key)).length;
    [0.5, 1].forEach((fr, s) => { const key = 'cont:' + cont + '#' + s; if (have >= Math.ceil(list.length * fr) && !P.flagSets[key]) { P.flagSets[key] = Date.now(); const pay = s ? 400 : 100; coins += pay; lines.push({ icon: '🌍', text: `${s ? 'Every' : 'Half of the'} country flag${s ? '' : 's'} of ${REGION_NAME(cont)}`, coins: pay, big: !!s }); } });
  }
  // holo: a foil copy pays three times its rarity
  for (const key of holo) { const f = cat.byKey.get(key); if (!f) continue; const pay = RARITY[f.rarity].coins * HOLO_PAY; coins += pay; lines.push({ icon: '✨', text: `Holo ${f.label}`, coins: pay, big: true }); }
  if (streakUp) { const ms = streakMilestone(st.n); if (ms) { coins += ms.coins; lines.push(ms); } }
  if (rankAfter !== rankBefore) lines.push({ icon: '⭐', text: `New rank: ${rankAfter.name}`, big: true });
  if (streakUp) lines.push({ icon: '🔥', text: `${st.n}-day flag streak · coins ×${mult.toFixed(1)}` });
  else if (st.n === 1 && st.day === day && !P.flagStreakToldDay?.startsWith(day)) { P.flagStreakToldDay = day; lines.push({ icon: '🔥', text: typeof isGuest === 'function' && isGuest() ? 'Streak started · create an account to keep it: guest progress ends when this tab closes' : 'Streak started · collect a flag tomorrow for coins ×1.1' }); }
  P.coins += coins; renderCoins(); bumpCoins();
  P.flagsNew = (P.flagsNew || 0) + flags.length;
  saveProfile(); renderFlagBadge(); renderLeagueChip(); publishScore();
  showFlagDrop(flags, coins, albums, lines, { holo: new Set(holo) });
  if (holo.length) setTimeout(() => sfx('holo'), 350);
}

// ---- the flag drop: a card that lands over the map
let dropTimer = 0;
// the card's size is a setting: small, medium (default), large, or off (a one-line toast instead)
const POPUP_SIZES = [{ id: 'small', name: 'Small' }, { id: 'medium', name: 'Medium' }, { id: 'large', name: 'Large' }, { id: 'off', name: 'Off' }];
function showFlagDrop(flags, coins, albums, lines, o = {}) {
  const el = $('flagdrop'), best = Math.max(...flags.map(f => f.rarity)), r = RARITY[best], big = best >= 3 || lines.some(l => l.big), size = P.flagPopup || 'medium', holo = o.holo || new Set();
  if (size === 'off') {
    el.hidden = true; chime(best, big);
    toast(`${flags.length > 1 ? `${flags.length} new flags` : `New ${r.name.toLowerCase()} flag`}: ${flags.map(f => f.label).join(', ')}${coins ? ` · +${coins} coins` : ''}${lines.filter(l => l.big).map(l => ' · ' + l.text).join('')}`);
    return;
  }
  const a = albums[0];
  el.style.setProperty('--rc', r.color);
  el.className = 'flagdrop size-' + size + (big ? ' big' : '');
  el.innerHTML = `
    ${big && size !== 'small' ? `<div class="sparks" aria-hidden="true">${Array.from({ length: 18 }, (_, i) => `<i style="--a:${i * 20}deg;--d:${60 + (i * 37) % 50}px"></i>`).join('')}</div>` : ''}
    <div class="fd-top"><span>${o.title ? `✨ ${esc(o.title)}` : flags.length > 1 ? `${flags.length} new flags` : 'New flag'} · <b>${r.name}</b></span><span class="fd-coins">+<span id="fd-coins">0</span> <i></i></span></div>
    <div class="fd-flags">${flags.map((f, i) => { const src = flagSrc(f.key); return `<figure class="r${f.rarity}" style="--rc:${RARITY[f.rarity].color};--i:${i}">${f.rarity === 4 ? '<span class="shine"></span>' : ''}${holoWrap(src ? `<img src="${src}" alt="">` : `<span class="unknown">${emojiFlag(f.cc) || '?'}</span>`, holo.has(f.key))}<figcaption><em>${RARITY[f.rarity].name} · ${f.disputed ? 'Disputed · ' + esc(f.disputed) : FLAG_KINDS.find(k => k.id === f.kind).one}</em>${esc(f.label)}</figcaption></figure>`; }).join('')}</div>
    ${a ? `<div class="fd-album"><div class="fd-albumhead"><span>${countryFlag(a.cc)}${esc(ccName(a.cc))} album</span><span>${a.have} / ${a.total}</span></div><div class="levelbar"><div id="fd-bar" style="width:${a.before / a.total * 100}%;background:var(--rc)"></div></div></div>` : ''}
    ${lines.length ? `<ul class="fd-lines">${lines.map(l => `<li class="${l.big ? 'big' : ''}"><span>${l.icon} ${esc(l.text)}</span>${l.coins ? `<b>+${l.coins}</b>` : ''}</li>`).join('')}</ul>` : ''}`;
  el.hidden = false;
  el.onclick = () => { el.hidden = true; };
  requestAnimationFrame(() => { const bar = $('fd-bar'); if (bar && a) bar.style.width = (a.have / a.total * 100) + '%'; });
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches, t0 = performance.now(), span = $('fd-coins');
  const tick = now => { const k = reduce ? 1 : Math.min(1, (now - t0) / 900); span.textContent = Math.round(coins * (1 - Math.pow(1 - k, 3))); if (k < 1 && !el.hidden) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  chime(best, big);
  clearTimeout(dropTimer); dropTimer = setTimeout(() => { el.hidden = true; }, (big ? 6500 : 4200) * (size === 'small' ? 0.7 : 1));
}
function bumpCoins() { const c = $('coin-count'); c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); }
let audio = null;
function chime(rarity, big, packId) {
  if (P.sound === false && !packId) return;
  const pack = SOUND_PACKS[packId || P.equip.sound] || SOUND_PACKS.bells;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const notes = [1, 1.26, 1.498, 2, 2.52, 3].map(r => r * pack.base).slice(0, 3 + Math.min(3, rarity) + (big ? 1 : 0));
    notes.forEach((f, i) => {
      const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime + i * pack.gap;
      o.type = pack.type; o.frequency.value = f; o.connect(g); g.connect(audio.destination);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pack.gain || 0.09, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + pack.decay);
      o.start(t); o.stop(t + pack.decay + 0.05);
    });
  } catch { /* no sound in this browser */ }
}
function renderFlagBadge() {
  const b = $('pp-count'); if (!b) return;
  const n = P.flagsNew || 0; b.hidden = !n; b.textContent = n > 99 ? '99+' : String(n);
}

// ---- passport summary and the Flags tab
function flagSummaryHtml(withButton, p = P) {
  const c = flagCounts(p), rank = flagRankOf(c.have), next = FLAG_RANKS[FLAG_RANKS.indexOf(rank) + 1], st = p.flagStreak || { n: 0 }, view = p !== P;
  const gap = st.day ? dayNumber(localDay()) - dayNumber(st.day) : Infinity, live = gap <= 1, streak = live ? st.n : 0, atRisk = live && gap >= 1;
  const bar = (have, total, color = 'var(--sign)') => `<div class="levelbar"><div style="width:${total ? Math.max(have ? 1.5 : 0, have / total * 100) : 0}%;background:${color}"></div></div>`;
  return `<div style="display:grid;gap:10px">
    <div class="flaghead"><span class="big">${fmt(c.have)}</span><b style="font:800 22px/1 var(--display);text-transform:uppercase">🚩 ${rank.name}</b><span class="of">of ${c.total ? fmt(c.total) : '…'} flags · +${flagRating(c.have)} explorer rating${holoCount(p) ? ` · ✨ ${fmt(holoCount(p))} holo` : ''}</span></div>
    <div class="chipline">${view ? (streak ? `<span class="chip good">🔥 ${streak}-day streak</span>` : '') : streak ? `<span class="chip ${atRisk ? 'warn' : 'good'}">🔥 ${streak}-day streak${atRisk ? ' · collect a flag today to keep it' : streak === 1 ? ' · come back tomorrow for coins ×1.1' : ` · coins ×${(1 + 0.1 * (Math.min(6, streak) - 1)).toFixed(1)}`}</span>` : '<span class="chip">🔥 Collect a flag today to start a streak</span>'}${st.best > 1 ? `<span class="chip">Best streak ${st.best} days</span>` : ''}</div>
    ${next ? `<div>${bar(c.have - rank.at, next.at - rank.at)}<div class="hint" style="margin-top:4px">${fmt(next.at - c.have)} more for ${next.name}</div></div>` : ''}
    ${c.total ? `<div class="flagbars">${FLAG_KINDS.map(k => `<div class="flagbar"><span>${k.name}</span>${bar(c.kinds[k.id].have, c.kinds[k.id].total)}<span>${fmt(c.kinds[k.id].have)} / ${fmt(c.kinds[k.id].total)}</span></div>`).join('')}</div>
      <div class="raritychips">${RARITY.map((r, i) => `<span style="--rc:${r.color}"><i></i>${r.name} <b>${fmt(c.rarity[i].have)}</b>/${fmt(c.rarity[i].total)}</span>`).join('')}</div>` : ''}
    ${withButton ? '<div class="tools"><button class="btn small" type="button" data-goto-tab="flags">Open the flag collection</button></div>' : ''}
  </div>`;
}
function wantedHtml(compact) {
  const w = wantedToday(); if (!w || !w.list.length) return '';
  const here = S && !S.classic && !S.done ? S.cur : null;
  const rows = w.list.map(b => {
    const f = flagCat.byKey.get(b.key); if (!f) return '';
    const src = flagSrc(f.key), where = here != null && f.at != null ? `${fmt(dist(G.lat[here], G.lon[here], G.lat[f.at], G.lon[f.at]))} km ${compass(bearing(G.lat[here], G.lon[here], G.lat[f.at], G.lon[f.at]))}` : esc(ccName(f.cc));
    const hint = f.kind === 'region' ? `stop anywhere in ${esc(f.label)}` : f.kind === 'city' ? `stop in ${esc(f.label)}` : `stop anywhere in ${esc(f.label)}`;
    return `<li class="${b.done ? 'done' : ''}" style="--rc:${RARITY[f.rarity].color}">${src ? `<img src="${src}" alt="">` : `<span class="unknown">?</span>`}<div><b>${esc(f.label)}</b><small>${RARITY[f.rarity].name} ${FLAG_KINDS.find(k => k.id === f.kind).one.toLowerCase()} · ${b.done ? 'found' : `${hint} · ${where}`}</small></div><span class="reward">${b.done ? '✓' : '+' + (RARITY[f.rarity].coins * wantedMult() + WANTED_BONUS)}</span></li>`;
  }).join('');
  const reroll = !w.swept && w.list.some(b => !b.done) ? `<button type="button" class="btn small reroll" data-reroll-wanted title="Swap the flags you haven't found for new ones">🎲 New board · ${rerollPrice()}</button>` : '';
  return `<div class="wanted${compact ? ' compact' : ''}"><div class="wantedhead"><span class="label">🎯 Wanted today</span><span class="hint">${w.swept ? 'Board cleared' : `All three: +${SWEEP_BONUS}`} · new board in ${untilMidnight()}</span>${reroll}</div><ol>${rows}</ol></div>`;
}
function renderWanted() {
  const el = $('wanted'); if (!el) return;
  if (!S || S.classic || MINI || !flagCatalog()) { el.innerHTML = ''; el.hidden = true; return; }
  const w = wantedToday(); el.hidden = !w || !w.list.length || w.swept; el.innerHTML = el.hidden ? '' : wantedHtml(true);
}
const FL = { kind: 'country', cc: '', seenBefore: 0 };
function renderFlagTab(body, p = P) {
  const view = p !== P, owns = key => !!p.flagsSeen[key];
  const cat = flagCatalog();
  if (!cat) { body.innerHTML = `<p class="hint" style="margin:0">${FLAGS.failed ? 'The flags could not be loaded in this browser.' : 'Unpacking the flag catalogue…'}</p>`; return; }
  const haveByCc = new Map(); for (const f of cat.all) if (owns(f.key)) haveByCc.set(f.cc, (haveByCc.get(f.cc) || 0) + 1);
  const ccs = [...cat.byCc.keys()].sort((a, b) => (haveByCc.get(b) || 0) - (haveByCc.get(a) || 0) || ccName(a).localeCompare(ccName(b)));
  // albums closest to their next payout
  const nextUp = [...cat.byCc.entries()].map(([cc, list]) => {
    const have = haveByCc.get(cc) || 0, total = list.length, step = albumSteps(total).find(s => have < Math.ceil(total * ALBUM_STEPS[s]));
    return step == null ? null : { cc, have, total, need: Math.ceil(total * ALBUM_STEPS[step]), step, pay: albumReward(total, step) };
  }).filter(x => x && x.have > 0).sort((a, b) => (a.need - a.have) - (b.need - b.have)).slice(0, 4);
  const conts = [...cat.byCont.entries()].filter(([c]) => c !== 'AN').map(([c, list]) => ({ c, have: list.filter(f => owns(f.key)).length, total: list.length })).sort((a, b) => b.have / b.total - a.have / a.total);
  let list = cat.all.filter(f => (!FL.kind || f.kind === FL.kind) && (!FL.cc || f.cc === FL.cc));
  const onlyOwned = !FL.cc && FL.kind !== 'country';
  if (onlyOwned) list = list.filter(f => owns(f.key)).sort((a, b) => p.flagsSeen[b.key] - p.flagsSeen[a.key]);
  else if (FL.cc) list.sort((a, b) => owns(b.key) - owns(a.key));
  const complete = new Set([...cat.byCc.entries()].filter(([cc, l]) => (haveByCc.get(cc) || 0) === l.length).map(([cc]) => cc));
  const shown = list.slice(0, 300), ownedShown = list.filter(f => owns(f.key)).length;
  const tile = f => {
    const src = flagSrc(f.key), have = owns(f.key), fresh = !view && have && p.flagsSeen[f.key] > FL.seenBefore, r = RARITY[f.rarity];
    return `<button type="button" class="flagtile ${have ? '' : 'locked'} r${f.rarity} ${have && complete.has(f.cc) ? 'gold' : ''}" style="--rc:${r.color}" data-fcc="${f.cc}" title="${esc(f.label)} · ${r.name}${have ? ' · collected ' + new Date(p.flagsSeen[f.key]).toLocaleDateString() : ' · not collected yet'}">${fresh ? '<span class="ribbon">New</span>' : ''}${have && f.rarity === 4 ? '<span class="shine"></span>' : ''}${holoWrap(src ? `<img src="${src}" alt="" loading="lazy">` : '<span class="unknown">?</span>', have && isHolo(f.key, p))}<em><i></i>${have ? r.name : 'Not yet'}</em><span>${esc(f.label)}</span></button>`;
  };
  const album = FL.cc ? albumOf(FL.cc, p) : null;
  body.innerHTML = `${flagSummaryHtml(false, p)}
    ${view ? '' : wantedHtml(false)}
    ${nextUp.length ? `<div><div class="label" style="margin-bottom:6px">Albums close to a bonus</div><ul class="albums">${nextUp.map(x => `<li><button type="button" data-fcc="${x.cc}">${countryFlag(x.cc)}${esc(ccName(x.cc))}</button><div class="levelbar"><div style="width:${x.have / x.total * 100}%;background:var(--sign)"></div></div><span>${x.need - x.have} more · <b>+${x.pay}</b></span></li>`).join('')}</ul></div>` : ''}
    <div><div class="label" style="margin-bottom:6px">Continent sets · every country flag</div><ul class="albums">${conts.map(x => `<li><span>${esc(REGION_NAME(x.c))}</span><div class="levelbar"><div style="width:${x.have / x.total * 100}%;background:var(--fuel)"></div></div><span>${x.have}/${x.total} · <b>+${x.have >= Math.ceil(x.total / 2) ? 400 : 100}</b></span></li>`).join('')}</ul></div>
    <div style="display:grid;gap:8px">
      <select class="field" id="fl-cc" aria-label="Country"><option value="">All countries</option>${ccs.map(cc => { const a = cat.byCc.get(cc).length, h = haveByCc.get(cc) || 0; return `<option value="${cc}" ${FL.cc === cc ? 'selected' : ''}>${h === a ? '★ ' : ''}${esc(ccName(cc))} · ${h}/${a}</option>`; }).join('')}</select>
      <div class="seg" role="group" aria-label="Kind of flag"><button type="button" data-fkind="" aria-pressed="${!FL.kind}">All</button>${FLAG_KINDS.map(k => `<button type="button" data-fkind="${k.id}" aria-pressed="${FL.kind === k.id}">${k.name}</button>`).join('')}</div>
      ${album ? `<div class="albumcard"><div class="fd-albumhead"><span>${countryFlag(FL.cc)}<b>${esc(ccName(FL.cc))} album</b></span><span>${album.have} / ${album.total}</span></div><div class="levelbar"><div style="width:${album.have / album.total * 100}%;background:var(--sign)"></div></div><div class="albumsteps">${albumSteps(album.total).map(s => { const need = Math.ceil(album.total * ALBUM_STEPS[s]), got = (p.flagSets || {})[FL.cc + '#' + s]; return `<span class="${got ? 'got' : ''}">${ALBUM_STEPS[s] * 100}% ${got ? '✓' : `· ${need} flags · +${albumReward(album.total, s)}`}</span>`; }).join('')}</div></div>` : ''}
      <p class="hint" style="margin:0">${FL.cc ? `Greyed flags are still out there. Stop in those places to collect them.`
        : onlyOwned ? `${view ? 'Their' : 'Your'} ${fmt(ownedShown)} ${FL.kind ? FLAG_KINDS.find(k => k.id === FL.kind).name.toLowerCase() : 'flags'}, newest first. Pick a country to see the ones still to find.`
        : `${ownedShown} of ${list.length} country flags. Tap one to open that country's album.`}</p>
    </div>
    ${shown.length ? `<div class="flaggrid">${shown.map(tile).join('')}</div>${list.length > shown.length ? `<p class="hint" style="margin:0">Showing the first 300 of ${fmt(list.length)}. Pick a country to narrow it down.</p>` : ''}`
      : '<p class="hint" style="margin:0">Nothing collected here yet. Every new place you stop in unlocks its city, region and country flags.</p>'}`;
  const pickCc = cc => { FL.cc = cc; if (cc) { FL.kind = ''; const ci = G.ccIndex[cc]; if (ci != null) { ppSel = ci; zoomToCountry(ppMap, ci); } } renderPassport(); ppMap.draw(); };
  $('fl-cc').onchange = e => pickCc(e.target.value);
  body.querySelectorAll('[data-fkind]').forEach(b => b.onclick = () => { FL.kind = b.dataset.fkind; renderPassport(); });
  body.querySelectorAll('[data-fcc]').forEach(b => b.onclick = () => { if (FL.cc !== b.dataset.fcc) pickCc(b.dataset.fcc); });
}
// opening the collection clears the "new" count; ribbons stay on this visit
function openedFlagTab() { FL.seenBefore = P.flagsViewedAt || 0; P.flagsViewedAt = Date.now(); P.flagsNew = 0; saveProfile(); renderFlagBadge(); }
// redraw as flag pictures arrive, at most a few times a second
let flagRedraw = 0;
function flagsArrived() { clearTimeout(flagRedraw); flagRedraw = setTimeout(() => { if ($('dlg-passport').open && (ppTab === 'flags' || ppTab === 'stats')) renderPassport(); if (S && !S.classic) { renderWanted(); renderDeck(); } }, 250); }
// wanted flags on the trip map: a pennant on each place still to find
function drawWantedPins(m, ctx, pal) {
  if (!S || S.classic || MINI || !flagCat || !P.wanted || P.wanted.day !== localDay()) return;
  for (const b of P.wanted.list) {
    if (b.done) continue; const f = flagCat.byKey.get(b.key); if (!f || f.at == null) continue;
    const [x, y] = m.px(G.lon[f.at], G.lat[f.at]); if (x < -20 || y < -30 || x > m.W + 20 || y > m.H + 20) continue;
    ctx.strokeStyle = pal.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 22); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y - 22); ctx.lineTo(x + 16, y - 16); ctx.lineTo(x, y - 10); ctx.closePath(); ctx.fillStyle = RARITY[f.rarity].color; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fillStyle = pal.ink; ctx.fill();
    m.label('Wanted: ' + f.label, x + 20, y - 16, { size: 11, weight: 700, color: RARITY[f.rarity].color });
  }
}
