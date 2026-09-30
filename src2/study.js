// ================= achievements & stats =================
// Each achievement reports progress as [have, need]. Ids of the original thirteen are kept so nothing pays out twice.
const ACH_GROUPS = [
  { id: 'miles', name: 'Milestones' }, { id: 'regions', name: 'Regions' }, { id: 'seas', name: 'Seas and coasts' },
  { id: 'geo', name: 'Lines on the globe' }, { id: 'isles', name: 'Far-Flung Isles' }, { id: 'disputed', name: 'Disputed ground' }, { id: 'trips', name: 'Trips' }, { id: 'learn', name: 'Flags and learning' },
];
const MICROSTATES = ['AD', 'LI', 'MC', 'SM', 'VA', 'MT', 'LU'];
const ISLAND_NATIONS = ['IS', 'IE', 'GB', 'MT', 'CY', 'JP', 'PH', 'ID', 'NZ', 'LK', 'MG', 'CU', 'JM', 'HT', 'DO', 'BS', 'BB', 'TT', 'FJ', 'WS', 'TO', 'VU', 'SB', 'PG', 'TW', 'SG', 'BH', 'MV', 'MU', 'SC', 'CV', 'ST', 'KM', 'TL', 'FM', 'MH', 'PW', 'KI', 'NR', 'TV', 'AG', 'DM', 'GD', 'KN', 'LC', 'VC'];
// seas by the shape of their coast: a coastal place inside the box, in a country that really borders that sea
const SEAS = {
  med: { cc: ['ES', 'FR', 'MC', 'IT', 'MT', 'SI', 'HR', 'BA', 'ME', 'AL', 'GR', 'TR', 'CY', 'SY', 'LB', 'IL', 'PS', 'EG', 'LY', 'TN', 'DZ', 'MA', 'GI'],
    test: (la, lo) => la >= 30 && la <= 46 && lo >= -5.6 && lo <= 36.5 && !(la > 43 && lo < 3.2) && !(la > 40.2 && lo > 26.2) },
  black: { cc: ['BG', 'RO', 'UA', 'RU', 'GE', 'TR'], test: (la, lo) => la >= 40.8 && la <= 47.3 && lo >= 27.3 && lo <= 41.9 && !(la < 41.3 && lo < 29.9) },
  baltic: { cc: ['DE', 'PL', 'LT', 'LV', 'EE', 'RU', 'FI', 'SE', 'DK'], test: (la, lo) => la >= 53.5 && la <= 66 && lo >= 9.8 && lo <= 30.5 },
  caspian: { cc: ['KZ', 'TM', 'IR', 'AZ', 'RU'], test: (la, lo) => la >= 36.5 && la <= 47.2 && lo >= 46.6 && lo <= 55.2 },
};
const countOf = (set, list) => list.filter(cc => set.has(cc)).length;
const allOf = (id, icon, name, list, coins) => ({ id, group: 'regions', icon, name, desc: () => `Stop in ${list.map(ccName).join(', ').replace(/, ([^,]*)$/, ' and $1')}.`, coins, progress: st => [countOf(st.cc, list), list.length] });
const someOf = (id, icon, name, n, list, coins, what) => ({ id, group: 'regions', icon, name, desc: () => `Stop in ${n} of ${what || list.map(ccName).join(', ')}.`, coins, progress: st => [Math.min(n, countOf(st.cc, list)), n] });
const ACHIEVEMENTS = [
  { id: 'first', group: 'miles', icon: '🛂', name: 'First stamp', desc: 'Stop anywhere.', coins: 15, progress: st => [Math.min(1, st.places), 1] },
  { id: 'borders', group: 'miles', icon: '🛃', name: 'Border runner', desc: 'Stop in 10 countries.', coins: 60, progress: st => [Math.min(10, st.countries), 10] },
  { id: 'countries-50', group: 'miles', icon: '🗺️', name: 'Half a hundred', desc: 'Stop in 50 countries.', coins: 300, progress: st => [Math.min(50, st.countries), 50] },
  { id: 'continents', group: 'miles', icon: '🌍', name: 'Globetrotter', desc: 'Stop on 5 continents.', coins: 150, progress: st => [Math.min(5, st.continents), 5] },
  { id: 'road', group: 'miles', icon: '🛣️', name: 'Road warrior', desc: 'Travel 10,000 km.', coins: 80, progress: st => [Math.min(10000, Math.round(st.km)), 10000] },
  { id: 'km-40k', group: 'miles', icon: '🌐', name: 'Around the world', desc: 'Travel 40,075 km, once round the Equator.', coins: 300, progress: st => [Math.min(40075, Math.round(st.km)), 40075] },
  { id: 'villages', group: 'miles', icon: '🏡', name: 'Village people', desc: 'Stop in 25 different villages.', coins: 60, progress: st => [Math.min(25, st.villages), 25] },
  { id: 'tiny', group: 'miles', icon: '🛖', name: 'Blink and you miss it', desc: 'Stop in a village of fewer than 1,000 people.', coins: 30, progress: st => [Math.min(1, st.tiny), 1] },
  { id: 'capitals', group: 'miles', icon: '🏛️', name: 'Capital collector', desc: 'Stop in 20 capitals.', coins: 100, progress: st => [Math.min(20, st.capitals), 20] },
  { id: 'capitals-50', group: 'miles', icon: '🏰', name: 'Seat of government', desc: 'Stop in 50 capitals.', coins: 300, progress: st => [Math.min(50, st.capitals), 50] },
  { id: 'megacity', group: 'miles', icon: '🌆', name: 'Megacities', desc: 'Stop in 10 cities of more than 5 million people.', coins: 150, progress: st => [Math.min(10, st.mega), 10] },
  { id: 'islands', group: 'miles', icon: '⛴️', name: 'Island hopper', desc: 'Take 5 ferries.', coins: 50, progress: st => [Math.min(5, st.ferries), 5] },

  allOf('scandinavia', '🫎', 'Scandinavia', ['DK', 'NO', 'SE'], 100),
  allOf('nordic', '❄️', 'The Nordics', ['DK', 'NO', 'SE', 'FI', 'IS'], 200),
  allOf('baltics', '🌲', 'Baltic states', ['EE', 'LV', 'LT'], 100),
  allOf('benelux', '🧇', 'Benelux', ['BE', 'NL', 'LU'], 80),
  allOf('iberia', '🥘', 'Iberia', ['ES', 'PT', 'AD'], 80),
  allOf('britishisles', '☘️', 'British Isles', ['GB', 'IE', 'IM'], 80),
  allOf('alpine', '⛰️', 'Alpine nations', ['CH', 'AT', 'LI', 'SI'], 120),
  someOf('microstates', '🏰', 'Pocket countries', 5, MICROSTATES, 200, 'the European microstates (Andorra, Liechtenstein, Monaco, San Marino, Vatican, Malta, Luxembourg)'),
  allOf('yugoslavia', '🧩', 'Former Yugoslavia', ['SI', 'HR', 'BA', 'RS', 'ME', 'MK', 'XK'], 250),
  allOf('caucasus', '🏔️', 'Caucasus crossroads', ['GE', 'AM', 'AZ'], 150),
  someOf('stans', '🐎', 'The Stans', 5, ['KZ', 'UZ', 'TM', 'KG', 'TJ', 'AF', 'PK'], 250, 'the seven Stans'),
  someOf('gulf', '🌴', 'Gulf states', 5, ['AE', 'QA', 'BH', 'KW', 'OM', 'SA'], 200, 'the six Gulf states'),
  someOf('maghreb', '🕌', 'The Maghreb', 4, ['MA', 'DZ', 'TN', 'LY', 'MR'], 150, 'Morocco, Algeria, Tunisia, Libya and Mauritania'),
  allOf('horn', '🐪', 'Horn of Africa', ['ET', 'ER', 'DJ', 'SO'], 200),
  allOf('centralamerica', '🌋', 'Central America', ['GT', 'BZ', 'SV', 'HN', 'NI', 'CR', 'PA'], 250),
  someOf('andes', '🦙', 'Andean nations', 5, ['VE', 'CO', 'EC', 'PE', 'BO', 'CL', 'AR'], 200, 'the seven countries the Andes run through'),
  someOf('seasia', '🛺', 'Southeast Asia', 6, ['TH', 'VN', 'KH', 'LA', 'MM', 'MY', 'SG', 'ID', 'PH', 'BN', 'TL'], 200, 'the eleven countries of Southeast Asia'),
  { id: 'downunder', group: 'regions', icon: '🦘', name: 'Down under', desc: 'Stop in Australia, New Zealand and a Pacific island nation.', coins: 200, progress: st => [countOf(st.cc, ['AU', 'NZ']) + Math.min(1, countOf(st.cc, ['FJ', 'WS', 'TO', 'VU', 'SB', 'PG', 'KI', 'FM', 'MH', 'PW', 'NR', 'TV'])), 3] },

  { id: 'med', group: 'seas', icon: '🐚', name: 'Mediterranean shores', desc: 'Stop on the Mediterranean coast of 8 countries.', coins: 200, progress: st => [Math.min(8, st.seas.med.size), 8] },
  { id: 'black', group: 'seas', icon: '🌊', name: 'Black Sea circuit', desc: 'Stop on the Black Sea coast of all 6 countries round it.', coins: 250, progress: st => [st.seas.black.size, 6] },
  { id: 'baltic', group: 'seas', icon: '⚓', name: 'Baltic ring', desc: 'Stop on the Baltic coast of 6 countries.', coins: 200, progress: st => [Math.min(6, st.seas.baltic.size), 6] },
  { id: 'caspian', group: 'seas', icon: '🛢️', name: 'Caspian coast', desc: 'Stop on the Caspian shore of 3 countries.', coins: 200, progress: st => [Math.min(3, st.seas.caspian.size), 3] },
  { id: 'islandnations', group: 'seas', icon: '🏝️', name: 'Island nations', desc: 'Stop in 5 countries that are islands or archipelagos.', coins: 150, progress: st => [Math.min(5, countOf(st.cc, ISLAND_NATIONS)), 5] },

  { id: 'arctic', group: 'geo', icon: '🧊', name: 'Arctic Circle', desc: 'Stop north of 66.56°N, where the sun stays up at midsummer.', coins: 120, progress: st => [st.maxLat >= 66.56 ? 1 : 0, 1] },
  { id: 'equator', group: 'geo', icon: '🧭', name: 'On the line', desc: 'Stop within 50 km of the Equator.', coins: 100, progress: st => [st.equator ? 1 : 0, 1] },
  { id: 'tropics', group: 'geo', icon: '☀️', name: 'Between the tropics', desc: 'Stop in 10 places between the Tropic of Cancer and the Tropic of Capricorn.', coins: 60, progress: st => [Math.min(10, st.tropics), 10] },
  { id: 'south', group: 'geo', icon: '🐧', name: 'Down south', desc: 'Stop in 10 places in the Southern Hemisphere.', coins: 60, progress: st => [Math.min(10, st.south), 10] },
  { id: 'dateline', group: 'geo', icon: '🕛', name: 'Edge of the map', desc: 'Stop within 10° of the 180th meridian.', coins: 120, progress: st => [st.dateline ? 1 : 0, 1] },
  { id: 'pole2pole', group: 'geo', icon: '↕️', name: 'Pole to pole', desc: 'Stop in places 90° of latitude apart.', coins: 250, progress: st => [Math.max(0, Math.min(90, Math.round(st.maxLat - st.minLat))), 90] },

  { id: 'contested', group: 'disputed', icon: '⚑', name: 'Contested ground', desc: 'Stop in Crimea, Abkhazia, South Ossetia, Northern Cyprus and Western Sahara.', coins: 250, progress: st => [countOf(st.areas, CONTESTED_SET), CONTESTED_SET.length] },
  { id: 'breakaway', group: 'disputed', icon: '🚧', name: 'Breakaway tour', desc: 'Stop in Transnistria, Abkhazia and South Ossetia.', coins: 200, progress: st => [countOf(st.areas, ['Transnistria', 'Abkhazia', 'South Ossetia']), 3] },
  { id: 'disputed-all', group: 'disputed', icon: '🗺️', name: 'Every line on the map', desc: `Stop in all ${Object.keys(DISPUTED).length} disputed territories: ${Object.keys(DISPUTED).join(', ')}.`, coins: 400, progress: st => [countOf(st.areas, Object.keys(DISPUTED)), Object.keys(DISPUTED).length] },
  { id: 'somaliland', group: 'disputed', icon: '🐫', name: 'Unrecognised republic', desc: 'Stop in Somaliland.', coins: 100, progress: st => [st.areas.has('Somaliland') ? 1 : 0, 1] },

  { id: 'isle-1', group: 'isles', icon: '🏝️', name: 'Far-flung', desc: 'Finish a Far-Flung Isles voyage.', coins: 80, progress: st => [Math.min(1, (st.feats.isles || []).length), 1] },
  { id: 'isles-10', group: 'isles', icon: '🧭', name: 'Outpost collector', desc: 'Reach 10 different Far-Flung Isles outposts.', coins: 300, progress: st => [Math.min(10, (st.feats.isles || []).length), 10] },
  { id: 'isles-oceans', group: 'isles', icon: '🌊', name: 'Five oceans', desc: 'Reach an outpost in every Far-Flung Isles ocean: Southern & South Atlantic, North Atlantic & Arctic, Caribbean, Indian and Pacific.', coins: 250, progress: st => [new Set((st.feats.isles || []).map(g => (isleOf(G.byGid.get(g)) || {}).ocean).filter(Boolean)).size, OCEANS.length] },
  { id: 'isles-south', group: 'isles', icon: '🐧', name: 'Roaring Forties', desc: 'Sail to South Georgia, the Kerguelen Islands and Tristan da Cunha.', coins: 400, progress: st => [isles().filter(x => ['GS', 'TF'].includes(x.cc) || (x.cc === 'SH' && G.lat[x.id] < -30)).filter(x => (st.feats.isles || []).includes(G.gid[x.id])).length, 3] },
  { id: 'isles-all', group: 'isles', icon: '🗺️', name: 'Every speck on the map', desc: 'Reach every Far-Flung Isles outpost.', coins: 1000, progress: st => [(st.feats.isles || []).filter(g => isleOf(G.byGid.get(g))).length, isles().length] },
  { id: 'epic', group: 'trips', icon: '🏁', name: 'Long haul', desc: 'Finish an Epic trip.', coins: 120, progress: st => [Math.min(1, st.feats['len-epic'] || 0), 1] },
  { id: 'rail', group: 'trips', icon: '🚆', name: 'All aboard', desc: 'Finish a train trip.', coins: 80, progress: st => [Math.min(1, st.feats['veh-train'] || 0), 1] },
  { id: 'sail', group: 'trips', icon: '⛵', name: 'Sea legs', desc: 'Finish a boat trip.', coins: 80, progress: st => [Math.min(1, st.feats['veh-boat'] || 0), 1] },
  { id: 'pedal', group: 'trips', icon: '🚲', name: 'Pedal power', desc: 'Finish a bike trip.', coins: 60, progress: st => [Math.min(1, st.feats['veh-bike'] || 0), 1] },
  { id: 'via', group: 'trips', icon: '📍', name: 'By way of', desc: 'Finish a trip that passes through a place you picked.', coins: 50, progress: st => [Math.min(1, st.feats.via || 0), 1] },
  { id: 'purist', group: 'trips', icon: '🧗', name: 'Purist', desc: 'Finish a trip with no planes, no trains and no hints.', coins: 150, progress: st => [Math.min(1, st.feats.purist || 0), 1] },
  { id: 'nohelp', group: 'trips', icon: '💪', name: 'No help needed', desc: 'Finish a trip of 4 or more stops without scouting or roadside help.', coins: 60, progress: st => [Math.min(1, st.feats.nohelp || 0), 1] },
  { id: 'allnew', group: 'trips', icon: '✨', name: 'All new', desc: 'Finish a trip of 5 or more stops where every stop is somewhere you have never been.', coins: 120, progress: st => [Math.min(1, st.feats.allnew || 0), 1] },
  { id: 'blitz', group: 'trips', icon: '🛂', name: 'Border blitz', desc: 'Pass through 5 countries on one trip.', coins: 120, progress: st => [Math.min(5, st.feats.maxCountries || 0), 5] },
  { id: 'hattrick', group: 'trips', icon: '🎩', name: 'Capital hat-trick', desc: 'Stop in 3 capitals on one trip.', coins: 80, progress: st => [Math.min(3, st.feats.maxCapitals || 0), 3] },

  { id: 'flags', group: 'learn', icon: '🚩', name: 'Flag collector', desc: 'Collect 100 flags.', coins: 100, progress: st => [Math.min(100, st.flags), 100] },
  { id: 'flags-nations', group: 'learn', icon: '🏳️', name: 'Flags of many nations', desc: 'Collect 50 country flags.', coins: 120, progress: st => [Math.min(50, st.countryFlags), 50] },
  { id: 'flags-500', group: 'learn', icon: '🎌', name: 'Vexillologist', desc: 'Collect 500 flags.', coins: 250, progress: st => [Math.min(500, st.flags), 500] },
  { id: 'scholar', group: 'learn', icon: '🎓', name: 'Scholar', desc: 'Get 100 study answers right.', coins: 80, progress: st => [Math.min(100, st.correct), 100] },
  { id: 'native', group: 'learn', icon: '🗺️', name: 'Cartographer', desc: 'Reach Native mastery in any country.', coins: 150, progress: st => [Math.min(8, st.topLevel), 8] },
];
function computeStats(p = P) {
  const st = { places: 0, villages: 0, tiny: 0, capitals: 0, mega: 0, countries: 0, continents: 0, ferries: p.ferries || 0, km: p.km || 0, flags: Object.keys(p.flagsSeen).length, countryFlags: Object.keys(p.flagsSeen).filter(k => k.startsWith('c:')).length, correct: 0, answered: 0, topLevel: 0, mostVisited: null, newest: null, bestCountry: null, firstTimers: 0,
    cc: new Set(), areas: new Set(), seas: Object.fromEntries(Object.keys(SEAS).map(k => [k, new Set()])), maxLat: -90, minLat: 90, equator: false, dateline: false, tropics: 0, south: 0, feats: p.feats || {} };
  const conts = new Set();
  for (const [k, v] of Object.entries(p.visits || {})) {
    const id = G.byGid.get(+k.slice(1)); if (id == null) continue;
    const cc = ccOf(id), la = G.lat[id], lo = G.lon[id];
    st.places++; st.cc.add(cc); conts.add(G.contOf[G.cc[id]]);
    const ar = areaName(id); if (ar) st.areas.add(ar);
    if (G.fc[id] === G.capital) st.capitals++; else if (G.pop[id] < 10000) { st.villages++; if (G.pop[id] < 1000) st.tiny++; }
    if (G.pop[id] >= 5e6) st.mega++;
    st.maxLat = Math.max(st.maxLat, la); st.minLat = Math.min(st.minLat, la);
    if (Math.abs(la) <= 0.45) st.equator = true; if (Math.abs(la) <= 23.44) st.tropics++; if (la < 0) st.south++; if (Math.abs(lo) >= 170) st.dateline = true;
    for (const [sea, x] of Object.entries(SEAS)) if (x.cc.includes(cc) && x.test(la, lo) && coastal(id)) st.seas[sea].add(cc);
    if (v.n === 1) st.firstTimers++;
    if (!st.mostVisited || v.n > st.mostVisited.n) st.mostVisited = { id, n: v.n };
    if (!st.newest || v.first > st.newest.t) st.newest = { id, t: v.first };
  }
  st.countries = st.cc.size; st.continents = conts.size;
  for (const s of Object.values(p.study || {})) { st.correct += s.correct || 0; st.answered += s.answered || 0; }
  const k = countryKnowledge(p); let bi = -1; k.forEach((v, i) => { if (bi < 0 || v > k[bi]) bi = i; });
  if (bi >= 0 && k[bi] > 0) { st.bestCountry = { ci: bi, score: k[bi] }; st.topLevel = masteryLevel(k[bi]); }
  return st;
}
function checkAchievements() {
  if (!G) return; if (!P.feed) feedBackfill(); const st = computeStats();
  for (const a of ACHIEVEMENTS) { if (P.achievements[a.id]) continue; const [have, need] = a.progress(st); if (have >= need) { P.achievements[a.id] = Date.now(); saveProfile(); addCoins(a.coins, `Achievement: ${a.name}`); feedAdd({ k: 'ach', id: a.id }); } }
  feedMastery();
}
function renderAwards(body, p = P) {
  const got = id => !!(p.achievements || {})[id], st = computeStats(p), done = ACHIEVEMENTS.filter(a => got(a.id)).length;
  body.innerHTML = `<div class="flaghead"><span class="big">${done}</span><b style="font:800 22px/1 var(--display);text-transform:uppercase">Achievements</b><span class="of">of ${ACHIEVEMENTS.length} unlocked · ${fmt(ACHIEVEMENTS.filter(a => got(a.id)).reduce((t, a) => t + a.coins, 0))} coins earned</span></div>
    ${ACH_GROUPS.map(g => { const list = ACHIEVEMENTS.filter(a => a.group === g.id); return `<div class="achgroup"><div class="label">${g.name} · ${list.filter(a => got(a.id)).length}/${list.length}</div>${list.map(a => { const unlocked = got(a.id), [have, need] = a.progress(st);
      return `<div class="ach ${unlocked ? 'done' : ''}"><span class="ico" aria-hidden="true">${a.icon}</span><div><b>${esc(a.name)}</b><small>${esc(typeof a.desc === 'function' ? a.desc() : a.desc)}</small>${unlocked ? '<small class="got">Unlocked</small>' : need > 1 ? `<div class="achbar"><div class="levelbar"><div style="width:${Math.min(100, have / need * 100)}%;background:var(--accent)"></div></div><span>${fmt(have)} / ${fmt(need)}</span></div>` : ''}</div><span class="price"><i></i>${a.coins}</span></div>`; }).join('')}</div>`; }).join('')}`;
}

