// ================= identity: expeditions, titles, showcase and passport comparison =================
// All of this reads a passport (yours, or another player's through pp()), so it works in both builds. Only the
// website can open someone else's passport, so comparison and the public side of it light up there.

// ---- recent expeditions: a short feed of what a player has been up to, shown on their public passport
const FEED_MAX = 30;
// mastery levels worth announcing: Local (the country's cover), Native and Cartographer
const FEED_LEVELS = [6, 8, 10];
function feedAdd(e) {
  if (!P.feed) feedBackfill();
  if (e.k === 'ach' && P.feed.some(x => x.k === 'ach' && x.id === e.id)) return;
  const now = Date.now(), last = P.feed[0];
  // a trip that crosses five borders stamps five pages: one line says it
  if (e.k === 'stamp' && last && last.k === 'stamp' && now - last.t < 6 * 3600e3 && last.ccs.split(' ').length < 20) { if (!last.ccs.split(' ').includes(e.cc)) last.ccs += ' ' + e.cc; last.t = now; }
  else P.feed.unshift(e.k === 'stamp' ? { t: now, k: 'stamp', ccs: e.cc } : { t: now, ...e });
  P.feed = P.feed.slice(0, FEED_MAX); saveProfile();
}
// a passport from before the feed starts with what its save already knows: finished trips, achievements, stamps
function feedBackfill() {
  const out = [];
  for (const h of (P.history || []).slice(0, 12)) out.push({ t: h.t, k: 'trip', dest: h.dest, veh: h.vehicle, len: h.length, total: h.total });
  for (const [id, t] of Object.entries(P.achievements || {})) if (typeof t === 'number') out.push({ t, k: 'ach', id });
  for (const [key, s] of Object.entries(P.stamps || {})) if (!key.startsWith('area:') && s && s.t) out.push({ t: s.t, k: 'stamp', ccs: key });
  P.feed = out.sort((a, b) => b.t - a.t).slice(0, FEED_MAX);
}
function feedTrip() {
  if (!S || S.classic || S.gaveUp) return;
  const countries = new Set([S.start, ...S.stops.map(s => s.id)].map(i => G.cc[i])).size;
  // flawless: no roadside help, no scouting, no flights, nothing taken off the score
  const flawless = !S.penalties && !S.helps && !(S.scouts || []).length && !S.flights && S.stops.length >= 3;
  feedAdd({ k: 'trip', dest: G.gid[S.dest], veh: S.opts.vehicle, len: S.opts.length, total: S.total, reg: S.voyage ? 'the Far-Flung Isles' : regionLabel(regionsOf(S.opts), skipOf(S.opts)),
    flawless, countries, kind: S.race ? 'race' : S.weekly ? 'weekly' : S.daily ? 'daily' : '' });
}
// called after anything that can teach you places: announces a country crossing Local, Native or Cartographer
function feedMastery() {
  if (!G) return;
  const k = countryKnowledge(), lv = {}; k.forEach((n, i) => { const l = masteryLevel(n); if (l >= FEED_LEVELS[0]) lv[G.countries[i][0]] = l; });
  const before = P.feedLv;
  P.feedLv = lv;
  if (!before) { saveProfile(); return; }
  for (const [cc, l] of Object.entries(lv)) { const top = FEED_LEVELS.filter(x => x <= l && x > (before[cc] || 0)).pop(); if (top) feedAdd({ k: 'master', cc, lv: top }); }
  saveProfile();
}
const feedAgo = t => { const m = Math.round((Date.now() - t) / 60000); return m < 2 ? 'just now' : m < 60 ? `${m} min ago` : m < 36 * 60 ? `${Math.round(m / 60)} h ago` : m < 14 * 1440 ? `${Math.round(m / 1440)} days ago` : new Date(t).toLocaleDateString(); };
const placeByGid = g => { const i = g == null ? null : G.byGid.get(g); return i == null ? null : i; };
function feedLine(e) {
  const veh = VEHICLES[e.veh] || VEHICLES.car, lenName = e.len ? lengthOf(e.len).name.toLowerCase() : '';
  const dest = placeByGid(e.dest), destHtml = dest != null ? `${placeFlag(dest)}<b>${esc(G.name[dest])}</b>` : 'the destination';
  const cn = cc => `${countryFlag(cc)}<b>${esc(ccName(cc))}</b>`;
  switch (e.k) {
    case 'trip': {
      const how = { daily: "today's daily trip", weekly: "the weekly challenge", race: 'a race' }[e.kind];
      if (e.flawless) return ['✨', `Completed a flawless ${veh.name.toLowerCase()} trip${e.reg ? ` through ${esc(e.reg)}` : ''} to ${destHtml}`, `${fmt(e.total)} pts${e.countries > 1 ? ` · ${e.countries} countries` : ''}${how ? ` · ${how}` : ''}`];
      return ['🏁', `Finished ${how ? how + ', ' : `a ${lenName} ${veh.name.toLowerCase()} trip `}to ${destHtml}`, `${fmt(e.total)} pts${e.countries > 1 ? ` · ${e.countries} countries` : ''}`];
    }
    case 'master': return [e.lv >= 10 ? '🗺️' : e.lv >= 8 ? '🎓' : '📘', e.lv >= 10 ? `Became a Cartographer of ${cn(e.cc)}` : e.lv >= 8 ? `Reached Native in ${cn(e.cc)}` : `Mastered ${cn(e.cc)}`, e.lv === 6 ? `Local mastery · its passport cover` : `${MASTERY[e.lv].name} mastery`];
    case 'crown': return ['👑', `Took the crown of ${cn(e.cc)}`, 'Nobody knows more of its places'];
    case 'ach': { const a = ACHIEVEMENTS.find(x => x.id === e.id); return a ? ['🏆', `Unlocked ${a.icon} <b>${esc(a.name)}</b>`, esc(typeof a.desc === 'function' ? a.desc() : a.desc)] : null; }
    case 'race': return [e.place === 1 ? '🥇' : e.place === 2 ? '🥈' : e.place === 3 ? '🥉' : '🏁', e.place === 1 ? `Won a race against ${e.of - 1} ${e.of === 2 ? 'rival' : 'rivals'}` : e.place ? `Came ${ordinalOf(e.place)} of ${e.of} in a race` : `Raced ${e.of - 1} ${e.of === 2 ? 'rival' : 'rivals'}`, esc({ time: 'Fastest arrival', points: 'Most points', distance: 'Shortest route', stops: 'Fewest stops' }[e.mode] || '')];
    case 'bounty': return ['🎯', `Claimed a ${fmt(e.reward)}-coin bounty${dest != null ? ` on the way to ${destHtml}` : ''}`, 'Beat the score someone put up'];
    case 'stakes': return [e.won ? '💰' : '🎲', e.won ? `Won ${fmt(e.wager * 2)} coins on a high-stakes run` : `Lost ${fmt(e.wager)} coins on a high-stakes run`, e.won ? 'Ten seconds a turn, no wrong turns' : 'The clock or a wrong turn got them'];
    case 'stamp': { const list = String(e.ccs || '').split(' ').filter(cc => G.ccIndex[cc] != null); if (!list.length) return null; return ['🛂', list.length === 1 ? `First stamp from ${cn(list[0])}` : `New stamps from ${list.slice(0, 4).map(cn).join(', ')}${list.length > 4 ? ` and ${list.length - 4} more` : ''}`, `${list.length === 1 ? 'A new country' : `${list.length} new countries`} in the passport`]; }
    default: return null;
  }
}
const ordinalOf = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
function feedHtml(feed, max = FEED_MAX) {
  const lines = (feed || []).map(e => ({ e, l: feedLine(e) })).filter(x => x.l).slice(0, max);
  if (!lines.length) return '';
  return `<ol class="feed">${lines.map(({ e, l: [icon, text, sub] }) => `<li class="${e.flawless || e.k === 'crown' || (e.k === 'race' && e.place === 1) ? 'hl' : ''}"><span class="ficon" aria-hidden="true">${icon}</span><div><span>${text}</span><small>${sub ? sub + ' · ' : ''}${feedAgo(e.t)}</small></div></li>`).join('')}</ol>`;
}
function renderFeedTab(body, p) {
  const view = p !== P;
  if (!view && !P.feed) feedBackfill();
  const html = feedHtml(p.feed);
  body.innerHTML = `<p class="hint" style="margin:0">${view ? `What ${esc(PV.other.label)} has been up to lately.` : 'Your latest highlights. Other players see these on your passport.'}</p>
    ${html || `<p class="hint">${view ? 'Nothing here yet.' : 'Finish a trip, master a country or win a race and it shows up here.'}</p>`}`;
}

// ---- titles: earned by what you've done, worn on the passport cover under your name
const DEMONYMS = { GE: 'Georgian', AM: 'Armenian', AZ: 'Azerbaijani', TR: 'Turkish', RU: 'Russian', UA: 'Ukrainian', BY: 'Belarusian', PL: 'Polish', DE: 'German', FR: 'French', IT: 'Italian', ES: 'Spanish', PT: 'Portuguese', GB: 'British',
  IE: 'Irish', NL: 'Dutch', BE: 'Belgian', LU: 'Luxembourgish', CH: 'Swiss', AT: 'Austrian', CZ: 'Czech', SK: 'Slovak', HU: 'Hungarian', RO: 'Romanian', BG: 'Bulgarian', GR: 'Greek', CY: 'Cypriot', MT: 'Maltese', SI: 'Slovenian',
  HR: 'Croatian', BA: 'Bosnian', RS: 'Serbian', ME: 'Montenegrin', MK: 'Macedonian', AL: 'Albanian', XK: 'Kosovar', MD: 'Moldovan', LT: 'Lithuanian', LV: 'Latvian', EE: 'Estonian', FI: 'Finnish', SE: 'Swedish', NO: 'Norwegian',
  DK: 'Danish', IS: 'Icelandic', US: 'American', CA: 'Canadian', MX: 'Mexican', BR: 'Brazilian', AR: 'Argentine', CL: 'Chilean', PE: 'Peruvian', CO: 'Colombian', VE: 'Venezuelan', EC: 'Ecuadorian', BO: 'Bolivian', UY: 'Uruguayan',
  PY: 'Paraguayan', CU: 'Cuban', JP: 'Japanese', CN: 'Chinese', KR: 'Korean', IN: 'Indian', PK: 'Pakistani', BD: 'Bangladeshi', NP: 'Nepali', LK: 'Sri Lankan', TH: 'Thai', VN: 'Vietnamese', ID: 'Indonesian', MY: 'Malaysian',
  PH: 'Filipino', MN: 'Mongolian', KZ: 'Kazakh', UZ: 'Uzbek', KG: 'Kyrgyz', TJ: 'Tajik', TM: 'Turkmen', IR: 'Iranian', IQ: 'Iraqi', SY: 'Syrian', LB: 'Lebanese', IL: 'Israeli', JO: 'Jordanian', SA: 'Saudi', AE: 'Emirati',
  EG: 'Egyptian', MA: 'Moroccan', DZ: 'Algerian', TN: 'Tunisian', LY: 'Libyan', ET: 'Ethiopian', KE: 'Kenyan', TZ: 'Tanzanian', NG: 'Nigerian', GH: 'Ghanaian', ZA: 'South African', AU: 'Australian', NZ: 'New Zealand' };