// ================= passport =================
let ppSel = null, ppTab = 'country';
const ppMap = new MapView($('pp-map'), {
  style: () => 'atlas', overlays: () => ({ names: true }),
  tint: () => { if (ppTab === 'compare' && PV.other) return compareTint(); const k = countryKnowledge(pp()); return ci => { const lv = masteryLevel(k[ci]); if (lv) return MASTERY[lv].color + (ci === ppSel ? 'FF' : 'B8'); return ci === ppSel ? 'rgba(29,111,184,.3)' : null; }; },
  avoid: () => G && !PV.other ? new Set(opts.avoid.map(cc => G.ccIndex[cc]).filter(x => x != null)) : null,
  click: p => { const ci = countryAt(p.lat, p.lon); if (ci >= 0 && G.placeCount[ci]) { ppSel = ci; ppTab = 'country'; renderPassport(); ppMap.draw(); } },
  layer: (m, ctx) => {
    if (ppSel != null) { const sh = G.shapes[ppSel]; if (sh) { ctx.beginPath(); m.trace(sh.rings); ctx.strokeStyle = '#16221D'; ctx.lineWidth = 2; ctx.stroke(); } }
    if (HOOKS.crownsOf) {
      const held = new Set(HOOKS.crownsOf(PV.other ? PV.other.name : CLOUD.user.name));
      if (held.size) { ctx.font = '18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        for (const a of G.anchors) if (held.has(G.countries[a.i][0])) { const [x, y] = m.px(a.lon, a.lat); ctx.fillText('👑', x, y - 8); } }
    }
    if (ppTab !== 'trips') return;
    ctx.globalAlpha = .75;
    for (const h of pp().history || []) { const ids = h.route.concat([h.dest]).map(g => G.byGid.get(g)).filter(x => x != null); ctx.beginPath(); ids.forEach((id, i) => { const [x, y] = m.px(G.lon[id], G.lat[id]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.strokeStyle = routeColor(); ctx.lineWidth = 2; ctx.stroke(); }
    ctx.globalAlpha = 1;
  },
});
function renderPassport() {
  if (ppTab === 'compare' && !PV.other) ppTab = 'book';
  const comparing = ppTab === 'compare';
  $('pp-legend').innerHTML = comparing ? compareLegendHtml() : MASTERY.slice(1).map(m => `<span style="background:${m.color}" title="${m.name}: ${m.at}+ places known"></span>`).join('');
  $('pp-legend').classList.toggle('masterylegend', !comparing); $('pp-legend').nextElementSibling.hidden = comparing;
  $('pp-tabs').querySelector('[data-tab="compare"]').hidden = !(PV.other && CLOUD);
  $('pp-tabs').querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === ppTab)));
  const p = pp(), view = !!PV.other, who = view ? PV.other.label : null, k = countryKnowledge(p), body = $('pp-body');
  if (ppTab === 'book') { renderBook(body); return; }
  if (ppTab === 'country' && ppSel == null) {
    const known = G.countries.map((c, i) => [i, k[i]]).filter(([, v]) => v > 0);
    const weak = known.slice().sort((a, b) => a[1] - b[1]).slice(0, 6), strong = known.slice().sort((a, b) => b[1] - a[1]).slice(0, 6);
    body.innerHTML = `<p class="hint" style="margin:0">${view ? `Click any country on the map to see how well ${esc(who)} knows it. A country's colour comes from how many of its places they've stopped in or got right in Study.` : "Click any country on the map to see what you know about it, study it, or avoid it on trips. A country's colour comes from how many of its places you've stopped in or got right in Study."}</p>
      ${strong.length ? `<div><div class="label" style="margin-bottom:6px">Best known</div><ul class="list">${strong.map(([i, v]) => `<li><a href="#" data-pick="${i}">${countryFlag(G.countries[i][0])}${esc(G.countries[i][1])}</a><span>${MASTERY[masteryLevel(v)].name} · ${v}</span></li>`).join('')}</ul></div>` : ''}
      ${known.length > 6 ? `<div><div class="label" style="margin-bottom:6px">Needs work</div><ul class="list">${weak.map(([i, v]) => `<li><a href="#" data-pick="${i}">${countryFlag(G.countries[i][0])}${esc(G.countries[i][1])}</a><span>${MASTERY[masteryLevel(v)].name} · ${v}</span></li>`).join('')}</ul></div>` : ''}
      ${!known.length ? `<p class="hint">${view ? 'Nothing stamped yet.' : 'Nothing stamped yet. Finish a leg of a trip or a study round to colour in your first country.'}</p>` : ''}`;
    body.querySelectorAll('[data-pick]').forEach(a => a.onclick = e => { e.preventDefault(); ppSel = +a.dataset.pick; renderPassport(); zoomToCountry(ppMap, ppSel); });
  } else if (ppTab === 'country') {
    const ci = ppSel, c = G.countries[ci], score = k[ci], lv = masteryLevel(score), next = MASTERY[lv + 1];
    const mine = Object.entries(p.visits || {}).map(([key, v]) => ({ id: G.byGid.get(+key.slice(1)), v })).filter(x => x.id != null && G.cc[x.id] === ci);
    const most = mine.slice().sort((a, b) => b.v.n - a.v.n)[0], newest = mine.slice().sort((a, b) => b.v.first - a.v.first)[0];
    const regions = new Map(); for (const x of mine) { const a = admOf(x.id)[0]; if (a) regions.set(a, (regions.get(a) || 0) + 1); }
    const study = (p.study || {})[c[0]] || {}, avoided = !view && opts.avoid.includes(c[0]);
    body.innerHTML = `<div class="cstat">
        <h3>${countryFlag(c[0])}${esc(c[1])}</h3>
        ${(() => { const cr = HOOKS.crownOf && HOOKS.crownOf(c[0]); if (!cr) return ''; const theirs = view ? cr.name === PV.other.name : cr.mine; return `<div class="hint" style="margin-top:6px">👑 ${theirs ? `${view ? esc(who) + ' holds' : 'You hold'} the crown` : `Crown: <b>${esc(cr.who)}</b>`} · ${fmt(cr.n)} places known</div>`; })()}
        <div class="chipline" style="margin-top:8px"><span class="chip" style="background:${MASTERY[Math.max(1, lv)].color}33">${MASTERY[lv].name}</span><span class="chip">${fmt(score)} places known</span><span class="chip">${fmt(G.placeCount[ci])} in the gazetteer</span>${avoided ? '<span class="chip warn">Avoided</span>' : ''}</div>
        <div class="levelbar" style="margin-top:10px"><div style="width:${next ? Math.min(100, (score - MASTERY[lv].at) / (next.at - MASTERY[lv].at) * 100) : 100}%;background:${MASTERY[Math.max(1, lv)].color}"></div></div>
        <div class="hint" style="margin-top:4px">${next ? `${next.at - score} more to reach ${next.name}` : 'Top level reached'}</div>
      </div>
      <div class="stats"><div class="stat"><span class="label">Stops</span><b>${fmt(mine.reduce((s, x) => s + x.v.n, 0))}</b></div><div class="stat"><span class="label">Places</span><b>${fmt(mine.length)}</b></div><div class="stat"><span class="label">Studied</span><b>${fmt((study.known || []).length)}</b></div></div>
      <ul class="list">
        <li><span>Most visited</span><span>${most ? esc(G.name[most.id]) + ' · ' + most.v.n + '×' : '—'}</span></li>
        <li><span>Newest place</span><span>${newest ? esc(G.name[newest.id]) : '—'}</span></li>
        <li><span>Best-known region</span><span>${regions.size ? esc([...regions.entries()].sort((a, b) => b[1] - a[1])[0][0]) : '—'}</span></li>
        <li><span>Best study score</span><span>${study.bestPct != null ? study.bestPct + '%' : '—'}</span></li>
      </ul>
      <div class="tools">${view ? '' : `<button class="btn go" type="button" id="pp-study">Study ${esc(c[1])}</button><button class="btn" type="button" id="pp-avoid">${avoided ? 'Stop avoiding' : 'Avoid on trips'}</button>`}<button class="btn" type="button" id="pp-back">All countries</button></div>
      ${mine.length ? `<div><div class="label" style="margin-bottom:6px">${view ? `${esc(who)}'s places` : 'Your places'}</div><div class="chipline">${mine.sort((a, b) => b.v.n - a.v.n).slice(0, 60).map(x => `<span class="chip">${esc(G.name[x.id])}${x.v.n > 1 ? ' ×' + x.v.n : ''}</span>`).join('')}</div></div>` : ''}`;
    if (!view) {
      $('pp-study').onclick = () => { $('dlg-passport').close(); openStudy(c[0]); };
      $('pp-avoid').onclick = () => { setAvoid(c[0], !avoided); renderPassport(); ppMap.draw(); };
    }
    $('pp-back').onclick = () => { ppSel = null; renderPassport(); ppMap.draw(); };
  } else if (ppTab === 'flags') {
    renderFlagTab(body, p);
  } else if (ppTab === 'stats') {
    const st = computeStats(p), newestFlags = Object.entries(p.flagsSeen).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([key]) => flagSrc(key)).filter(Boolean);
    body.innerHTML = `<div><div class="label" style="margin-bottom:8px">Flag collection</div>${flagSummaryHtml(true, p)}</div>
      <div class="stats">
        <div class="stat"><span class="label">Places</span><b>${fmt(st.places)}</b></div><div class="stat"><span class="label">Countries</span><b>${st.countries}</b></div><div class="stat"><span class="label">Continents</span><b>${st.continents}</b></div>
        <div class="stat"><span class="label">Trips</span><b>${fmt(p.trips || 0)}</b></div><div class="stat"><span class="label">Km</span><b>${fmt(p.km || 0)}</b></div><div class="stat"><span class="label">Flags</span><b>${fmt(st.flags)}</b></div>
        <div class="stat"><span class="label">Villages</span><b>${fmt(st.villages)}</b></div><div class="stat"><span class="label">Capitals</span><b>${fmt(st.capitals)}</b></div><div class="stat"><span class="label">Ferries</span><b>${fmt(st.ferries)}</b></div>
      </div>
      <ul class="list">
        <li><span>Most visited place</span><span>${st.mostVisited ? esc(G.name[st.mostVisited.id]) + ' · ' + st.mostVisited.n + '×' : '—'}</span></li>
        <li><span>Newest place</span><span>${st.newest ? esc(G.name[st.newest.id]) + ', ' + esc(countryName(st.newest.id)) : '—'}</span></li>
        <li><span>Best-known country</span><span>${st.bestCountry ? esc(G.countries[st.bestCountry.ci][1]) + ' · ' + MASTERY[st.topLevel].name : '—'}</span></li>
        <li><span>Places visited only once</span><span>${fmt(st.firstTimers)}</span></li>
        <li><span>Study accuracy</span><span>${st.answered ? Math.round(st.correct / st.answered * 100) + '% of ' + fmt(st.answered) : '—'}</span></li>
      </ul>
      ${newestFlags.length ? `<div><div class="label" style="margin-bottom:6px">Newest flags</div><div class="flagrow">${newestFlags.map(s => `<img src="${s}" alt="" style="width:54px;height:36px;object-fit:contain;border-radius:3px;box-shadow:0 0 0 1px var(--line)">`).join('')}</div></div>` : ''}`;
  } else if (ppTab === 'awards') {
    renderAwards(body, p);
  } else if (ppTab === 'feed') {
    renderFeedTab(body, p);
  } else if (ppTab === 'compare') {
    renderCompare(body);
  } else {
    const hist = p.history || [];
    body.innerHTML = hist.length ? `<p class="hint" style="margin:0">${view ? 'Their' : 'Your'} last ${hist.length} finished trips, drawn on the map.</p><ul class="list">${hist.map(h => { const s = G.byGid.get(h.route[0]), d = G.byGid.get(h.dest); return `<li><span>${s != null ? esc(G.name[s]) : '?'} → ${d != null ? esc(G.name[d]) : '?'}</span><span>${(VEHICLES[h.vehicle] || VEHICLES.car).icon} ${fmt(h.km)} km · ${fmt(h.total)} pts</span></li>`; }).join('')}</ul>` : `<p class="hint">${view ? 'No finished trips yet.' : 'Finish a trip and it shows up here.'}</p>`;
  }
}
$('pp-body').addEventListener('click', e => { const b = e.target.closest('[data-goto-tab]'); if (b) { ppTab = b.dataset.gotoTab; if (ppTab === 'flags' && !PV.other) openedFlagTab(); renderPassport(); ppMap.draw(); } });
$('pp-tabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (!b) return; ppTab = b.dataset.tab; if (ppTab === 'flags' && !PV.other) openedFlagTab(); renderPassport(); ppMap.draw(); };
// other: null for your own passport, or { label, data } for another player's, read-only
function openPassport(other, tab) {
  const was = PV.other; PV.other = other || null; showcaseEditing = false;
  if (!other && was) { ppSel = null; ppTab = 'book'; FL.cc = ''; }
  if (other) { ppSel = null; ppTab = tab || 'book'; FL.cc = ''; FL.kind = 'country'; }
  $('pp-title').textContent = other ? `${other.label}'s passport` : 'Passport';
  $('pp-lead').textContent = other ? 'Read-only. Their mastery map, stamps, covers, flags and trips. Click a country to see how well they know it.' : 'How well you know each country. Click one on the map.';
  if (!other && P.flagsNew) { ppTab = 'flags'; openedFlagTab(); }
  renderPassport(); if (!$('dlg-passport').open) $('dlg-passport').showModal();
  requestAnimationFrame(() => { ppMap.resize(); if (ppSel != null) zoomToCountry(ppMap, ppSel, true); else ppMap.fit(!other && S ? [[G.lat[S.cur] + 18, G.lon[S.cur] - 30], [G.lat[S.cur] - 18, G.lon[S.cur] + 30]] : [[62, -20], [30, 45]], true, 20, 20); applyCosmetics(); });
}
$('btn-passport').onclick = () => openPassport(null);
$('dlg-passport').addEventListener('close', () => { if (PV.other) { PV.other = null; ppSel = null; ppTab = 'book'; FL.cc = ''; } });

// ================= study (Seterra-style) =================
const LEVELS = [5, 10, 15, 20, 30, 40, 60, 80, 120, 160];
const Q = { cc: null, adm: '', level: 1, mode: 'find', items: [], order: [], idx: 0, tries: 0, score: 0, results: new Map(), done: false, running: false, flash: null, coins: 0 };
const stMap = new MapView($('st-map'), {
  style: () => ['night', 'blueprint', 'antique', 'political', 'terrain', 'outdoor', 'midcentury', 'satellite', 'nightlights', 'grey', 'metro', 'newsprint', 'topo', 'synthwave'].includes(P.equip.style) ? P.equip.style : 'atlas',
  overlays: () => ({}),
  tint: () => { if (Q.cc == null || !G || Q.deck) return null; const ci = G.ccIndex[Q.cc]; return c => c === ci ? null : 'rgba(128,128,128,.35)'; },
  click: p => studyClick(p),
  layer: (m, ctx, pal) => {
    if (!Q.items.length) return;
    const target = Q.order[Q.idx], now = performance.now();
    for (const id of Q.items) {
      const [x, y] = m.px(G.lon[id], G.lat[id]), res = Q.results.get(id), flashing = Q.flash && Q.flash.id === id && now < Q.flash.until;
      let fill = pal.land, r = 6;
      if (res === 3) fill = '#1B8A4C'; else if (res === 2) fill = '#7DBF3B'; else if (res === 1) fill = '#F2A93B'; else if (res === 0) fill = '#C42B2B';
      if (Q.running && Q.mode === 'name' && id === target) { r = 11; fill = '#1D6FB8'; }
      if (flashing) { fill = Q.flash.color; r = 9; }
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = pal.ink; ctx.stroke();
      if (res != null || flashing || (!Q.running && Q.done)) m.label(G.name[id], x + 11, y, { size: 12 });
    }
  },
});
function studyPool(cc, adm) {
  if (Q.custom) return Q.custom.slice();
  if (Q.deck) return deckPool(Q.deck);
  const ci = G.ccIndex[cc], out = [];
  for (let i = 0; i < G.n && out.length < 160; i++) {
    if (G.cc[i] !== ci || (adm && admOf(i)[2] !== adm)) continue;
    if (out.some(j => dist(G.lat[i], G.lon[i], G.lat[j], G.lon[j]) < 6)) continue;
    out.push(i);
  }
  return out;
}
function openStudy(cc) {
  if (!G) return;
  Q.custom = null; if (cc) Q.deck = null;
  Q.cc = cc || Q.cc || (S ? ccOf(S.cur) : 'DE'); Q.adm = cc ? '' : Q.adm; Q.running = false; Q.done = false; Q.items = [];
  renderStudySide(); $('dlg-study').showModal();
  requestAnimationFrame(() => { stMap.resize(); if (Q.deck) previewStudy(); else zoomToCountry(stMap, G.ccIndex[Q.cc], true); applyCosmetics(); });
}
// a bought deck (sinks.js) opens Study on it
function openDeck(id) { if (!ownsDeck(id)) return; Q.deck = id; Q.custom = null; Q.done = false; Q.items = []; openStudy(); }
$('btn-study').onclick = () => openStudy();
$('dlg-study').addEventListener('close', () => { Q.running = false; });
function renderStudySide() {
  const ci = G.ccIndex[Q.cc], side = $('st-side');
  if (Q.running) {
    const target = Q.order[Q.idx], areaName = Q.adm ? G.admList[G.admIndex.get(Q.adm)][0] : '';
    side.innerHTML = `<div><div class="label">${Q.deck ? esc(deckOf(Q.deck).name) : esc(G.countries[ci][1])}${areaName ? ' · ' + esc(areaName) : ''} · level ${Q.level}</div>
        <h3 style="margin:6px 0 0;font:800 26px/1 var(--display);text-transform:uppercase">${Q.idx + 1} of ${Q.order.length}</h3></div>
      <div class="stats"><div class="stat"><span class="label">Score</span><b>${Q.score}</b></div><div class="stat"><span class="label">Out of</span><b>${Q.order.length * 3}</b></div><div class="stat"><span class="label">Tries left</span><b id="st-tries">${3 - Q.tries}</b></div></div>
      ${Q.mode === 'name' ? `<form id="st-form" class="entryrow" autocomplete="off"><input class="bigfield" type="text" id="st-input" placeholder="Name the blue dot" spellcheck="false" aria-label="Name of the blue dot"><button class="btn go" type="submit">Check</button></form>` : '<p class="hint" style="margin:0">Click the dot for the place named at the top of the map.</p>'}
      <div class="msg" id="st-msg" aria-live="polite"></div>
      <div class="tools"><button class="btn small" type="button" id="st-skip">Skip</button><button class="btn small" type="button" id="st-stop">End session</button></div>`;
    $('st-bar').hidden = false;
    $('st-bar').innerHTML = Q.mode === 'find'
      ? `<small>Find</small><b>${esc(G.name[target])}</b><small>${esc(tierOf(target).label)}${Q.deck ? ' · ' + esc(countryName(target)) : admOf(target)[0] && !Q.adm ? ' · ' + esc(admOf(target)[0]) : ''}</small>`
      : `<small>Name the blue dot</small><b>?</b><small>${esc(tierOf(target).label)}${Q.deck ? ' · ' + esc(countryName(target)) : admOf(target)[0] && !Q.adm ? ' · ' + esc(admOf(target)[0]) : ''}</small>`;
    $('st-skip').onclick = () => studyAnswer(false, true);
    $('st-stop').onclick = () => finishStudy();
    if (Q.mode === 'name') {
      $('st-input').focus();
      $('st-form').onsubmit = e => { e.preventDefault(); const val = fold($('st-input').value); if (!val) return; const ok = fold(G.name[target]) === val || (G.alts[target] || []).some(a => fold(a) === val); $('st-input').value = ''; studyAnswer(ok); };
    }
    return;
  }
  $('st-bar').hidden = true;
  const regions = [];
  G.admList.forEach((a, i) => { if (a[2] && a[2].startsWith(Q.cc + '.') && G.admCount[i] >= 5) regions.push([a[2], a[0], G.admCount[i]]); });
  regions.sort((a, b) => a[1].localeCompare(b[1]));
  const pool = studyPool(Q.cc, Q.adm), N = Q.custom ? pool.length : Math.min(LEVELS[Q.level - 1], pool.length), study = Q.deck ? (P.deckBest || {})[Q.deck] || {} : P.study[Q.cc] || {}, pct = Q.order.length ? Math.round(Q.score / (Q.order.length * 3) * 100) : 0;
  side.innerHTML = `
    ${Q.done ? `<div class="finish"><h2>${Q.score} / ${Q.order.length * 3}</h2><p>${pct}% · ${[...Q.results.values()].filter(v => v > 0).length} of ${Q.order.length} found${Q.learned ? ` · ${Q.learned} new` : ''} · +${Q.coins} coins. Names are now shown on the map, so have a look before you go again.</p><div class="tools"><button class="btn go" type="button" id="st-again">Again</button>${Q.level < 10 && N < pool.length + 1 ? '<button class="btn" type="button" id="st-harder">Harder</button>' : ''}</div></div>` : ''}
    ${Q.custom ? `<div class="news-perk"><span><strong>Blind-spot drill · ${Q.custom.length} places</strong><br><span class="hint">Only the places you keep missing in ${esc(G.countries[ci][1])}. A right answer on the first try moves its card up a box.</span></span></div>` : ''}
    ${STUDY_DECKS.some(d => ownsDeck(d.id)) ? `<div><label class="label" for="st-deck">Deck</label><select class="field" id="st-deck" style="width:100%;margin-top:6px"><option value="">One country</option>${STUDY_DECKS.filter(d => ownsDeck(d.id)).map(d => `<option value="${d.id}" ${Q.deck === d.id ? 'selected' : ''}>${esc(d.name)} (${fmt(deckPool(d.id).length)})</option>`).join('')}</select></div>` : ''}
    <div ${Q.deck ? 'hidden' : ''}><label class="label" for="st-country">Country or territory</label><select class="field" id="st-country" style="width:100%;margin-top:6px">${G.countries.map((c, i) => [c, i]).filter(([, i]) => G.placeCount[i] >= 5).sort((a, b) => a[0][1].localeCompare(b[0][1])).map(([c]) => `<option value="${c[0]}" ${c[0] === Q.cc ? 'selected' : ''}>${esc(c[1])}</option>`).join('')}</select></div>
    <div ${Q.deck ? 'hidden' : ''}><label class="label" for="st-adm">Area</label><select class="field" id="st-adm" style="width:100%;margin-top:6px"><option value="">The whole country</option>${regions.map(([key, nm, n]) => `<option value="${key}" ${key === Q.adm ? 'selected' : ''}>${esc(nm)} (${fmt(n)} places)</option>`).join('')}</select>
      <p class="hint" style="margin:6px 0 0">States, provinces, constituent countries and autonomous republics, like Bavaria, Texas, Scotland or Crimea. Territories like Greenland or Puerto Rico are in the country list.</p></div>
    <div><label class="label" for="st-level">Difficulty · level ${Q.level}</label><input type="range" id="st-level" min="1" max="10" step="1" value="${Q.level}">
      <p class="hint" style="margin:0">${N} places, the ${N} biggest${N >= pool.length ? ' (all of them)' : ''}. ${Q.level <= 2 ? 'Major cities only.' : Q.level <= 5 ? 'Cities and bigger towns.' : Q.level <= 8 ? 'Down to small towns.' : 'Deep cuts, villages included.'}</p></div>
    <div><div class="label">Mode</div><div class="choices" id="st-mode">
      <button type="button" class="choice" data-mode="find" aria-pressed="${Q.mode === 'find'}">Find on map<small>Click the named place</small></button>
      <button type="button" class="choice" data-mode="name" aria-pressed="${Q.mode === 'name'}">Name the dot<small>Type the highlighted place</small></button></div></div>
    <button class="btn go" type="button" id="st-start" ${N ? '' : 'disabled'}>Start · ${N} places</button>
    <ul class="list"><li><span>Best score in ${Q.deck ? esc(deckOf(Q.deck).name) : esc(G.countries[ci][1])}</span><span>${study.bestPct != null ? study.bestPct + '%' : '—'}</span></li>${Q.deck ? '' : `<li><span>Places learned here</span><span>${fmt((study.known || []).length)}</span></li>`}</ul>
    <p class="hint" style="margin:0">3 points on the first try, 2 on the second, 1 on the third. Every place you get right counts towards your mastery of the country. Coins: 1 for every place you learn for the first time, 1 per 6 points, and a bonus of half the round's size (up to 40) for 90% or better.</p>`;
  if ($('st-deck')) $('st-deck').onchange = e => { Q.deck = e.target.value || null; Q.custom = null; Q.done = false; Q.items = []; renderStudySide(); if (Q.deck) previewStudy(); else zoomToCountry(stMap, G.ccIndex[Q.cc]); stMap.draw(); };
  $('st-country').onchange = e => { Q.custom = null; Q.deck = null; Q.cc = e.target.value; Q.adm = ''; Q.done = false; Q.items = []; renderStudySide(); zoomToCountry(stMap, G.ccIndex[Q.cc]); };
  $('st-adm').onchange = e => { Q.custom = null; Q.adm = e.target.value; Q.done = false; Q.items = []; renderStudySide(); previewStudy(); };
  $('st-level').oninput = e => { Q.level = +e.target.value; renderStudySide(); };
  $('st-level').onchange = () => previewStudy();
  $('st-mode').onclick = e => { const b = e.target.closest('[data-mode]'); if (b) { Q.mode = b.dataset.mode; renderStudySide(); } };
  $('st-start').onclick = startStudy;
  if ($('st-again')) $('st-again').onclick = startStudy;
  if ($('st-harder')) $('st-harder').onclick = () => { Q.level = Math.min(10, Q.level + 1); startStudy(); };
}
function previewStudy() { const pool = studyPool(Q.cc, Q.adm).slice(0, Q.custom ? 999 : LEVELS[Q.level - 1]); if (pool.length) stMap.fit(pool.map(id => [G.lat[id], G.lon[id]]), false, 110, 110); }
function startStudy() {
  const pool = studyPool(Q.cc, Q.adm).slice(0, Q.custom ? 999 : LEVELS[Q.level - 1]);
  if (!pool.length) { toast('No places to study there'); return; }
  Object.assign(Q, { items: pool, order: pool.slice().sort(() => Math.random() - 0.5), idx: 0, tries: 0, score: 0, results: new Map(), done: false, running: true, coins: 0, learned: 0, flash: null });
  stMap.fit(pool.map(id => [G.lat[id], G.lon[id]]), false, 110, 110);
  renderStudySide(); stMap.draw();
}
function flashDot(id, color, ms) { Q.flash = { id, color, until: performance.now() + ms }; stMap.draw(); setTimeout(() => stMap.draw(), ms + 30); }
function studyClick(p) {
  if (!Q.running || Q.mode !== 'find') return;
  let best = null, bd = 1e9;
  for (const id of Q.items) { if (Q.results.has(id)) continue; const [x, y] = stMap.px(G.lon[id], G.lat[id]), d = Math.hypot(x - p.x, y - p.y); if (d < bd) { bd = d; best = id; } }
  if (best == null || bd > 24) { const m = $('st-msg'); m.textContent = 'Click on one of the dots.'; m.className = 'msg'; return; }
  if (best === Q.order[Q.idx]) studyAnswer(true);
  else { flashDot(best, '#C42B2B', 1400); const m = $('st-msg'); m.textContent = `That's ${G.name[best]}.`; m.className = 'msg bad'; studyAnswer(false); }
}
function studyAnswer(ok, skip) {
  const target = Q.order[Q.idx], qcc = Q.deck ? ccOf(target) : Q.cc, rec = P.study[qcc] = P.study[qcc] || { known: [], answered: 0, correct: 0 };
  if (ok) {
    const pts = 3 - Q.tries; Q.score += pts; Q.results.set(target, pts); rec.answered++; rec.correct++;
    if (Q.tries) bsNote(target, 'miss'); else bsGrade(target, true, true);
    if (!rec.known.includes(G.gid[target])) { rec.known.push(G.gid[target]); Q.learned = (Q.learned || 0) + 1; }
    saveProfile(); nextQuestion(`✓ ${G.name[target]}`, 'good');
  } else {
    Q.tries++;
    if (Q.tries >= 3 || skip) {
      Q.results.set(target, 0); rec.answered++; bsNote(target, 'miss', 2); saveProfile();
      flashDot(target, '#1D6FB8', 1800);
      nextQuestion(`✗ It was ${G.name[target]}${admOf(target)[0] ? ', ' + admOf(target)[0] : ''} (shown in blue).`, 'bad');
    } else {
      if (Q.mode === 'name') { const m = $('st-msg'); m.textContent = `Not quite. ${3 - Q.tries} ${3 - Q.tries === 1 ? 'try' : 'tries'} left.`; m.className = 'msg bad'; }
      $('st-tries').textContent = 3 - Q.tries; stMap.draw();
    }
  }
}
function nextQuestion(msg, cls) {
  Q.idx++; Q.tries = 0;
  if (Q.idx >= Q.order.length) { finishStudy(); return; }
  renderStudySide(); const m = $('st-msg'); m.textContent = msg; m.className = 'msg ' + cls; stMap.draw();
}
function finishStudy() {
  const complete = Q.idx >= Q.order.length, answered = Math.max(1, Math.min(Q.idx, Q.order.length));
  Q.running = false; Q.done = true; Q.order = Q.order.slice(0, answered);
  const pct = Math.round(Q.score / (answered * 3) * 100), rec = Q.deck ? ((P.deckBest = P.deckBest || {})[Q.deck] = P.deckBest[Q.deck] || {}) : P.study[Q.cc] = P.study[Q.cc] || { known: [], answered: 0, correct: 0 };
  if (complete) rec.bestPct = Math.max(rec.bestPct || 0, pct);
  // coins reward learning: 1 per place you get right for the first time ever, plus a little for the score,
  // plus an accuracy bonus that grows with the round's size (so replaying a 5-place round is not a coin farm)
  Q.coins = (Q.learned || 0) + Math.floor(Q.score / 6) + (complete && pct >= 90 ? Math.min(40, Math.round(Q.order.length / 2)) : 0);
  saveProfile(); addCoins(Q.coins, 'study session'); checkAchievements(); renderLeagueChip(); publishScore();
  renderStudySide(); stMap.draw();
}

// ================= boot =================
(async () => {
  try { await loadData(); }
  catch (err) { $('loading').innerHTML = `<div><b>The atlas didn't load</b><span>This browser couldn't unpack the settlement data (${esc(err.message)}). Try a recent Chrome, Safari, Firefox or Edge.</span></div>`; return; }
  $('loading').hidden = true;
  settleRetiredItems(); ensureEquipDefaults(); renderCoins(); applyCosmetics(); applyTheme(store.get('stopover-theme'));
  FLAGS.onLoad = () => { if (S) render(); flagsArrived(); };
  const flagsLoaded = loadFlags().then(() => { flagsBackfill(); renderLeagueChip(); if (S) render(); flagsArrived(); });
  loadRail().then(() => { if (S) render(); if ($('dlg-new').open) renderNewTrip(); });
  tripMap.resize();
  const saved = store.get('stopover-trip');
  if (saved && saved.v === 2 && saved.start < G.n && saved.dest < G.n) {
    S = saved; useVoyage(S); RULES = migrateRules(S.rules); hintIds = S.scouts ? S.scouts.map(s => s.id) : []; render(); tripMap.fit(tripBounds(), true, 56, 130);
    setMsg(S.done ? lastMsg.text : `Trip resumed. You're in ${G.name[S.cur]}.`);
  } else if (!startTrip(opts, false)) startTrip({ ...opts, vehicle: opts.vehicle === 'train' ? 'car' : opts.vehicle, regions: ['EU'], length: 'short', avoid: [], from: null, to: null, via: [] }, false);
  // a shared result links to ?play=daily or ?play=weekly: open that same puzzle, unless a trip is under way
  const play = new URLSearchParams(location.search).get('play');
  if (play === 'daily' || play === 'weekly') {
    history.replaceState(null, '', location.pathname + location.hash);
    const today = new Date().toISOString().slice(0, 10), already = play === 'daily' ? S && S.daily === today : S && S.weekly === isoWeek();
    if (!already && (!S || S.done || !S.stops.length)) startTrip(opts, play === 'daily' ? true : 'weekly');
    else if (!already) toast(`Finish this trip first, then find the ${play} ${play === 'daily' ? 'trip' : 'challenge'} under New trip.`);
    if (window.sa_event) sa_event('opened_shared_' + play);
  }
  setTimeout(() => setTimeout(greetOnBoot, 1400), 30);
  setTimeout(() => { buildSearch(); migrateV1(); backfillStamps(); saveProfile(); renderLeagueChip(); initLeaderboard(); checkAchievements(); bsBackfill(); renderBlindCount(); setTimeout(() => { showNews(false); if (matchMedia('(pointer: fine)').matches && $('entry-input') && !document.querySelector('dialog[open]')) $('entry-input').focus({ preventScroll: true }); }, 900); if (S && !S.done) setMsg(lastMsg.text, lastMsg.cls); if (HOOKS.boot) HOOKS.boot(); }, 30);
  await flagsLoaded;
})();