const TITLES = [
  { id: 'traveller', name: 'Traveller', desc: 'Everyone starts here.', ok: () => true },
  { id: 'border-runner', name: 'Border Runner', desc: 'Stop in 10 countries.', ok: st => st.countries >= 10 },
  { id: 'globetrotter', name: 'Globetrotter', desc: 'Stop on 5 continents.', ok: st => st.continents >= 5 },
  { id: 'world-citizen', name: 'World Citizen', desc: 'Stop in 50 countries.', ok: st => st.countries >= 50 },
  { id: 'road-warrior', name: 'Road Warrior', desc: 'Travel 10,000 km.', ok: st => st.km >= 10000 },
  { id: 'circumnavigator', name: 'Circumnavigator', desc: 'Travel 40,075 km.', ok: st => st.km >= 40075 },
  { id: 'village-hopper', name: 'Village Hopper', desc: 'Stop in 25 villages.', ok: st => st.villages >= 25 },
  { id: 'capital-collector', name: 'Capital Collector', desc: 'Stop in 20 capitals.', ok: st => st.capitals >= 20 },
  { id: 'flag-hunter', name: 'Flag Hunter', desc: 'Collect 100 flags.', ok: st => st.flags >= 100 },
  { id: 'vexillologist', name: 'Vexillologist', desc: 'Collect 500 flags.', ok: st => st.flags >= 500 },
  { id: 'scholar', name: 'Scholar', desc: 'Get 100 study answers right.', ok: st => st.correct >= 100 },
  { id: 'long-hauler', name: 'Long Hauler', desc: 'Finish 5 Epic trips.', ok: st => (st.feats['len-epic'] || 0) >= 5 },
  { id: 'purist', name: 'Purist', desc: 'Finish a trip with no planes, trains or hints.', ok: st => (st.feats.purist || 0) >= 1 },
  { id: 'castaway', name: 'Castaway', desc: 'Reach 10 Far-Flung Isles outposts.', ok: st => (st.feats.isles || []).length >= 10 },
  { id: 'speed-demon', name: 'Speed Demon', desc: 'Win 3 Fastest-arrival races.', ok: st => (st.feats.raceTimeWins || 0) >= 3 },
  { id: 'race-champion', name: 'Race Champion', desc: 'Win 10 races.', ok: st => (st.feats.raceWins || 0) >= 10 },
  { id: 'crowned', name: 'Crowned Head', desc: 'Hold the crown of a country.', ok: (st, x) => x.crowns > 0 },
  { id: 'diplomat', name: 'Diplomat', desc: 'Reach the Diplomatic passport league.', ok: (st, x) => x.rating >= 550 },
];
const SPECIALIST_LV = 8; // Native
const titleName = id => {
  if (!id) return '';
  const m = /^spec:([A-Z]{2})$/.exec(id); if (m) return `${DEMONYMS[m[1]] || ccName(m[1])} Specialist`;
  const t = TITLES.find(x => x.id === id); return t ? t.name : '';
};
// every title this passport has earned, specialists (Native mastery in a country) after the rest
function titlesEarned(p = P) {
  const st = computeStats(p), k = countryKnowledge(p), x = { rating: explorerRating(p).total, crowns: HOOKS.crownsOf && CLOUD ? HOOKS.crownsOf(p === P ? CLOUD.user.name : PV.other.name).length : 0 };
  const out = TITLES.filter(t => t.ok(st, x)).map(t => ({ id: t.id, name: t.name, desc: t.desc }));
  k.forEach((n, i) => { if (masteryLevel(n) >= SPECIALIST_LV) { const cc = G.countries[i][0]; out.push({ id: 'spec:' + cc, name: titleName('spec:' + cc), desc: `Native mastery of ${ccName(cc)}.` }); } });
  return out;
}
// your title only counts while you still hold it (a lost crown takes Crowned Head with it)
const myTitle = () => P.title && titlesEarned().some(t => t.id === P.title) ? P.title : null;

// ---- showcase: up to three pinned items on top of the passport cover
const SHOWCASE_MAX = 3;
function showcaseItem(ref, p, owner) {
  const [kind, ...rest] = ref.split(':'), key = rest.join(':');
  if (kind === 'ach') { const a = ACHIEVEMENTS.find(x => x.id === key); if (!a || !(p.achievements || {})[key]) return null; return { ref, cls: 'ach', html: `<span>${a.icon}</span>`, label: a.name, sub: 'Achievement' }; }
  if (kind === 'flag') {
    if (!(p.flagsSeen || {})[key]) return null;
    const cat = flagCatalog(), f = cat && cat.byKey.get(key), src = flagSrc(key), r = f ? RARITY[f.rarity] : RARITY[0], holo = isHolo(key, p);
    return { ref, cls: 'flag', style: `--rc:${r.color}`, html: src ? `<img src="${src}" alt="">` : `<span>${f ? emojiFlag(f.cc) : '🏳️'}</span>`, label: f ? f.label : 'Flag', sub: `${holo ? 'Holo · ' : ''}${r.name} flag`, holo };
  }
  if (kind === 'stamp') { const s = (p.stamps || {})[key]; if (!s) return null; return { ref, cls: 'stamp', html: stampSvg(key, s, p), label: key.startsWith('area:') ? key.slice(5) : ccName(key), sub: s.kind === 'visa' ? 'Visa' : 'Entry stamp' }; }
  if (kind === 'cover') {
    if (countryKnowledge(p)[G.ccIndex[key]] < COVER_UNLOCK) return null;
    const c = COVERS.data && COVERS.data.countries[key], col = coverColour(key) || '#1B2A44';
    return { ref, cls: 'cover', style: `--cv:${col}`, html: '<i></i>', label: ccName(key), sub: 'Country cover' };
  }
  if (kind === 'crown') {
    if (!HOOKS.crownsOf || !HOOKS.crownsOf(owner).includes(key)) return null;
    return { ref, cls: 'crown', html: `<span>👑</span>${countryFlag(key)}`, label: ccName(key), sub: 'Crown' };
  }
  return null;
}
const showcaseOf = (p, owner) => (p.showcase || []).slice(0, SHOWCASE_MAX).map(ref => showcaseItem(ref, p, owner)).filter(Boolean);
const showcaseBadge = it => `<span class="scb ${it.cls}${it.holo ? ' holo' : ''}" ${it.style ? `style="${it.style}"` : ''} title="${esc(it.label)} · ${esc(it.sub)}">${it.html}</span>`;
// the cover with the showcase pinned across its top edge
function coverWithShowcase(coverHtml, items) {
  return `<div class="coverwrap">${coverHtml}${items.length ? `<div class="showcase" aria-label="Showcase">${items.map(showcaseBadge).join('')}</div>` : ''}</div>`;
}
function showcaseListHtml(items) {
  return items.length ? `<ul class="showlist">${items.map(it => `<li>${showcaseBadge(it)}<span><b>${esc(it.label)}</b><small>${esc(it.sub)}</small></span></li>`).join('')}</ul>` : '';
}
// everything that could go in the showcase, best first
function showcaseCandidates() {
  const groups = [];
  const ach = ACHIEVEMENTS.filter(a => P.achievements[a.id]).sort((a, b) => b.coins - a.coins).map(a => 'ach:' + a.id);
  const cat = flagCatalog(), flags = Object.keys(P.flagsSeen).map(k => ({ k, f: cat && cat.byKey.get(k) })).filter(x => x.f)
    .sort((a, b) => (isHolo(b.k) - isHolo(a.k)) || b.f.rarity - a.f.rarity || P.flagsSeen[b.k] - P.flagsSeen[a.k]).slice(0, 36).map(x => 'flag:' + x.k);
  const stamps = Object.entries(P.stamps || {}).sort((a, b) => b[1].t - a[1].t).slice(0, 36).map(([k]) => 'stamp:' + k);
  const k = countryKnowledge(), covers = G.countries.map((c, i) => [c[0], k[i]]).filter(([cc, n]) => n >= COVER_UNLOCK && COVERS.data && COVERS.data.countries[cc]).sort((a, b) => b[1] - a[1]).map(([cc]) => 'cover:' + cc);
  const crowns = HOOKS.crownsOf && CLOUD ? HOOKS.crownsOf(CLOUD.user.name).map(cc => 'crown:' + cc) : [];
  if (crowns.length) groups.push(['Crowns', crowns]);
  groups.push(['Achievements', ach], ['Rarest flags', flags], ['Country covers', covers], ['Stamps and visas', stamps]);
  return groups.filter(([, list]) => list.length);
}
let showcaseEditing = false;
// Pins that can't be shown any more (a crown someone took, a flag or cover no longer held) are dropped, so they
// don't fill the showcase invisibly. Current pins are listed first, so any of them can be unpinned even when newer
// flags push it out of the picker's lists.
function livePins() {
  // crowns come from the server a moment after start; until they have, a crown pin is kept as it is
  const owner = CLOUD && CLOUD.user.name, cur = P.showcase || [], waiting = HOOKS.crownsOf && !(HOOKS.crownsReady && HOOKS.crownsReady());
  const live = cur.filter(ref => (waiting && ref.startsWith('crown:')) || showcaseItem(ref, P, owner));
  if (live.length !== cur.length) { P.showcase = live; saveProfile(); }
  return live;
}
function renderShowcaseEditor(el) {
  if (!showcaseEditing) { el.innerHTML = ''; return; }
  const pick = livePins();
  const groups = showcaseCandidates().map(([name, list]) => [name, list.filter(ref => !pick.includes(ref))]).filter(([, list]) => list.length);
  if (pick.length) groups.unshift(['Pinned now · tap to unpin', pick]);
  el.innerHTML = `<div class="sceditor"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><div class="label">Pick up to ${SHOWCASE_MAX} · ${pick.length} pinned</div><button class="btn small go" type="button" id="sc-done">Done</button></div>
    ${groups.map(([name, list]) => `<div><div class="label" style="margin:10px 0 6px">${name}</div><div class="scpick">${list.map(ref => { const it = showcaseItem(ref, P, CLOUD && CLOUD.user.name); return it ? `<button type="button" data-sc="${esc(ref)}" aria-pressed="${pick.includes(ref)}" title="${esc(it.label)} · ${esc(it.sub)}">${showcaseBadge(it)}<span>${esc(it.label)}</span></button>` : ''; }).join('')}</div></div>`).join('') || '<p class="hint">Earn an achievement, a rare flag or a stamp first.</p>'}</div>`;
  el.querySelectorAll('[data-sc]').forEach(b => b.onclick = () => {
    const ref = b.dataset.sc, cur = livePins();
    if (cur.includes(ref)) P.showcase = cur.filter(x => x !== ref);
    else if (cur.length >= SHOWCASE_MAX) { toast(`The showcase holds ${SHOWCASE_MAX}. Unpin one first.`); return; }
    else P.showcase = [...cur, ref];
    saveProfile(); renderPassport();
  });
  $('sc-done').onclick = () => { showcaseEditing = false; renderPassport(); };
}

// ---- compare: another player's passport against yours
// "mastered" is Local mastery (the country's cover); "known" is any place at all
const CMP = { by: 'mastered' };
const CMP_COLORS = { both: '#2E9D5B', me: '#2F6FDB', them: '#E8862A' };
const cmpAt = () => CMP.by === 'mastered' ? COVER_UNLOCK : 1;
function compareSets() {
  const mine = countryKnowledge(P), theirs = countryKnowledge(PV.other.data), at = cmpAt(), both = [], me = [], them = [];
  G.countries.forEach((c, i) => { const a = mine[i] >= at, b = theirs[i] >= at; if (a && b) both.push(i); else if (a) me.push(i); else if (b) them.push(i); });
  return { both, me, them, mine, theirs };
}
function compareTint() {
  const { both, me, them } = compareSets(), col = new Map();
  for (const i of both) col.set(i, CMP_COLORS.both); for (const i of me) col.set(i, CMP_COLORS.me); for (const i of them) col.set(i, CMP_COLORS.them);
  return ci => col.has(ci) ? col.get(ci) + (ci === ppSel ? 'FF' : 'C8') : ci === ppSel ? 'rgba(29,111,184,.3)' : null;
}
function compareLegendHtml() {
  return `<div class="cmplegend">${[['both', 'Both of you'], ['me', 'Only you'], ['them', `Only ${esc(PV.other.label)}`]].map(([k, n]) => `<span><i style="background:${CMP_COLORS[k]}"></i>${n}</span>`).join('')}</div>`;
}
function renderCompare(body) {
  const o = PV.other, them = o.data, sets = compareSets(), meName = CLOUD ? CLOUD.user.name : null;
  const rMe = explorerRating(P), rThem = explorerRating(them), stMe = computeStats(P), stThem = computeStats(them);
  const crowns = n => HOOKS.crownsOf && n ? HOOKS.crownsOf(n).length : 0;
  const rows = [['Rating', rMe.total, rThem.total], ['🚩 Flags', stMe.flags, stThem.flags], ['✨ Holo flags', holoCount(P), holoCount(them)], ['Countries stamped', stMe.countries, stThem.countries], ['Places known', rMe.known, rThem.known],
    ['Continents', stMe.continents, stThem.continents], ['Trips', P.trips || 0, them.trips || 0], ['Distance (km)', Math.round(P.km || 0), Math.round(them.km || 0)], ['Achievements', Object.keys(P.achievements || {}).length, Object.keys(them.achievements || {}).length],
    ...(HOOKS.crownsOf ? [['👑 Crowns', crowns(meName), crowns(o.name)]] : [])];
  const chips = list => list.length ? `<div class="chipline">${list.slice().sort((a, b) => G.countries[a][1].localeCompare(G.countries[b][1])).map(i => `<a href="#" class="chip" data-pick="${i}">${countryFlag(G.countries[i][0])}${esc(G.countries[i][1])}</a>`).join('')}</div>` : '<p class="hint" style="margin:0">None.</p>';
  const stampKeys = p => Object.keys(p.stamps || {});
  const sMe = new Set(stampKeys(P)), sThem = new Set(stampKeys(them));
  const stampOnlyThem = [...sThem].filter(k => !sMe.has(k)), stampOnlyMe = [...sMe].filter(k => !sThem.has(k));
  const stampChip = k => `<span class="chip">${k.startsWith('area:') ? `🛂 ${esc(k.slice(5))}` : `${countryFlag(k)}${esc(ccName(k))}`}</span>`;
  const cat = flagCatalog(), fMe = P.flagsSeen || {}, fThem = them.flagsSeen || {};
  const sharedFlags = Object.keys(fThem).filter(k => fMe[k]).length;
  const byRarity = keys => keys.map(k => cat && cat.byKey.get(k)).filter(Boolean).sort((a, b) => b.rarity - a.rarity);
  const missing = byRarity(Object.keys(fThem).filter(k => !fMe[k])), extra = byRarity(Object.keys(fMe).filter(k => !fThem[k]));
  const tile = (f, p) => { const src = flagSrc(f.key), r = RARITY[f.rarity]; return `<div class="flagtile r${f.rarity}" style="--rc:${r.color}" title="${esc(f.label)} · ${r.name}">${f.rarity === 4 ? '<span class="shine"></span>' : ''}${holoWrap(src ? `<img src="${src}" alt="" loading="lazy">` : '<span class="unknown">?</span>', isHolo(f.key, p))}<em><i></i>${r.name}</em><span>${esc(f.label)}</span></div>`; };
  body.innerHTML = `
    <div class="cmphead"><div class="cmpwho me"><span class="label">You</span>${meName && typeof unameHtml === 'function' ? unameHtml(meName) : `<b>${esc(P.playerName || 'You')}</b>`}</div><span class="cmpvs">vs</span><div class="cmpwho them"><span class="label">Them</span>${typeof unameHtml === 'function' ? unameHtml(o.name) : `<b>${esc(o.label)}</b>`}</div></div>
    <div class="seg" role="group" aria-label="Compare by"><button type="button" data-cmpby="mastered" aria-pressed="${CMP.by === 'mastered'}">Mastered (Local, ${COVER_UNLOCK}+ places)</button><button type="button" data-cmpby="known" aria-pressed="${CMP.by === 'known'}">Any place known</button></div>
    <div class="cmpcounts"><div style="--c:${CMP_COLORS.both}"><b>${sets.both.length}</b><span>both of you</span></div><div style="--c:${CMP_COLORS.me}"><b>${sets.me.length}</b><span>only you</span></div><div style="--c:${CMP_COLORS.them}"><b>${sets.them.length}</b><span>only ${esc(o.label)}</span></div></div>
    <table class="board cmptable"><thead><tr><th></th><th>You</th><th>${esc(o.label)}</th></tr></thead><tbody>${rows.map(([k, a, b]) => `<tr><td>${k}</td><td class="${a > b ? 'win' : ''}">${fmt(a)}</td><td class="${b > a ? 'win' : ''}">${fmt(b)}</td></tr>`).join('')}</tbody></table>
    <details class="fold" open><summary><span class="label"><i class="dot" style="background:${CMP_COLORS.them}"></i>Only ${esc(o.label)} · ${sets.them.length}</span></summary><div class="foldbody">${chips(sets.them)}</div></details>
    <details class="fold"><summary><span class="label"><i class="dot" style="background:${CMP_COLORS.me}"></i>Only you · ${sets.me.length}</span></summary><div class="foldbody">${chips(sets.me)}</div></details>
    <details class="fold"><summary><span class="label"><i class="dot" style="background:${CMP_COLORS.both}"></i>Both of you · ${sets.both.length}</span></summary><div class="foldbody">${chips(sets.both)}</div></details>
    <div><div class="label" style="margin-bottom:6px">Stamps you're missing · ${stampOnlyThem.length}</div>${stampOnlyThem.length ? `<div class="chipline">${stampOnlyThem.map(stampChip).join('')}</div>` : `<p class="hint" style="margin:0">You have every stamp they have.</p>`}
      ${stampOnlyMe.length ? `<p class="hint" style="margin:8px 0 0">And ${stampOnlyMe.length} ${stampOnlyMe.length === 1 ? 'stamp' : 'stamps'} they don't have: ${stampOnlyMe.slice(0, 12).map(k => esc(k.startsWith('area:') ? k.slice(5) : ccName(k))).join(', ')}${stampOnlyMe.length > 12 ? '…' : ''}</p>` : ''}</div>
    <div><div class="label" style="margin-bottom:6px">Flags · ${fmt(sharedFlags)} shared</div>
      <p class="hint" style="margin:0 0 8px">${fmt(missing.length)} of theirs you don't have yet, ${fmt(extra.length)} of yours they don't.</p>
      ${missing.length ? `<div class="label" style="margin:0 0 6px">Their rarest ones you're missing</div><div class="flaggrid cmpflags">${missing.slice(0, 18).map(f => tile(f, them)).join('')}</div>` : ''}
      ${extra.length ? `<div class="label" style="margin:10px 0 6px">Your rarest ones they're missing</div><div class="flaggrid cmpflags">${extra.slice(0, 12).map(f => tile(f, P)).join('')}</div>` : ''}</div>`;
  body.querySelectorAll('[data-cmpby]').forEach(b => b.onclick = () => { CMP.by = b.dataset.cmpby; renderPassport(); ppMap.draw(); });
  body.querySelectorAll('[data-pick]').forEach(a => a.onclick = e => { e.preventDefault(); ppSel = +a.dataset.pick; ppMap.draw(); zoomToCountry(ppMap, ppSel); });
}
