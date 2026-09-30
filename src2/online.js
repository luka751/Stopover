// ================= online: race lobbies, leaderboard and profiles (website build only) =================
// A lobby is a room on the server with a four-letter code. The host picks the settings and presses Start: the host's
// browser plans one trip, the server hands it to everyone with a start time, and every browser plays it and reports
// each stop. Races share one tank with no upgrades, and every town scores the same for everyone, but your own
// supplies come with you: a ticket you buy mid-race gets you off the island like it would on a solo trip.
const ONLINE = { ws: null, code: null, state: null, offset: 0, retry: 0, tab: 'race', board: null, boardAt: 0, resultsShown: 0, goShown: 0, cdTimer: 0, planning: false, msg: '', leftRace: '' };
const RACE_MODES = {
  time: { name: 'Fastest arrival', blurb: 'First to the destination wins' },
  points: { name: 'Most points', blurb: 'Best score at the finish wins' },
  distance: { name: 'Shortest route', blurb: 'Fewest kilometres travelled wins' },
  stops: { name: 'Fewest stops', blurb: 'Reach it in the fewest stops' },
};
const RACE_LIMITS = [0, 5, 10, 15, 20, 30];
// an entry fee: everyone who races pays it, and the winner takes the lot; if nobody finishes, everyone gets theirs back
const RACE_STAKES = [0, 50, 100, 250, 500];
const raceStake = () => (ONLINE.state && ONLINE.state.settings.stake) || 0;
const RACE_REGIONS = ['EU', 'AS', 'AF', 'NA', 'SA', 'OC', 'ALL', 'UNCHARTED'];
// A lobby used to carry one continent. It carries a set now, like a solo trip, so a host can race
// Europe + Asia. Older lobbies still send the single `region`, so read either.
const raceRegions = set => {
  const r = Array.isArray(set.regions) && set.regions.length ? set.regions.filter(x => RACE_REGIONS.includes(x)) : [set.region || 'EU'];
  return !r.length ? ['EU'] : r.includes('UNCHARTED') ? ['UNCHARTED'] : r.includes('ALL') ? ['ALL'] : r;
};
// A lobby's settings as the options of a trip. Lobbies from before full race settings carried only a preset,
// so anything missing falls back to what that preset meant.
function raceDraft(set) {
  const preset = PRESETS.find(p => p.id === set.preset) || PRESETS[1];
  return { vehicle: set.vehicle || 'car', voyage: set.voyage || 'coast', ocean: set.ocean || 'any', isle: set.isle ?? null,
    regions: raceRegions(set), skip: Array.isArray(set.skip) ? set.skip : [], length: set.length || 'short',
    from: set.from ?? null, to: set.to ?? null, via: Array.isArray(set.via) ? set.via : [],
    assist: set.assist || preset.assist, rules: migrateRules(set.rules || preset.rules), avoid: Array.isArray(set.avoid) ? set.avoid : [] };
}
const nameInfo = n => (CLOUD && CLOUD.names.parse(n)) || { name: String(n || '?'), color: '#5F6368', emoji: '🧳', fruit: null };
// Nicknames aren't unique, so the username's fruit and colour stay beside them: two players called Luka are
// still a watermelon and a pear. Every server reply that names players fills this cache (nickname, the flag they
// represent, the cover they carry, league and title), and every name on screen reads from it.
// Three kinds of little picture sit near a name, and each has its own shape so they can't be mixed up:
//   the fruit is round, on a disc of the username's colour: it IS the username, and every player has one;
//   the flag is a small framed rectangle: the country the player chose to represent;
//   vehicles (🚗 🚆 and the shop's markers) are never part of a name; they only show on the map and in trip details.
const IDENT = new Map();
function noteNicks(list) {
  for (const x of list || []) {
    if (!x || !x.name) continue;
    const cur = IDENT.get(x.name) || {};
    for (const k of ['nick', 'flair', 'cover', 'league', 'title', 'motto', 'ride', 'fx']) if (k in x) cur[k] = x[k] || null;
    IDENT.set(x.name, cur);
  }
  // your own look comes from your save, which is newer than anything the server has seen
  if (CLOUD && CLOUD.user && G) IDENT.set(CLOUD.user.name, { ...IDENT.get(CLOUD.user.name), ...myIdent() });
}
// ride: the model you drive for each vehicle, which rivals see in a race; fx: your exhaust trail
const myRide = () => { const out = {}; for (const [k] of MODEL_KINDS) { const m = modelFor(k); if (m && P.owned.includes('model:' + m.id)) out[k] = m.id; } return out; };
const myIdent = () => ({ nick: CLOUD.user.nick || null, flair: P.flair || null, cover: P.cover || null, league: leagueOf(explorerRating().total).id, title: myTitle(), motto: myMotto(), ride: myRide(), fx: P.owned.includes('exhaust:' + P.equip.exhaust) ? P.equip.exhaust : null });
const displayName = n => (IDENT.get(n) || {}).nick || nameInfo(n).name;
const flairHtml = cc => { const src = flagSrc('c:' + cc), name = G ? ccName(cc) : cc; return `<span class="flair" title="Representing ${esc(name)}" aria-label="representing ${esc(name)}">${src ? `<img src="${src}" alt="">` : `<b>${emojiFlag(cc)}</b>`}</span>`; };
const fruitHtml = p => `<i class="avfruit" title="${esc(p.name)}${p.fruit ? ` · the ${esc(p.fruit.toLowerCase())} is part of the username` : ''}" aria-hidden="true">${p.emoji}</i>`;
// o.flair: false leaves the flag off (where it would repeat a flag already beside the name)
const unameHtml = (n, cls = '', o = {}) => { const p = nameInfo(n), id = IDENT.get(n) || {}, nick = id.nick;
  return `<span class="uname ${cls}" style="--uc:${p.color}">${fruitHtml(p)}<span class="unametxt" ${nick ? `title="Username: ${esc(p.name)}"` : ''}>${esc(nick || p.name)}</span>${o.flair !== false && id.flair ? flairHtml(id.flair) : ''}</span>`; };
const titleHtml = n => { const t = titleName((IDENT.get(n) || {}).title); return t ? `<span class="ptitle">${esc(t)}</span>` : ''; };
const mottoHtml = n => { const t = mottoText((IDENT.get(n) || {}).motto); return t ? `<span class="motto">“${esc(t)}”</span>` : ''; };
// the passport a player carries, as a thumbnail: their country cover's colour, or their league's
function coverMini(n) {
  const id = IDENT.get(n) || {}, league = LEAGUES.find(l => l.id === id.league) || LEAGUES[0], c = id.cover && COVERS.data && COVERS.data.countries[id.cover];
  const col = c ? coverColour(id.cover) : league.color, ink = c ? '#E3BD5A' : league.ink;
  if (id.cover && !COVERS.data) loadCovers().then(() => refreshOnline());
  return `<span class="minicover" style="--cv:${col};--ci:${ink}" title="${id.cover && G ? `${esc(ccName(id.cover))} cover · ` : ''}${esc(league.name)}" aria-hidden="true"><i></i></span>`;
};
const clock = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
const medal = place => place === 1 ? '🥇' : place === 2 ? '🥈' : place === 3 ? '🥉' : place ? ordinal(place) : '–';
const resultValue = (mode, r) => r.dnf ? (r.gaveUp ? 'Gave up' : 'Did not finish') : mode === 'time' ? clock(r.finishMs) : mode === 'points' ? `${fmt(r.total)} pts` : mode === 'distance' ? `${fmt(r.km)} km` : `${r.stops} ${r.stops === 1 ? 'stop' : 'stops'}`;
const api = (path, opts) => CLOUD.api(path, opts);
// Guests play everything, race in lobbies and see the boards; what other players see of them or what moves coins
// between players (nicknames, board scores, bounties) waits for an account. Guests in a lobby aren't looked up by
// name, since their fruit name isn't theirs to keep.
const isGuest = () => !!(CLOUD && CLOUD.user && CLOUD.user.guest);
const GUESTS = new Set();
const guestNote = what => `<div class="guestnote"><p>${what} <b>Create an account to save your progress</b>: everything you've played as a guest comes with you.</p><button class="btn go small" type="button" data-signup="new">Create account</button><button class="btn small" type="button" data-signup="login">Log in</button></div>`;
// the sign-up card isn't a dialog, so any open dialog steps aside for it
document.addEventListener('click', e => { const b = e.target.closest('[data-signup]'); if (!b || b.closest('#guestbar')) return; document.querySelectorAll('dialog[open]').forEach(d => d.close()); CLOUD.openSignup(b.dataset.signup); });
const inThisRace = () => { const st = ONLINE.state; return !!(S && S.race && st && st.race && S.race.code === st.code && S.race.n === st.race.n); };
const amHost = () => ONLINE.state && ONLINE.state.host === ONLINE.state.me;

// ---- connection
function send(msg) { if (ONLINE.ws && ONLINE.ws.readyState === 1) { ONLINE.ws.send(JSON.stringify(msg)); return true; } return false; }
// the lobby reads your flag and cover from your last save; this tells it about a change you made since
const sendIdent = () => { if (G) { const m = myIdent(); send({ t: 'ident', flair: m.flair, cover: m.cover, league: m.league, title: m.title, motto: m.motto, ride: m.ride, fx: m.fx }); } };
setInterval(() => { if (ONLINE.ws && ONLINE.ws.readyState === 1) ONLINE.ws.send('ping'); }, 25000);
function connect(code) {
  if (ONLINE.ws) { ONLINE.ws.onclose = null; try { ONLINE.ws.close(); } catch {} }
  if (ONLINE.code !== code) ONLINE.state = null;
  ONLINE.code = code; store.set('stopover-lobby', { code });
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/lobby/${code}/ws${CLOUD.wsQuery()}`);
  ONLINE.ws = ws;
  ws.onopen = () => { ONLINE.retry = 0; sendIdent(); };
  ws.onmessage = e => { if (e.data === 'pong') return; let m; try { m = JSON.parse(e.data); } catch { return; } onLobbyMessage(m); };
  ws.onclose = async ev => {
    if (ONLINE.ws !== ws) return;
    ONLINE.ws = null; refreshOnline();
    if (ev.code === 4001) { leaveLocal('You were removed from the lobby.'); return; }
    // a lobby that has closed (or never existed) stops the retries
    const info = await api('/api/lobby/' + code);
    if (ONLINE.code !== code) return;
    if (info.ok && !info.body.exists) { leaveLocal('That lobby has closed.'); return; }
    if (info.status === 401) { leaveLocal('You were logged out.'); return; }
    setTimeout(() => { if (ONLINE.code === code && !ONLINE.ws) connect(code); }, Math.min(15000, 1000 * 2 ** ONLINE.retry++));
  };
  refreshOnline();
}
async function joinLobby(raw) {
  const code = String(raw || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (code.length !== 4) return 'Lobby codes are four letters.';
  const info = await api('/api/lobby/' + code);
  if (!info.ok) return info.body.error || 'Could not reach the server.';
  if (!info.body.exists) return `There's no lobby called ${code}. Check the code with the host.`;
  if (info.body.full) return 'That lobby is full.';
  if (window.sa_event) sa_event('lobby_joined');
  connect(code); return '';
}
function leaveLocal(note) {
  const ws = ONLINE.ws; ONLINE.ws = null; ONLINE.code = null; ONLINE.state = null;
  if (ws) { ws.onclose = null; try { ws.close(); } catch {} }
  store.set('stopover-lobby', null);
  if (S && S.race) { if (!S.done) { finishTrip(true); save(); } backToSolo(); }
  if (note) toast(note);
  refreshOnline(); if (S) render();
}
function leaveLobby() { send({ t: 'leave' }); leaveLocal(''); }

function onLobbyMessage(m) {
  if (m.t === 'error') { toast(m.text); return; }
  if (m.t === 'kicked') { leaveLocal('The host removed you from the lobby.'); return; }
  if (m.t !== 'state') return;
  ONLINE.offset = m.now - Date.now(); ONLINE.state = m; noteNicks(m.players);
  for (const p of m.players) if (p.guest) GUESTS.add(p.name); else GUESTS.delete(p.name);
  const r = m.race, mine = r && r.progress[m.me];
  // a player who finished and went back to their own trip stays there
  if (G && m.phase === 'racing' && mine) { if (inThisRace()) syncRace(m); else if (ONLINE.leftRace !== `${m.code}:${r.n}`) enterRace(m); }
  if (G && m.phase === 'results' && inThisRace()) {
    if (!S.done) { finishTrip(true); save(); tripMap.fit(tripBounds(), false, 56, 130); lastMsg = { text: "Time's up! The green line shows a way you could have finished.", cls: 'bad' }; }
    if (ONLINE.resultsShown !== r.n) { ONLINE.resultsShown = r.n; noteRaceResult(m); render(); showResults(); }
  }
  refreshOnline();
}
// a race you finished goes in your expeditions, and wins count towards Speed Demon and Race Champion
function noteRaceResult(st) {
  const key = `${st.code}:${st.race.n}`, mine = (st.results || []).find(x => x.id === st.me);
  if (!mine || P.lastRaceNoted === key) return;
  P.lastRaceNoted = key; const n = st.results.length;
  if (st.race.stake) {
    const anyone = st.results.some(x => x.place === 1);
    if (mine.place === 1) addCoins(st.race.pot, 'race pot');
    else if (!anyone && (P.racePaid || []).includes(key)) addCoins(st.race.stake, 'entry fee back: nobody finished');
  }
  if (mine.place === 1 && n > 1) { P.feats.raceWins = (P.feats.raceWins || 0) + 1; if (st.race.mode === 'time') P.feats.raceTimeWins = (P.feats.raceTimeWins || 0) + 1; }
  feedAdd({ k: 'race', place: mine.place, of: n, mode: st.race.mode });
}
function refreshOnline() {
  const badge = $('online-count');
  if (badge) { const st = ONLINE.state; badge.hidden = !ONLINE.code; badge.textContent = st ? `${st.code} · ${st.players.length}` : ONLINE.code || ''; }
  if ($('dlg-online') && $('dlg-online').open) renderOnline();
  if (S) renderRacePanel();
  if (S && S.race) tripMap.draw();
}

// ---- race settings: a read-out in the lobby, edited in the same dialog as a solo trip
const RACE_SHOW = { live: ['Live', 'See where everyone is'], hidden: ['Hidden', 'Revealed when you finish'] };
function raceSummaryHtml(set) {
  const o = raceDraft(set), v = VEHICLES[o.vehicle], isles = o.vehicle === 'boat' && o.voyage === 'isles';
  const nm = g => { const i = g == null ? null : G.byGid.get(g); return i == null ? null : `${placeFlag(i)}${esc(G.name[i])}`; };
  const route = [nm(o.from), ...o.via.map(nm), nm(o.to)];
  const routeTxt = o.from == null && o.to == null && !o.via.length ? 'Random' : route.map(x => x || 'Random').join(' → ');
  const preset = PRESETS.find(p => p.assist === o.assist && rulesThatApply(o.vehicle, o.regions).every(k => migrateRules(p.rules)[k] === o.rules[k]));
  const mult = scoreMultiplier(o.rules, o.assist, o.avoid.length, isles ? null : o.regions, o.vehicle) * (isles ? 1.3 : 1);
  const row = (k, val) => `<li><span class="label">${k}</span><span>${val}</span></li>`;
  return `<ul class="racesum">
    ${row('Win by', `${esc(RACE_MODES[set.mode || 'time'].name)} · ${set.limit ? `${set.limit} min` : 'no time limit'} · rivals ${esc(RACE_SHOW[set.show || 'live'][0].toLowerCase())}`)}
    ${row('Trip', `${markerFor(o.vehicle)} ${esc(v.name)} · ${isles ? '🏝️ Far-Flung Isles' : `${esc(regionLabel(o.regions, skipOf(o)))} · ${esc(lengthOf(o.length).name)}`}`)}
    ${row('Route', routeTxt)}
    ${row('Rules', `${preset ? esc(preset.name) : 'Custom'} · ${esc((ASSISTS.find(a => a.id === o.assist) || ASSISTS[0]).name)} · <span class="mult">×${mult.toFixed(2)}</span>`)}
    ${row('Avoiding', o.avoid.length ? o.avoid.map(cc => esc(ccName(cc))).join(', ') : 'No countries')}
    ${row('Entry fee', set.stake ? `💰 ${fmt(set.stake)} coins each · the winner takes the pot${P.coins < set.stake ? ` · <b class="bad">you have ${fmt(P.coins)}</b>` : ''}` : 'Free')}
  </ul>`;
}
function openRaceSetup(st) {
  const race = { draft: raceDraft(st.settings), extra: { mode: st.settings.mode || 'time', limit: st.settings.limit ?? 15, show: st.settings.show || 'live', stake: st.settings.stake || 0 },
    onSave: trip => {
      if (!amHost() || !ONLINE.state || ONLINE.state.phase === 'racing') return toast('Only the host can change the race, and not mid-race.');
      ONLINE.state.settings = { ...ONLINE.state.settings, ...trip, ...race.extra };
      send({ t: 'settings', settings: ONLINE.state.settings }); renderOnline(); toast('Race settings saved');
    } };
  openTripDialog(race);
}
HOOKS.renderRaceSection = (el, race) => {
  const x = race.extra, group = (key, label, items) => `<div class="rulerow"><span class="label">${label}</span><div class="choices">${items.map(([v, name, small]) => `<button type="button" class="choice" data-raceset="${key}" data-v="${v}" aria-pressed="${String(x[key]) === String(v)}">${name}${small ? `<small>${small}</small>` : ''}</button>`).join('')}</div></div>`;
  el.innerHTML = `<details class="fold" open><summary><span class="label">Race</span><span class="foldsum">${esc(RACE_MODES[x.mode].name)} · ${x.limit ? x.limit + ' min' : 'no limit'} · ${esc(RACE_SHOW[x.show][0])}</span></summary>
    <div class="foldbody" style="display:grid;gap:8px">
      ${group('mode', 'Win by', Object.entries(RACE_MODES).map(([id, m]) => [id, m.name, m.blurb]))}
      ${group('limit', 'Time limit', RACE_LIMITS.map(l => [l, l ? `${l} min` : 'No limit']))}
      ${group('show', 'Rivals', Object.entries(RACE_SHOW).map(([id, [n, b]]) => [id, n, b]))}
      ${group('stake', 'Entry fee', RACE_STAKES.map(v => [v, v ? `${v} coins` : 'Free', v ? 'Winner takes the pot' : 'No coins at stake']))}
    </div></details>`;
  el.querySelectorAll('[data-raceset]').forEach(b => b.onclick = () => { const k = b.dataset.raceset; x[k] = k === 'limit' || k === 'stake' ? +b.dataset.v : b.dataset.v; HOOKS.renderRaceSection(el, race); });
};

// ---- the race itself
function planRace(st) {
  const o = raceDraft(st.settings), veh = VEHICLES[o.vehicle];
  if (veh.rail && !RAIL.ready) return { error: 'The rail network is still loading. Try again in a moment.' };
  const keep = RULES;
  try {
    RACE_FAIR = true;
    RULES = migrateRules(o.rules);
    if (veh.rail || veh.coastal) RULES = { ...RULES, planeKm: 0, trainKm: 0 };
    const avoid = new Set(o.avoid.map(cc => G.ccIndex[cc]).filter(x => x != null)), place = g => g == null ? null : G.byGid.get(g) ?? null;
    const picked = { from: place(o.from), to: place(o.to), via: o.via.map(place).filter(x => x != null) };
    const voyage = o.vehicle === 'boat' && o.voyage === 'isles', seed = `race-${st.code}-${Date.now()}`;
    let used = lengthOf(o.length), trip = voyage ? generateVoyage(o, picked, seed, avoid) : generateTrip({ ...o, ...picked }, seed, avoid);
    if (trip && trip.error) return { error: trip.error };
    // a random route that won't fit steps down one length at a time, as a solo trip does
    for (let li = LENGTHS.indexOf(used) - 1; !trip && !voyage && li >= 0 && picked.from == null && picked.to == null; li--) {
      const t = generateTrip({ ...o, ...picked, length: LENGTHS[li].id }, `${seed}-${li}`, avoid);
      if (t && t.error) return { error: t.error };
      if (t) { trip = t; used = LENGTHS[li]; }
    }
    if (!trip) return { error: 'No route turned up for those settings. Try other regions or a different length, or avoid fewer countries.' };
    if (voyage || picked.from != null || picked.to != null || trip.via.length) used = lengthForKm(trip.km, o.vehicle);
    const gid = i => G.gid[i], regions = regionsOf(o), skip = skipOf(o);
    return { trip: { start: gid(trip.start), dest: gid(trip.dest), via: trip.via.map(gid), par: trip.par.map(gid), km: Math.round(trip.km), tickets: trip.tickets, rules: { ...RULES },
      opts: { vehicle: o.vehicle, regions, skip, length: used.id, assist: o.assist, voyage: voyage ? 'isles' : null }, avoid: o.avoid, voyage: trip.voyage || null,
      mult: Math.round(scoreMultiplier(RULES, o.assist, o.avoid.length, voyage ? null : regions, o.vehicle) * (voyage ? 1.3 : 1) * 100) / 100 } };
  } finally { RACE_FAIR = false; RULES = keep; }
}
function buildRaceTrip(m) {
  const r = m.race, spec = r.trip, at = g => G.byGid.get(g);
  const start = at(spec.start), dest = at(spec.dest), via = (spec.via || []).map(at);
  if (start == null || dest == null || via.some(x => x == null)) { toast('This race uses places your copy of the game does not have. Reload the page.'); return null; }
  RULES = migrateRules(spec.rules);
  // a voyage stocks the boat for its crossing, so the tank has to be read with the voyage in place
  const avoid = Array.isArray(spec.avoid) ? spec.avoid : [];
  useVoyage({ voyage: spec.voyage || null, dest });
  RACE_FAIR = true; const v = VEH(spec.opts.vehicle); RACE_FAIR = false;
  return { v: 2, classic: false, daily: null, race: { code: m.code, n: r.n, mode: r.mode }, opts: { ...spec.opts, classic: false, avoid, from: null, to: null, via: [] }, avoid,
    start, dest, via, par: (spec.par || []).map(at).filter(x => x != null), routeKm: spec.km, cur: start, fuel: v.tank, tickets: spec.tickets, ticketsTotal: spec.tickets,
    stops: [], pts: 0, penalties: 0, scouts: [], helps: 0, done: false, gaveUp: false, km: 0, rules: { ...RULES }, mult: spec.mult, mode: 'ground', flights: 0, airKm: 0, flightCoins: 0, voyage: spec.voyage || null };
}
function enterRace(m) {
  const r = m.race, saved = store.get('stopover-race-trip');
  if (S && !S.race) save();
  let next = saved && saved.race && saved.race.code === m.code && saved.race.n === r.n ? saved : buildRaceTrip(m);
  if (!next) return;
  // the entry fee is paid once per race, even through a reload
  const paidKey = `${m.code}:${r.n}`;
  if (r.stake && !(P.racePaid || []).includes(paidKey)) { P.coins = Math.max(0, P.coins - r.stake); P.racePaid = [paidKey, ...(P.racePaid || [])].slice(0, 20); saveProfile(); renderCoins(); toast(`−${r.stake} coins entry fee · pot ${fmt(r.pot)}`); }
  S = next; S.race.startAt = r.startAt - ONLINE.offset; S.race.endAt = r.endAt ? r.endAt - ONLINE.offset : null;
  useVoyage(S); RULES = migrateRules(S.rules); hintIds = S.scouts ? S.scouts.map(s => s.id) : [];
  if (!S.stops.length && !S.done) lastMsg = { text: `Race to ${G.name[S.dest]}${S.via.length ? ` through ${S.via.map(x => G.name[x]).join(', ')}` : ''}. ${RACE_MODES[r.mode].blurb}.`, cls: '' };
  save();
  document.querySelectorAll('dialog[open]').forEach(d => d.close());
  render(); tripMap.fit(tripBounds(), true, 56, 130);
  startCountdown(); syncRace(m);
}
// after a lost connection, tell the server what happened while it couldn't hear us
function syncRace(m) {
  const mine = m.race.progress[m.me]; if (!mine || mine.done || mine.gaveUp) return;
  if (S.done) { if (S.gaveUp) send({ t: 'giveup' }); else sendFinish(); }
  else if (S.stops.length > mine.stops) sendProgress();
}
const sendProgress = () => send({ t: 'progress', stops: S.stops.length, cur: G.gid[S.cur], km: Math.round(S.km), pts: S.pts - S.penalties });
const sendFinish = () => send({ t: 'finish', stops: S.stops.length, cur: G.gid[S.cur], km: Math.round(S.km), pts: S.pts, total: S.total });
function backToSolo() {
  if (S && S.race) ONLINE.leftRace = `${S.race.code}:${S.race.n}`;
  store.set('stopover-race-trip', null);
  const saved = store.get('stopover-trip');
  if (saved && saved.v === 2 && !saved.race && saved.start < G.n && saved.dest < G.n) {
    S = saved; useVoyage(S); RULES = migrateRules(S.rules); hintIds = S.scouts ? S.scouts.map(s => s.id) : [];
    lastMsg = { text: S.done ? '' : `Back on your own trip. You're in ${G.name[S.cur]}.`, cls: '' };
    render(); tripMap.fit(tripBounds(), true, 56, 130);
  } else { S = null; if (!startTrip(opts, false)) startTrip({ ...opts, vehicle: 'car', regions: ['EU'], length: 'short', avoid: [], from: null, to: null, via: [] }, false); }
}
function startCountdown() {
  clearInterval(ONLINE.cdTimer);
  let el = $('race-countdown');
  if (!el) { el = document.createElement('div'); el.id = 'race-countdown'; el.className = 'racecount'; el.setAttribute('aria-live', 'assertive'); $('map').parentElement.appendChild(el); }
  const tick = () => {
    if (!S || !S.race) { el.hidden = true; clearInterval(ONLINE.cdTimer); return; }
    const left = S.race.startAt - Date.now();
    if (left > 0) { el.hidden = false; el.innerHTML = `<b>${Math.ceil(left / 1000)}</b><span>${esc(G.name[S.start])} → ${esc(G.name[S.dest])}</span>`; }
    else if (left > -1500) {
      el.hidden = false; el.innerHTML = '<b>Go!</b>';
      if (ONLINE.goShown !== S.race.n) { ONLINE.goShown = S.race.n; render(); const i = $('entry-input'); if (i) i.focus(); }
    } else { el.hidden = true; clearInterval(ONLINE.cdTimer); if (ONLINE.goShown !== S.race.n) { ONLINE.goShown = S.race.n; render(); } }
  };
  tick(); ONLINE.cdTimer = setInterval(tick, 200);
}
// the standings above the sign, with the race clock
function raceRows(st) {
  const r = st.race, metric = { time: p => p.finishMs, points: p => -p.total, distance: p => p.km, stops: p => p.stops }[r.mode];
  const rows = r.entrants.map(id => ({ id, name: r.names[id] || (st.players.find(x => x.id === id) || {}).name || '?', ...r.progress[id] }));
  return [...rows.filter(p => p.done).sort((a, b) => metric(a) - metric(b) || a.finishMs - b.finishMs), ...rows.filter(p => !p.done).sort((a, b) => (a.gaveUp - b.gaveUp) || b.stops - a.stops)];
}
function renderRacePanel() {
  let el = $('race-panel');
  if (!el) { el = document.createElement('div'); el.id = 'race-panel'; el.className = 'racepanel'; $('sign').before(el); }
  if (!S || !S.race) { el.hidden = true; return; }
  el.hidden = false;
  const st = ONLINE.state;
  if (!inThisRace()) { el.innerHTML = `<div class="racehead"><b>🏁 Race ${esc(S.race.code)}</b><span class="hint">${ONLINE.code ? 'Reconnecting…' : 'Lobby closed'}</span></div>`; return; }
  const r = st.race, rows = raceRows(st);
  el.innerHTML = `<div class="racehead"><b>🏁 ${esc(RACE_MODES[r.mode].name)}</b>${r.stake ? `<span class="chip warn">💰 Pot ${fmt(r.pot)}</span>` : ''}<span class="raceclock" id="race-clock"></span><button class="btn small" type="button" id="race-lobby">Lobby ${esc(st.code)}</button></div>
    <ol class="racerows">${rows.map((p, i) => `<li class="${p.id === st.me ? 'me' : ''} ${p.done ? 'done' : ''} ${p.gaveUp ? 'out' : ''}"><span class="place">${p.done ? medal(i + 1) : ''}</span>${coverMini(p.name)}${unameHtml(p.name)}<span class="racestat">${p.done ? `🏁 ${esc(resultValue(r.mode, { ...p, dnf: false }))}` : p.gaveUp ? 'gave up' : `${p.stops} ${p.stops === 1 ? 'stop' : 'stops'} · ${fmt(p.km)} km${r.mode === 'points' ? ` · ${fmt(p.pts)} pts` : ''}`}</span></li>`).join('')}</ol>`;
  $('race-lobby').onclick = () => openOnline('race');
  updateRaceClock();
}
function updateRaceClock() {
  const el = $('race-clock'); if (!el || !S || !S.race || !S.race.startAt) return;
  const now = Date.now(), st = ONLINE.state;
  if (st && st.phase === 'results') el.textContent = 'Finished';
  else if (now < S.race.startAt) el.textContent = `Starts in ${Math.ceil((S.race.startAt - now) / 1000)}`;
  else if (S.race.endAt) { const left = S.race.endAt - now; el.textContent = `⏱ ${clock(left)} left`; el.classList.toggle('low', left < 60000); }
  else el.textContent = `⏱ ${clock(now - S.race.startAt)}`;
}
setInterval(updateRaceClock, 500);
function showResults() {
  ensureOnlineDialogs();
  const st = ONLINE.state; if (!st || !st.results) return;
  if ($('dlg-online').open) $('dlg-online').close();
  $('results-body').innerHTML = resultsHtml(st);
  $('results-lobby').onclick = () => { $('dlg-results').close(); openOnline('race'); };
  $('results-solo').onclick = () => { $('dlg-results').close(); if (S && S.race && S.done) backToSolo(); };
  if (!$('dlg-results').open) $('dlg-results').showModal();
}
function resultsHtml(st) {
  const mode = st.race ? st.race.mode : 'time', winner = st.results.find(x => x.place === 1);
  return `<section>${winner ? `<p class="resultwin">${winner.id === st.me ? '🏆 You won!' : `🏆 ${unameHtml(winner.name)} won`}</p>` : '<p class="hint">Nobody reached the destination.</p>'}
    <ol class="results">${st.results.map(x => `<li class="${x.id === st.me ? 'me' : ''}"><span class="place">${medal(x.place)}</span><span class="resname">${coverMini(x.name)}<button type="button" class="linkish" data-profile="${esc(x.name)}">${unameHtml(x.name)}</button></span><span class="val">${esc(resultValue(mode, x))}</span><small>${x.dnf ? '' : `${x.stops} stops · ${fmt(x.km)} km · ${fmt(x.total || 0)} pts`}</small></li>`).join('')}</ol>
    <p class="hint" style="margin:10px 0 0">${esc(RACE_MODES[mode].name)}.${st.race && st.race.stake ? ` ${winner ? `The pot of ${fmt(st.race.pot)} coins went to ${winner.id === st.me ? 'you' : esc(displayName(winner.name))}.` : 'Nobody finished, so every entry fee went back.'}` : ''} Coins, flags and places from the race are yours to keep.</p></section>`;
}

// ---- the Online dialog: race lobby, leaderboard, account
function ensureOnlineDialogs() {
  if ($('dlg-online')) return;
  document.body.insertAdjacentHTML('beforeend', `
<dialog id="dlg-online"><div class="dlg">
  <header><div><h2>Online</h2><p>Race your friends, check the leaderboard, manage your account.</p></div><button class="x" type="button" data-close aria-label="Close">×</button></header>
  <div class="tabs onlinetabs" role="tablist">${[['race', '🏁 Race'], ['board', '🏆 Leaderboard'], ['bounty', '🎯 Bounties'], ['account', '👤 Account']].map(([id, n]) => `<button type="button" role="tab" data-otab="${id}">${n}</button>`).join('')}</div>
  <div id="online-body"></div>
</div></dialog>
<dialog id="dlg-profile"><div class="dlg">
  <header><div><h2 id="profile-title">Player</h2><p id="profile-sub"></p></div><button class="x" type="button" data-close aria-label="Close">×</button></header>
  <div id="profile-body"></div>
</div></dialog>
<dialog id="dlg-results"><div class="dlg">
  <header><div><h2>Race results</h2></div><button class="x" type="button" data-close aria-label="Close">×</button></header>
  <div id="results-body"></div>
  <footer><button class="btn" type="button" id="results-solo">Back to my trip</button><button class="btn go" type="button" id="results-lobby">Back to the lobby</button></footer>
</div></dialog>`);
  for (const id of ['dlg-online', 'dlg-profile', 'dlg-results']) $(id).addEventListener('click', e => {
    if (e.target === $(id) || e.target.closest('[data-close]')) { $(id).close(); return; }
    const p = e.target.closest('[data-profile]'); if (p) openProfile(p.dataset.profile);
  });
  $('dlg-online').querySelectorAll('[data-otab]').forEach(b => b.onclick = () => { ONLINE.tab = b.dataset.otab; renderOnline(); });
}
function openOnline(tab) {
  ensureOnlineDialogs(); if (tab) ONLINE.tab = tab;
  renderOnline(); if (!$('dlg-online').open) $('dlg-online').showModal();
}
function renderOnline() {
  $('dlg-online').querySelectorAll('[data-otab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.otab === ONLINE.tab)));
  const body = $('online-body');
  if (ONLINE.tab === 'board') return renderBoard(body);
  if (ONLINE.tab === 'account') return renderAccount(body);
  if (ONLINE.tab === 'bounty') return renderBounties(body);
  renderLobby(body);
}
function renderLobby(body) {
  const st = ONLINE.state;
  if (!ONLINE.code) {
    body.innerHTML = `<section><div class="label">Start a race</div><p class="hint" style="margin:6px 0 10px">Make a lobby and share its code. Everyone gets the same trip at the same moment and the same tank. Your own supplies still work, so a ferry ticket can save a race. Up to 8 players.</p>
        <button class="btn go" type="button" id="lob-create">Create a lobby</button></section>
      <section><div class="label">Join a race</div><form class="joinrow" id="lob-join"><input class="field lobbyinput" id="lob-code" maxlength="4" placeholder="ABCD" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Lobby code"><button class="btn go" type="submit">Join</button></form>
        <div class="msg bad" id="lob-msg">${esc(ONLINE.msg)}</div></section>`;
    ONLINE.msg = '';
    $('lob-create').onclick = async e => {
      e.currentTarget.disabled = true; e.currentTarget.textContent = 'Creating…';
      const r = await api('/api/lobby', { method: 'POST', body: '{}' });
      if (r.ok) connect(r.body.code); else { ONLINE.msg = r.body.error || 'Could not create a lobby.'; renderOnline(); }
    };
    $('lob-join').onsubmit = async e => { e.preventDefault(); const err = await joinLobby($('lob-code').value); if (err) { $('lob-msg').textContent = err; } };
    $('lob-code').oninput = e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); };
    return;
  }
  if (!st) { body.innerHTML = `<section><p class="hint">Connecting to lobby ${esc(ONLINE.code)}…</p><button class="btn small" type="button" id="lob-leave">Cancel</button></section>`; $('lob-leave').onclick = leaveLobby; return; }
  const host = amHost(), set = st.settings, racing = st.phase === 'racing', ready = st.players.filter(p => p.ready || p.id === st.host).length;
  const me = st.players.find(p => p.id === st.me) || {};
  body.innerHTML = `
    <section class="lobbyhead"><div><div class="label">Lobby code</div><div class="lobbycode">${esc(st.code)}</div><p class="hint" style="margin:4px 0 0">Friends join with this code in Online → Race.${ONLINE.ws ? '' : ' <b>Reconnecting…</b>'}</p></div>
      <div class="tools"><button class="btn small" type="button" id="lob-copy">Copy code</button><button class="btn small" type="button" id="lob-leave">Leave lobby</button></div></section>
    <section><div class="label">Players · ${st.players.length}/8</div><ul class="lobbyplayers">${st.players.map(p => `<li>
      ${coverMini(p.name)}<span class="lobbyname">${p.guest && p.id !== st.me ? unameHtml(p.name) : `<button type="button" class="linkish" data-profile="${esc(p.name)}">${unameHtml(p.name)}</button>`}${p.id === st.me ? ' <span class="hint">(you)</span>' : ''}${p.guest ? ' <span class="chip guestchip">Guest</span>' : ''}${titleHtml(p.name)}${mottoHtml(p.name)}</span>
      <span class="lobbytags">${p.id === st.host ? '<span class="chip">👑 Host</span>' : ''}${!p.online ? '<span class="chip">Offline</span>' : p.id === st.host ? '' : p.ready && set.stake && !p.canPay ? '<span class="chip warn">💰 Can\'t pay the fee</span>' : p.ready ? '<span class="chip good">✓ Ready</span>' : '<span class="chip">Not ready</span>'}${host && p.id !== st.me && !racing ? `<button class="btn small" type="button" data-kick="${p.id}">Remove</button>` : ''}</span></li>`).join('')}</ul></section>
    ${racing ? `<section><div class="label">Race in progress</div><p class="hint" style="margin:6px 0 0">${st.race && st.race.progress[st.me] ? 'You are in this race.' : "You joined after the start, so you'll be in the next race."}</p></section>` : ''}
    ${st.phase === 'results' && st.results ? `<section><div class="label">Last race</div>${resultsHtml(st).replace(/^<section>|<\/section>$/g, '')}</section>` : ''}
    <section><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><div class="label">Race settings${host ? '' : ' · the host picks'}</div>${host && !racing ? '<button class="btn small" type="button" id="lob-edit">Edit race settings</button>' : ''}</div>
      ${raceSummaryHtml(set)}
    </section>
    <footer>
      ${racing ? (st.race && st.race.progress[st.me] ? `<button class="btn go" type="button" id="lob-go">Back to the race</button>${host ? '<button class="btn" type="button" id="lob-end">End the race now</button>' : ''}` : '')
        : host ? `<span class="hint" style="margin-right:auto">${ready}/${st.players.length} ready</span><button class="btn go" type="button" id="lob-start" ${ONLINE.planning ? 'disabled' : ''}>${ONLINE.planning ? 'Planning the route…' : st.phase === 'results' ? 'Start another race' : 'Start the race'}</button>`
        : `<span class="hint" style="margin-right:auto">Waiting for the host to start</span><button class="btn ${me.ready ? '' : 'go'}" type="button" id="lob-ready">${me.ready ? 'Not ready' : "I'm ready"}</button>`}
    </footer>`;
  $('lob-leave').onclick = leaveLobby;
  $('lob-copy').onclick = async () => { try { await navigator.clipboard.writeText(st.code); toast('Code copied'); } catch { toast(`The code is ${st.code}`); } };
  if ($('lob-edit')) $('lob-edit').onclick = () => openRaceSetup(st);
  body.querySelectorAll('[data-kick]').forEach(b => b.onclick = () => send({ t: 'kick', id: +b.dataset.kick }));
  if ($('lob-ready')) $('lob-ready').onclick = () => { if (!me.ready && P.coins < raceStake()) toast(`The entry fee is ${raceStake()} coins and you have ${fmt(P.coins)}. You can watch this one.`); send({ t: 'ready', on: !me.ready, pay: P.coins >= raceStake() }); };
  if ($('lob-go')) $('lob-go').onclick = () => $('dlg-online').close();
  if ($('lob-end')) $('lob-end').onclick = e => { const b = e.currentTarget; if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Tap again to end it'; return; } send({ t: 'end' }); };
  if ($('lob-start')) $('lob-start').onclick = () => {
    if (!G || !searchIndex) { toast('The atlas is still loading.'); return; }
    if (S && S.race && !S.done) { toast('Finish or give up your race first.'); return; }
    ONLINE.planning = true; renderOnline();
    // let the button repaint before the route search blocks for a moment
    setTimeout(() => {
      const plan = planRace(ONLINE.state); ONLINE.planning = false;
      if (plan.error) { toast(plan.error); renderOnline(); return; }
      if (P.coins < raceStake()) { toast(`The entry fee is ${raceStake()} coins and you have ${fmt(P.coins)}. Lower it to start.`); renderOnline(); return; }
      if (!send({ t: 'start', trip: plan.trip, pay: true })) toast('Not connected to the lobby. Try again in a moment.');
      renderOnline();
    }, 60);
  };
}
// ---- the leaderboard: one category at a time, with the players you follow ranked in it wherever they are
const BOARD_CATS = [
  { id: 'flags', name: '🚩 Flags', col: 'Flags', blurb: 'Ranked by flags collected.' },
  { id: 'rating', name: '📈 Rating', col: 'Rating', blurb: 'Ranked by explorer rating: recent trips, places known and flags.' },
  { id: 'places', name: '📍 Places known', col: 'Places', blurb: 'Ranked by places known, from trips and Study.' },
  { id: 'countries', name: '🛂 Countries', col: 'Countries', blurb: 'Ranked by countries stamped.' },
  { id: 'wins', name: '🏁 Race wins', col: 'Wins', blurb: 'Ranked by races won against at least one other player.' },
  { id: 'EU', name: 'Europe', col: 'Places', blurb: 'Top European explorers: places known in Europe.' },
  { id: 'AS', name: 'Asia', col: 'Places', blurb: 'Top Asian explorers: places known in Asia.' },
  { id: 'AF', name: 'Africa', col: 'Places', blurb: 'Top African explorers: places known in Africa.' },
  { id: 'NA', name: 'North America', col: 'Places', blurb: 'Top North American explorers: places known there.' },
  { id: 'SA', name: 'South America', col: 'Places', blurb: 'Top South American explorers: places known there.' },
  { id: 'OC', name: 'Oceania', col: 'Places', blurb: 'Top explorers of Oceania: places known there.' },
];
ONLINE.by = 'flags'; ONLINE.boards = {};
const rivals = () => (P.rivals || []).filter(n => nameInfo(n).fruit);
function toggleRival(name) {
  const list = rivals();
  if (list.includes(name)) P.rivals = list.filter(n => n !== name);
  else if (list.length >= 30) { toast('You can follow 30 players. Unfollow someone first.'); return false; }
  else P.rivals = [...list, name];
  saveProfile(); ONLINE.boards = {}; toast(P.rivals.includes(name) ? `Following ${displayName(name)}` : `Stopped following ${displayName(name)}`);
  return true;
}
async function loadBoard(force, by = ONLINE.by) {
  const have = ONLINE.boards[by];
  if (!force && have && Date.now() - have.at < 20000) return have;
  const r = await api(`/api/leaderboard?by=${by}&also=${rivals().join(',')}`);
  if (r.ok) { ONLINE.boards[by] = { ...r.body, at: Date.now() }; noteNicks([...r.body.rows, ...(r.body.pinned || []), ...(r.body.me ? [r.body.me] : [])]); }
  return ONLINE.boards[by];
}
const starBtn = n => n === CLOUD.user.name ? '<span class="rowtools"></span>' : `<span class="rowtools"><button type="button" class="iconbtn" data-rival="${esc(n)}" aria-pressed="${rivals().includes(n)}" title="${rivals().includes(n) ? 'Stop following' : 'Follow: keep them on your Following board'}">${rivals().includes(n) ? '★' : '☆'}</button><button type="button" class="iconbtn" data-pass="${esc(n)}" title="Open their passport">📖</button></span>`;
function wireBoardRows(body, redraw) {
  body.querySelectorAll('[data-rival]').forEach(b => b.onclick = () => { if (toggleRival(b.dataset.rival)) redraw(); });
  body.querySelectorAll('[data-pass]').forEach(b => b.onclick = () => openPassportOf(b.dataset.pass));
}
// ---- daily and weekly boards
const CHAL = { kind: 'flags', boards: {}, posted: {} };
const periodOf = kind => kind === 'daily' ? new Date().toISOString().slice(0, 10) : isoWeek();
async function loadChallenge(kind, force) {
  const period = periodOf(kind), key = kind + ':' + period, have = CHAL.boards[key];
  if (have && !force && Date.now() - have.at < 20000) return have;
  const r = await api(`/api/board/${kind}/${period}`);
  if (r.ok) { noteNicks(r.body.rows); CHAL.boards[key] = { ...r.body, at: Date.now() }; }
  return CHAL.boards[key];
}
async function postChallenge() {
  const kind = S.weekly ? 'weekly' : 'daily', period = S.weekly || S.daily, key = kind + ':' + period;
  if (isGuest()) { CHAL.posted[key] = 'guest'; refreshChallengeLine(); return; }
  CHAL.posted[key] = 'posting'; refreshChallengeLine();
  const squares = shareText().split('\n')[2] || '';
  const r = await api('/api/score', { method: 'POST', body: JSON.stringify({ kind, period, total: S.total, km: Math.round(S.km), stops: S.stops.length, squares }) });
  if (r.ok) { noteNicks(r.body.rows); CHAL.boards[key] = { ...r.body, at: Date.now() }; CHAL.posted[key] = 'done'; } else CHAL.posted[key] = r.body.error || 'failed';
  refreshChallengeLine();
}
function challengeLine() {
  const kind = S.weekly ? 'weekly' : 'daily', key = kind + ':' + (S.weekly || S.daily), st = CHAL.posted[key], b = CHAL.boards[key];
  const label = kind === 'weekly' ? 'this week' : 'today';
  if (st === 'posting') return 'Posting your score to the board…';
  if (st === 'guest') return `Guest scores don't go on the board. <button type="button" class="linkish" data-signup="new"><b>Create an account</b></button> to be ranked ${label}.`;
  if (st === 'done' && b && b.rank) return `${b.rank <= 3 ? medal(b.rank) : '📊'} #${b.rank} of ${b.players} ${label}${b.mine !== S.total ? ` · your first run (${fmt(b.mine)} pts) is the one that counts` : ''} · <button type="button" class="linkish" data-openboard="${kind}">see the board</button>`;
  if (st && st !== 'done') return `The board didn't take this one: ${esc(st)}`;
  return '';
}
function refreshChallengeLine() { const el = $('chal-rank'); if (el) el.innerHTML = challengeLine(); }
// the finish card is redrawn often, so its "see the board" link is handled once, here
document.addEventListener('click', e => { const b = e.target.closest('[data-openboard]'); if (b) { CHAL.kind = b.dataset.openboard; openOnline('board'); } });
function renderBoard(body) {
  if (CHAL.kind === 'daily' || CHAL.kind === 'weekly') return renderChallengeBoard(body);
  const following = CHAL.kind === 'following', cat = BOARD_CATS.find(c => c.id === ONLINE.by) || BOARD_CATS[0], b = ONLINE.boards[cat.id], me = CLOUD.user.name;
  const catSel = `<div class="catrow"><label class="label" for="board-cat">Category</label><select class="field" id="board-cat">
      <optgroup label="Everywhere">${BOARD_CATS.slice(0, 5).map(c => `<option value="${c.id}" ${c.id === cat.id ? 'selected' : ''}>${c.name}</option>`).join('')}</optgroup>
      <optgroup label="Top explorers of a continent">${BOARD_CATS.slice(5).map(c => `<option value="${c.id}" ${c.id === cat.id ? 'selected' : ''}>${c.name}</option>`).join('')}</optgroup></select></div>`;
  const row = (x, rank, extra = '') => `<tr class="${x.name === me ? 'me' : ''} ${rivals().includes(x.name) ? 'rival' : ''}"><td>${rank <= 3 ? medal(rank) : rank}</td><td><button type="button" class="linkish" data-profile="${esc(x.name)}">${unameHtml(x.name)}</button></td><td><b>${fmt(x.score)}</b>${extra}</td><td class="wide">${esc((LEAGUES.find(l => l.id === x.league) || LEAGUES[0]).name)}</td><td>${starBtn(x.name)}</td></tr>`;
  const head = `<thead><tr><th>#</th><th>Player</th><th>${esc(cat.col)}</th><th class="wide">League</th><th></th></tr></thead>`;
  let table = '<p class="hint">Loading…</p>';
  if (b && following) {
    const people = [...(b.pinned || []), ...(b.me ? [b.me] : [])].sort((x, y) => x.rank - y.rank || x.name.localeCompare(y.name));
    const mine = b.me ? b.me.score : 0;
    const vs = x => { if (x.name === me) return ' <small class="hint">you</small>'; const d = x.score - mine; return ` <small class="${d > 0 ? 'ahead' : d < 0 ? 'behind' : 'hint'}">${d > 0 ? `${fmt(d)} ahead` : d < 0 ? `${fmt(-d)} behind` : 'level'}</small>`; };
    table = rivals().length ? `<table class="board">${head}<tbody>${people.map(x => row(x, x.rank, vs(x))).join('')}</tbody></table>`
      : `<p class="hint">Nobody yet. Tap ☆ beside a player on the leaderboard, or Follow on their profile, and they'll be ranked here next to you in every category.</p>`;
  } else if (b) {
    table = b.rows.length ? `<table class="board">${head}<tbody>${b.rows.map((x, i) => row(x, i + 1)).join('')}</tbody></table>` : '<p class="hint">Nobody on this board yet.</p>';
    if (b.me && isGuest()) table += `<p class="hint" style="margin:8px 0 0">Guests aren't ranked. With ${fmt(b.me.score)} you'd be #${fmt(b.me.rank)}. <button type="button" class="linkish" data-signup="new"><b>Create an account</b></button> to take your place.</p>`;
    else if (b.me && !b.rows.some(x => x.name === me)) table += `<p class="hint" style="margin:8px 0 0">You're #${fmt(b.me.rank)} with ${fmt(b.me.score)}.</p>`;
  }
  body.innerHTML = `${boardSwitch()}<section>${catSel}<p class="hint" style="margin:8px 0 10px">${following ? `The players you follow, ranked by ${esc(cat.id.length === 2 ? `places known in ${cat.name}` : cat.name.replace(/^\S+\s/, '').toLowerCase())}. ` : esc(cat.blurb) + ' '}Tap a name for their profile, 📖 for their passport.</p>${table}</section>`;
  $('board-cat').onchange = e => { ONLINE.by = e.target.value; renderBoard(body); };
  wireBoardSwitch(body); wireBoardRows(body, () => renderBoard(body));
  if (!b || Date.now() - b.at > 20000) loadBoard(false, cat.id).then(nb => { if (nb && nb !== b && $('dlg-online').open && ONLINE.tab === 'board' && ONLINE.by === cat.id) renderBoard(body); });
}
const boardSwitch = () => `<div class="seg boardseg" role="group" aria-label="Which board">${[['flags', '🌍 Global'], ['following', `⭐ Following${rivals().length ? ` · ${rivals().length}` : ''}`], ['daily', '📅 Today'], ['weekly', '🏔️ This week']].map(([k, n]) => `<button type="button" data-board="${k}" aria-pressed="${CHAL.kind === k}">${n}</button>`).join('')}</div>`;
function wireBoardSwitch(body) { body.querySelectorAll('[data-board]').forEach(b => b.onclick = () => { CHAL.kind = b.dataset.board; renderBoard(body); }); }
function renderChallengeBoard(body) {
  const kind = CHAL.kind, period = periodOf(kind), b = CHAL.boards[kind + ':' + period], weekly = kind === 'weekly';
  const played = weekly ? P.lastWeekly === period : P.lastDaily === period;
  body.innerHTML = `${boardSwitch()}<section>
    <p class="hint" style="margin:0 0 10px">${weekly ? `The weekly challenge, ${period}: an Epic car trip from memory under hard rules, the same for everyone until Monday.` : `Today's daily trip, ${period}: the same trip for everyone.`} Your first finished run is the one that counts.</p>
    ${isGuest() ? `<div style="margin-bottom:10px">${guestNote("You can play it, but guest scores don't go on the board.")}</div>` : ''}
    ${played ? '' : `<div class="tools" style="margin-bottom:10px"><button class="btn go" type="button" id="board-play">${weekly ? "Play this week's challenge" : "Play today's trip"}</button></div>`}
    ${!b ? '<p class="hint">Loading…</p>' : !b.rows.length ? `<p class="hint">Nobody has finished it yet. The top spot is open.</p>` : `<table class="board"><thead><tr><th>#</th><th>Player</th><th>Points</th><th class="wide">Route</th></tr></thead><tbody>${b.rows.map((x, i) => `<tr class="${x.me ? 'me' : ''}"><td>${i < 3 ? medal(i + 1) : i + 1}</td><td><button type="button" class="linkish" data-profile="${esc(x.name)}">${unameHtml(x.name)}</button></td><td><b>${fmt(x.total)}</b><small class="hint"> · ${fmt(x.km)} km</small></td><td class="wide" style="letter-spacing:1px">${esc(x.squares || '')}</td></tr>`).join('')}</tbody></table>`}
    ${b && b.rank ? `<p class="hint" style="margin:8px 0 0">You're #${b.rank} of ${b.players}.</p>` : ''}</section>`;
  wireBoardSwitch(body);
  if ($('board-play')) $('board-play').onclick = () => { $('dlg-online').close(); startTrip(opts, weekly ? 'weekly' : true); };
  body.querySelectorAll('[data-profile]').forEach(x => x.onclick = () => openProfile(x.dataset.profile));
  if (!b || Date.now() - b.at > 20000) loadChallenge(kind).then(() => { if ($('dlg-online').open && ONLINE.tab === 'board' && CHAL.kind === kind) renderChallengeBoard(body); });
}

// ---- crowns: who knows each country best
const CROWNS = { data: null, at: 0 };
async function loadCrowns(force) {
  if (!force && CROWNS.data && Date.now() - CROWNS.at < 60000) return;
  const r = await api('/api/crowns'); if (!r.ok) return;
  CROWNS.data = r.body.crowns; CROWNS.at = Date.now();
  noteNicks(Object.values(CROWNS.data));
  // tell the player what changed since they last looked: crowns won, and crowns taken from them
  const me = CLOUD.user.name, held = Object.keys(CROWNS.data).filter(cc => CROWNS.data[cc].name === me), before = P.crownsHeld;
  if (Array.isArray(before)) {
    const won = held.filter(cc => !before.includes(cc)), lost = before.filter(cc => !held.includes(cc));
    for (const cc of won) { tick(`👑 You now hold the crown of <b>${esc(ccName(cc))}</b>`); feedAdd({ k: 'crown', cc }); }
    for (const cc of lost) { const c = CROWNS.data[cc]; tick(`👑 ${c ? `<b>${esc(c.nick || nameInfo(c.name).name)}</b> took` : 'You lost'} your crown of <b>${esc(ccName(cc))}</b>`); }
    if (won.length) sfx('crown');
  }
  if (JSON.stringify(before) !== JSON.stringify(held)) { P.crownsHeld = held; saveProfile(); }
  if ($('dlg-passport').open) { renderPassport(); ppMap.draw(); }
}
function renderAccount(body) {
  const u = CLOUD.user;
  if (u.guest) {
    body.innerHTML = `<section><div class="label">Playing as a guest</div><div style="margin:8px 0">${unameHtml(u.name, 'big')}</div>
        <p class="hint" style="margin:0 0 10px">This guest lasts until you close this tab. Then it's deleted, with everything you've played.</p>
        ${guestNote('Want to keep your flags, coins and trips, and play on any computer or phone?')}</section>`;
    return;
  }
  body.innerHTML = `<section><div class="label">Logged in as</div><div style="margin:8px 0">${unameHtml(u.name, 'big')}</div>
      <p class="hint" style="margin:0 0 10px">Your progress saves to this account by itself. Log in on any computer or phone to carry on.</p>
      <div class="tools"><button class="btn" type="button" data-profile="${esc(u.name)}">See my profile</button><button class="btn" type="button" id="acc-logout">Log out</button></div></section>
    <section><div class="label">Change password</div>
      <form class="authform" id="acc-pass" style="margin-top:8px"><input type="text" autocomplete="username" value="${esc(u.name)}" hidden>
        <label><span class="label">Current password</span><input class="field" type="password" id="acc-old" autocomplete="current-password" required></label>
        <label><span class="label">New password</span><input class="field" type="password" id="acc-new" autocomplete="new-password" minlength="6" required></label>
        <label><span class="label">New password again</span><input class="field" type="password" id="acc-new2" autocomplete="new-password" minlength="6" required></label>
        <div><button class="btn go" type="submit">Change password</button></div>
      </form><div class="msg" id="acc-msg"></div></section>
    ${CLOUD.emailOn() || u.email ? '<section><div class="label">Email</div><div id="acc-email"></div></section>' : ''}
    <section><details class="fold"><summary><span class="label">Delete account</span></summary><div class="foldbody">
      <p class="hint" style="margin:0 0 8px">This deletes <b>${esc(u.name)}</b> and everything saved on it: flags, coins, stamps, trips, scores and races. It can't be undone.</p>
      <form class="authform" id="acc-del"><input type="text" autocomplete="username" value="${esc(u.name)}" hidden>
        <label><span class="label">Your password</span><input class="field" type="password" id="acc-delpass" autocomplete="current-password" required></label>
        <div><button class="btn danger" type="submit">Delete my account forever</button></div></form><div class="msg" id="acc-delmsg"></div></div></details></section>`;
  renderEmail();
  $('acc-del').onsubmit = async e => {
    e.preventDefault(); const m = $('acc-delmsg');
    if (!confirm(`Delete ${u.name} and all its progress for good?`)) return;
    m.className = 'msg'; m.textContent = 'Deleting…';
    const r = await api('/api/account/delete', { method: 'POST', body: JSON.stringify({ key: await CLOUD.passwordKey(u.name, $('acc-delpass').value) }) });
    if (r.ok) { if (ONLINE.code) leaveLobby(); CLOUD.blocked = true; location.replace('/'); return; }
    m.className = 'msg bad'; m.textContent = r.body.error || 'Could not delete it.';
  };
  $('acc-logout').onclick = () => { if (ONLINE.code) leaveLobby(); CLOUD.logout(); };
  $('acc-pass').onsubmit = async e => {
    e.preventDefault(); const m = $('acc-msg'), nw = $('acc-new').value;
    if (nw !== $('acc-new2').value) { m.className = 'msg bad'; m.textContent = 'The two new passwords are different.'; return; }
    m.className = 'msg'; m.textContent = 'Saving…';
    const r = await api('/api/password', { method: 'POST', body: JSON.stringify({ old: await CLOUD.passwordKey(u.name, $('acc-old').value), key: await CLOUD.passwordKey(u.name, nw) }) });
    m.className = 'msg ' + (r.ok ? 'good' : 'bad'); m.textContent = r.ok ? 'Password changed. Other devices were logged out.' : r.body.error || 'Could not change it.';
    if (r.ok) e.target.reset();
  };
}

// the email on the account: confirmed, waiting for its link, or none. It's only for password resets, and never shown to anyone else.
function renderEmail() {
  const box = $('acc-email'); if (!box) return;
  const u = CLOUD.user;
  box.innerHTML = `${u.email ? `<p style="margin:8px 0 4px">✓ <b>${esc(u.email)}</b> is confirmed.</p>` : ''}
    ${u.emailPending ? `<p class="hint" style="margin:8px 0 4px">We sent a link to <b>${esc(u.emailPending)}</b>. Click it to confirm${u.email ? ' the change' : ''}. Check spam if it isn't there.</p>` : ''}
    ${!u.email && !u.emailPending ? '<p class="hint" style="margin:8px 0 4px">No email yet. Add one so you can reset your password if you forget it. Nobody else sees it.</p>' : ''}
    <form class="authform" id="acc-emailform" style="margin-top:8px"><input type="text" autocomplete="username" value="${esc(u.name)}" hidden>
      <label><span class="label">Email address</span><input class="field" id="acc-emailin" type="email" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="you@example.com" value="${esc(u.emailPending || '')}" required></label>
      <label><span class="label">Your password</span><input class="field" id="acc-emailpw" type="password" autocomplete="current-password" required></label>
      <div class="tools"><button class="btn go" type="submit">${u.emailPending ? 'Send again' : u.email ? 'Change email' : 'Add email'}</button>${u.email || u.emailPending ? '<button class="btn" type="button" id="acc-emailrm">Remove email</button>' : ''}</div></form>
    <p class="hint" style="margin:6px 0 0">Changing or removing the email takes your password, so nobody who finds you logged in can take the account.</p>
    <div class="msg" id="acc-emailmsg"></div>`;
  const m = $('acc-emailmsg'), key = async () => CLOUD.passwordKey(u.name, $('acc-emailpw').value);
  $('acc-emailform').onsubmit = async e => {
    e.preventDefault(); m.className = 'msg'; m.textContent = 'Sending…';
    const r = await api('/api/email', { method: 'POST', body: JSON.stringify({ email: $('acc-emailin').value, key: await key() }) });
    if (!r.ok) { m.className = 'msg bad'; m.textContent = r.body.error || 'Could not send it.'; return; }
    u.emailPending = r.body.pending; renderEmail();
  };
  if ($('acc-emailrm')) $('acc-emailrm').onclick = async () => {
    if (!$('acc-emailpw').value) { m.className = 'msg bad'; m.textContent = 'Type your password to remove the email.'; $('acc-emailpw').focus(); return; }
    const r = await api('/api/email/remove', { method: 'POST', body: JSON.stringify({ key: await key() }) });
    if (!r.ok) { m.className = 'msg bad'; m.textContent = r.body.error || 'Could not remove it.'; return; }
    u.email = u.emailPending = null; renderEmail();
  };
}

// ---- profiles
// what the profile endpoint sends back, shaped like the parts of a save the Passport reads
const passportOf = (pr, x = {}) => ({ visits: pr.visits || {}, study: pr.study || {}, flagsSeen: pr.flagsSeen || {}, stamps: pr.stamps || {}, history: pr.history || [],
  achievements: pr.achievements || {}, trips: pr.trips || 0, km: pr.km || 0, ferries: pr.ferries || 0, feats: pr.feats || {}, cover: pr.cover || null,
  equip: pr.equip || {}, flagStreak: pr.flagStreak || null, flagSets: pr.flagSets || {}, holo: pr.holo || {},
  showcase: pr.showcase || [], feed: pr.feed || [], title: x.title || null, flair: x.flair || null, motto: x.motto || null });
// straight to someone's passport, from a leaderboard row or a race
const guestProfile = name => { if (name === CLOUD.user.name || !GUESTS.has(name)) return false; toast(`${nameInfo(name).name} is playing as a guest, so there's no profile to open.`); return true; };
async function openPassportOf(name, tab) {
  if (guestProfile(name)) return;
  if (name === CLOUD.user.name) { if ($('dlg-online').open) $('dlg-online').close(); openPassport(null); return; }
  const r = await api('/api/profile/' + encodeURIComponent(name));
  if (!r.ok) { toast(r.body.error || 'Could not open that passport.'); return; }
  noteNicks([r.body]);
  document.querySelectorAll('dialog[open]').forEach(d => d.close());
  openPassport({ name: r.body.name, label: displayName(r.body.name), data: passportOf(r.body.profile, r.body) }, tab);
}
function nickEditorHtml(id) {
  if (isGuest()) return `<section class="nickedit"><div class="label">How other players see you</div>${guestNote('Guests play under their fruit name. A nickname, a flag and a title come with an account.')}</section>`;
  const u = CLOUD.user, p = nameInfo(u.name), been = new Set(Object.keys(P.stamps || {}).filter(k => !k.startsWith('area:')));
  const all = G.countries.map(c => c[0]).filter(cc => flagEntry('c:' + cc) || emojiFlag(cc)).sort((a, b) => ccName(a).localeCompare(ccName(b)));
  const titles = titlesEarned(), mine = myTitle();
  return `<section class="nickedit"><div class="label">How other players see you</div>
    <div class="idpreview">${unameHtml(u.name, 'big')}${titleHtml(u.name)}</div>
    <p class="hint" style="margin:6px 0 10px"><span class="avfruit sample" style="--uc:${p.color}">${p.emoji}</span> The round fruit badge is your username, <b>${esc(u.name)}</b>, and always stays, so two players with the same nickname can be told apart. <span class="flair sample">${P.flair ? `<b>${emojiFlag(P.flair)}</b>` : '<b>🏳️</b>'}</span> The framed flag is the country you represent. Vehicles never appear beside names.</p>
    <form class="nickrow" id="${id}-nickform"><label class="label" for="${id}-nick" style="flex-basis:100%">Nickname</label><input class="field" id="${id}-nick" maxlength="24" placeholder="${esc(u.name)}" value="${esc(u.nick || '')}" aria-label="Nickname" autocomplete="off" spellcheck="false">
      <button class="btn go" type="submit">Save</button>${u.nick ? `<button class="btn" type="button" id="${id}-nickclear">Use ${esc(u.name)}</button>` : ''}</form>
    <div class="msg" id="${id}-nickmsg"></div>
    <div class="idgrid">
      <label><span class="label">Representing</span><select class="field" id="${id}-flair"><option value="">No flag</option>
        ${been.size ? `<optgroup label="Countries you've stamped">${all.filter(cc => been.has(cc)).map(cc => `<option value="${cc}" ${P.flair === cc ? 'selected' : ''}>${emojiFlag(cc)} ${esc(ccName(cc))}</option>`).join('')}</optgroup>` : ''}
        <optgroup label="Every country">${all.map(cc => `<option value="${cc}" ${P.flair === cc && !been.has(cc) ? 'selected' : ''}>${emojiFlag(cc)} ${esc(ccName(cc))}</option>`).join('')}</optgroup></select></label>
      <label><span class="label">Title · ${titles.length} earned</span><select class="field" id="${id}-title"><option value="">No title</option>${titles.map(t => `<option value="${esc(t.id)}" ${mine === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
    </div>
    <details class="fold titlelist"><summary><span class="label">Titles to earn · ${TITLES.length - titles.filter(t => !t.id.startsWith('spec:')).length} left</span></summary><div class="foldbody"><ul class="list">${TITLES.filter(t => !titles.some(e => e.id === t.id)).map(t => `<li><span>${esc(t.name)}</span><span class="hint">${esc(t.desc)}</span></li>`).join('')}<li><span>&lt;Country&gt; Specialist</span><span class="hint">Reach Native mastery (60 places) in a country.</span></li></ul></div></details>
  </section>`;
}
// flag and title are part of your save; the lobby you're in is told straight away
function setLook(k, v) {
  if (v) P[k] = v; else delete P[k];
  saveProfile(); applyLook();
}
function applyLook() {
  noteNicks([]);
  if ($('btn-me')) $('btn-me').innerHTML = unameHtml(CLOUD.user.name);
  sendIdent(); if (ONLINE.state) { renderRacePanel(); if ($('dlg-online').open) renderOnline(); }
}
async function setNick(nick) {
  const bad = nick && CLOUD.names.nickProblem && CLOUD.names.nickProblem(nick);
  if (bad) return bad;
  const r = await api('/api/nick', { method: 'POST', body: JSON.stringify({ nick }) });
  if (!r.ok) return r.body.error || 'Could not save that nickname.';
  CLOUD.user.nick = r.body.nick; noteNicks([CLOUD.user]);
  if ($('btn-me')) $('btn-me').innerHTML = unameHtml(CLOUD.user.name);
  if (ONLINE.state) renderRacePanel();
  return null;
}
function wireNickEditor(id, after) {
  if (!$(id + '-nickform')) return;
  const say = (text, cls) => { const m = $(id + '-nickmsg'); if (m) { m.className = 'msg ' + cls; m.textContent = text; } };
  // the form redraws itself after a save, so the confirmation goes into the new one
  const done = async () => { if (after) await after(); say(CLOUD.user.nick ? `Players now see you as ${CLOUD.user.nick}.` : 'Players see your username again.', 'good'); };
  $(id + '-flair').onchange = e => { setLook('flair', e.target.value); if (after) after(); };
  $(id + '-title').onchange = e => { setLook('title', e.target.value); if (after) after(); };
  $(id + '-nickform').onsubmit = async e => { e.preventDefault(); say('Saving…', ''); const err = await setNick($(id + '-nick').value); if (err) say(err, 'bad'); else done(); };
  if ($(id + '-nickclear')) $(id + '-nickclear').onclick = async () => { const err = await setNick(''); if (err) say(err, 'bad'); else done(); };
}
async function openProfile(name) {
  if (guestProfile(name)) return;
  ensureOnlineDialogs();
  $('profile-title').innerHTML = unameHtml(name, 'big'); $('profile-sub').textContent = ''; $('profile-body').innerHTML = '<section><p class="hint">Loading…</p></section>';
  if (!$('dlg-profile').open) $('dlg-profile').showModal();
  const r = await api('/api/profile/' + encodeURIComponent(name));
  if (!r.ok) { $('profile-body').innerHTML = `<section><p class="msg bad">${esc(r.body.error || 'Could not load this profile.')}</p></section>`; return; }
  noteNicks([r.body]);
  $('profile-title').innerHTML = unameHtml(r.body.name, 'big') + titleHtml(r.body.name) + mottoHtml(r.body.name);
  renderProfile(r.body);
}
function ago(t) { const m = Math.round((Date.now() - t) / 60000); return m < 2 ? 'just now' : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; }
function renderProfile(x, showAll) {
  const pr = x.profile, league = LEAGUES.find(l => l.id === x.league) || LEAGUES[0], cat = flagCatalog();
  const mine = CLOUD.user && x.name === CLOUD.user.name;
  $('profile-sub').textContent = mine && isGuest() ? 'Guest · not on the leaderboard · deleted when you close this tab'
    : `${x.nick ? `@${x.name} · ` : ''}${x.flair ? `representing ${ccName(x.flair)} · ` : ''}#${x.rank} on the leaderboard · joined ${new Date(x.created).toLocaleDateString()} · seen ${ago(x.seen)}`;
  const other = passportOf(pr, x), show = showcaseOf(mine ? P : other, x.name), title = titleName(mine ? myTitle() : x.title), following = rivals().includes(x.name);
  const keys = Object.keys(pr.flagsSeen), flags = cat ? keys.map(k => cat.byKey.get(k)).filter(Boolean) : [];
  const rarity = RARITY.map((r, i) => flags.filter(f => f.rarity === i).length), kinds = FLAG_KINDS.map(k => flags.filter(f => f.kind === k.id).length);
  flags.sort((a, b) => b.rarity - a.rarity || pr.flagsSeen[b.key] - pr.flagsSeen[a.key]);
  const shown = showAll ? flags : flags.slice(0, 48);
  const countries = Object.keys(pr.stamps).filter(k => !k.startsWith('area:')), visas = Object.keys(pr.stamps).filter(k => k.startsWith('area:'));
  const stat = (label, value) => `<div class="stat"><span class="label">${label}</span><b>${value}</b></div>`;
  $('profile-body').innerHTML = `
    <section class="profilehead"><div class="profilecover">${coverWithShowcase(coverSvg({ ...((pr.cover && COVERS.data && countryCover(pr.cover, league)) || { color: league.color, ink: league.ink, emblem: league.emblem, title: league.title, top: 'STOPOVER' }), bottom: displayName(x.name).toUpperCase(), sub: title, finish: finishOf(mine ? P : other) }), show)}
        <span class="pfleague" style="--lc:${league.color}" title="League · rating ${fmt(x.rating)}"><i></i>${esc(league.name)}</span></div>
      <div class="stats profilestats">${stat('🚩 Flags', fmt(x.flags))}${stat('League', esc(league.name))}${stat('Rating', fmt(x.rating))}${stat('Trips', fmt(pr.trips))}${stat('Distance', fmt(pr.km) + ' km')}${stat('Places known', fmt(x.places))}${stat('Countries', fmt(countries.length))}${stat('Races won', `${fmt(x.wins)}<small class="hint"> / ${fmt(x.races)}</small>`)}${stat('Achievements', fmt(Object.keys(pr.achievements || {}).length))}</div></section>
    ${HOOKS.crownsOf(x.name).length ? `<section><div class="label">👑 Crowns · ${HOOKS.crownsOf(x.name).length}</div><p class="hint" style="margin:4px 0 8px">Countries where nobody knows more places.</p><div class="tagrow">${HOOKS.crownsOf(x.name).sort((a, b) => ccName(a).localeCompare(ccName(b))).map(cc => `<span class="tag">${countryFlag(cc)}${esc(ccName(cc))} <small class="hint">${fmt(CROWNS.data[cc].n)}</small></span>`).join('')}</div></section>` : ''}
    <section class="pfpassport"><button class="btn go big" type="button" id="pf-passport">📖 Open ${mine ? 'your' : `${esc(displayName(x.name))}'s`} passport</button>${mine ? '' : '<button class="btn big" type="button" id="pf-compare">⚖️ Compare with me</button>'}<span class="hint">Mastery map, stamps, country covers, the full flag collection, stats and trips${mine ? '' : ', just as they see them'}.</span></section>
    ${mine ? '' : `<section class="pfactions"><button class="btn" type="button" id="pf-follow" aria-pressed="${following}">${following ? '★ Following' : '☆ Follow'}</button><span class="hint">${following ? 'On your Following board.' : 'Keep them on your Following board to track where you stand.'}</span>${x.nick ? '<button class="btn small" type="button" id="pf-report">Report nickname</button>' : ''}<span class="msg" id="pf-reportmsg"></span></section>`}
    ${show.length ? `<section><div class="label">Showcase</div>${showcaseListHtml(show)}</section>` : ''}
    ${(mine ? P.feed || [] : other.feed).length ? `<section><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><div class="label">Recent expeditions</div>${(mine ? P.feed || [] : other.feed).length > 5 ? '<button class="btn small" type="button" id="pf-feed">See all</button>' : ''}</div>${feedHtml(mine ? P.feed : other.feed, 5)}</section>` : ''}
    ${mine ? nickEditorHtml('pf') : ''}
    <section><div class="label">Flag collection · ${esc(flagRankOf(keys.length).name)}</div>
      ${cat ? `<div class="raritychips" style="margin:8px 0">${RARITY.map((r, i) => `<span style="--rc:${r.color}"><i></i>${r.name} <b>${fmt(rarity[i])}</b></span>`).join('')}</div>
      <p class="hint" style="margin:0 0 8px">${FLAG_KINDS.map((k, i) => `${fmt(kinds[i])} ${k.name.toLowerCase()}`).join(' · ')}</p>
      ${shown.length ? `<div class="flaggrid">${shown.map(f => { const src = flagSrc(f.key), rr = RARITY[f.rarity]; return `<div class="flagtile r${f.rarity}" style="--rc:${rr.color}" title="${esc(f.label)} · ${rr.name}">${f.rarity === 4 ? '<span class="shine"></span>' : ''}${src ? `<img src="${src}" alt="" loading="lazy">` : '<span class="unknown">?</span>'}<em><i></i>${rr.name}</em><span>${esc(f.label)}</span></div>`; }).join('')}</div>
        ${flags.length > shown.length ? `<div class="tools" style="margin-top:8px"><button class="btn small" type="button" id="pf-all">Show all ${fmt(flags.length)} flags</button></div>` : ''}` : '<p class="hint">No flags yet.</p>'}`
      : '<p class="hint">Flags are still loading.</p>'}</section>
    ${countries.length ? `<section><div class="label">Countries stamped · ${countries.length}${visas.length ? ` · ${visas.length} visas` : ''}</div><div class="tagrow">${countries.sort((a, b) => ccName(a).localeCompare(ccName(b))).map(cc => `<span class="tag">${countryFlag(cc)}${esc(ccName(cc))}</span>`).join('')}</div></section>` : ''}
    ${pr.history.length ? `<section><div class="label">Recent trips</div><ul class="list profiletrips">${pr.history.map(h => { const d = G.byGid.get(h.dest); return `<li><span>${(VEHICLES[h.vehicle] || VEHICLES.car).icon} ${d != null ? `${placeFlag(d)}${esc(G.name[d])}` : 'A trip'} <small class="hint">${esc(lengthOf(h.length).name)} · ${fmt(h.km)} km · ${new Date(h.t).toLocaleDateString()}</small></span><b>${fmt(h.total)} pts</b></li>`; }).join('')}</ul></section>` : ''}
    ${x.recentRaces.length ? `<section><div class="label">Recent races</div><ul class="list profiletrips">${x.recentRaces.map(r => `<li><span>${esc((RACE_MODES[r.mode] || RACE_MODES.time).name)} <small class="hint">${new Date(r.finished).toLocaleDateString()}</small></span><b>${r.place ? `${medal(r.place)} of ${r.players}` : 'Did not finish'}</b></li>`).join('')}</ul></section>` : ''}`;
  if (pr.cover && !COVERS.data) loadCovers().then(() => { if ($('dlg-profile').open && $('pf-passport')) renderProfile(x, showAll); });
  if ($('pf-all')) $('pf-all').onclick = () => renderProfile(x, true);
  const theirs = tab => openPassport({ name: x.name, label: displayName(x.name), data: other }, tab);
  $('pf-passport').onclick = () => mine ? openPassport(null) : theirs();
  if ($('pf-compare')) $('pf-compare').onclick = () => theirs('compare');
  if ($('pf-feed')) $('pf-feed').onclick = () => { if (!mine) return theirs('feed'); openPassport(null); ppTab = 'feed'; renderPassport(); ppMap.draw(); };
  if ($('pf-follow')) $('pf-follow').onclick = () => { if (toggleRival(x.name)) renderProfile(x, showAll); };
  if ($('pf-report')) $('pf-report').onclick = async e => {
    const b = e.currentTarget, m = $('pf-reportmsg');
    if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Tap again to report'; m.className = 'msg'; m.textContent = `Report "${x.nick}" as offensive? Three reports take a nickname down.`; return; }
    b.disabled = true;
    const r = await api('/api/report', { method: 'POST', body: JSON.stringify({ name: x.name }) });
    m.className = 'msg ' + (r.ok ? 'good' : 'bad');
    m.textContent = !r.ok ? r.body.error || 'Could not send the report.' : r.body.removed ? 'Thanks. That nickname has been taken down.' : 'Thanks. The report is in.';
    b.textContent = 'Reported';
  };
  if (mine) wireNickEditor('pf', () => openProfile(x.name));
}

// ---- bounties: coins put up on a route you finished, for whoever beats your score on it first
// The route is fixed (same start, same destination, same vehicle and rules), so it's you against their best.
const BOUNTY_REWARDS = [100, 250, 500, 1000, 2000];
const BOUNTY = { data: null, at: 0, posting: false, msg: '' };
async function loadBounties(force) {
  if (!force && BOUNTY.data && Date.now() - BOUNTY.at < 20000) return BOUNTY.data;
  const r = await api('/api/bounties'); if (!r.ok) return BOUNTY.data;
  BOUNTY.data = r.body; BOUNTY.at = Date.now();
  noteNicks([...r.body.open, ...r.body.mine].flatMap(b => [b.poster, b.target, b.claimer].filter(Boolean)));
  settleBounties();
  return BOUNTY.data;
}
// your own bounties that ran out come back to you, and the ones someone beat are announced, each once
async function settleBounties() {
  const seen = P.bountySeen = P.bountySeen || [];
  for (const b of BOUNTY.data.mine) {
    if (b.claimer && !seen.includes(b.id)) { seen.push(b.id); tick(`🎯 <b>${esc(displayName(b.claimer.name))}</b> beat your ${fmt(b.beat)} and took your ${fmt(b.reward)}-coin bounty`); }
    else if (!b.claimer && !b.refunded && b.expires < Date.now()) {
      const r = await api(`/api/bounty/${b.id}/refund`, { method: 'POST', body: '{}' });
      if (r.ok) { b.refunded = true; addCoins(r.body.reward, 'bounty ran out unclaimed'); }
    }
  }
  P.bountySeen = seen.slice(-80); saveProfile();
}
const bountyRoute = spec => { const a = G.byGid.get(spec.from), b = G.byGid.get(spec.to); return a == null || b == null ? null : { a, b }; };
const daysLeft = t => { const d = Math.ceil((t - Date.now()) / 864e5); return d <= 1 ? 'last day' : `${d} days left`; };
function bountyLine(b) {
  const r = bountyRoute(b.spec), v = VEHICLES[b.spec.vehicle];
  if (!r) return '';
  const preset = PRESETS.find(p => p.assist === b.spec.assist && Object.entries(migrateRules(p.rules)).every(([k, x]) => migrateRules(b.spec.rules)[k] === x));
  return `${placeFlag(r.a)}<b>${esc(G.name[r.a])}</b> → ${placeFlag(r.b)}<b>${esc(G.name[r.b])}</b> <small class="hint">${v.icon} ${esc(v.name)} · ${esc(lengthOf(b.spec.length).name)} · ${preset ? esc(preset.name) : 'custom'} rules</small>`;
}
function renderBounties(body) {
  const d = BOUNTY.data;
  const openRow = b => `<li class="bounty"><div><div>${bountyLine(b)}</div><small>Beat ${unameHtml(b.poster.name)}'s <b>${fmt(b.beat)} pts</b>${b.target ? ` · <b>just for you</b>` : ''} · ${daysLeft(b.expires)}</small></div>
      <span class="reward">💰 ${fmt(b.reward)}</span>${isGuest() ? '' : `<button class="btn small go" type="button" data-attempt="${b.id}">Take it on</button>`}</li>`;
  const mineRow = b => `<li class="bounty mine"><div><div>${bountyLine(b)}</div><small>Your ${fmt(b.beat)} pts${b.target ? ` · for ${unameHtml(b.target.name)}` : ''} · ${b.claimer ? `beaten by ${unameHtml(b.claimer.name)} with ${fmt(b.claimTotal)}` : b.refunded ? 'ran out, coins returned' : daysLeft(b.expires)}</small></div><span class="reward">💰 ${fmt(b.reward)}</span></li>`;
  body.innerHTML = `${isGuest() ? `<section>${guestNote('Guests can look, but taking on and posting bounties needs an account.')}</section>` : ''}<section><p class="hint" style="margin:0 0 10px">Finish a trip and you can put coins on its route from the finish card. Whoever first beats your score on the same route, with the same vehicle and rules, takes them. Unclaimed bounties come back to you after 7 days.</p>
      ${!d ? '<p class="hint">Loading…</p>' : d.open.length ? `<ul class="bounties">${d.open.map(openRow).join('')}</ul>` : '<p class="hint">No open bounties right now. Post the first one from your next finished trip.</p>'}</section>
    ${d && d.mine.length ? `<section><div class="label">Your bounties</div><ul class="bounties">${d.mine.map(mineRow).join('')}</ul></section>` : ''}`;
  body.querySelectorAll('[data-attempt]').forEach(b => b.onclick = () => attemptBounty(d.open.find(x => x.id === +b.dataset.attempt)));
  if (!d || Date.now() - BOUNTY.at > 20000) loadBounties(true).then(() => { if ($('dlg-online').open && ONLINE.tab === 'bounty') renderBounties(body); });
}
function attemptBounty(b) {
  if (!b || !bountyRoute(b.spec)) { toast('That route uses places your copy of the game does not have. Reload the page.'); return; }
  const o = { ...opts, vehicle: b.spec.vehicle, length: b.spec.length, from: b.spec.from, to: b.spec.to, via: [], avoid: [], rules: b.spec.rules, assist: b.spec.assist, classic: false, voyage: 'coast' };
  if (!startTrip(o, false)) return;
  S.bounty = { id: b.id, beat: b.beat, reward: b.reward, poster: b.poster.name };
  save(); render(); $('dlg-online').close();
  setMsg(`🎯 Bounty: beat ${displayName(b.poster.name)}'s ${fmt(b.beat)} points from ${G.name[S.start]} to ${G.name[S.dest]} for ${fmt(b.reward)} coins.`, 'good');
}
async function claimBounty() {
  const b = S.bounty; if (!b || b.result) return;
  if (S.total <= b.beat) { b.result = `${fmt(S.total)} didn't beat ${fmt(b.beat)}. Take it on again from the Bounties tab.`; save(); render(); return; }
  b.result = 'Checking the bounty…'; render();
  const r = await api(`/api/bounty/${b.id}/claim`, { method: 'POST', body: JSON.stringify({ total: S.total }) });
  if (r.ok && r.body.ok) { addCoins(r.body.reward, 'bounty claimed'); feedAdd({ k: 'bounty', reward: r.body.reward, dest: G.gid[S.dest] }); b.result = `💰 You beat ${displayName(b.poster)} and took ${fmt(r.body.reward)} coins.`; sfx('crown'); }
  else b.result = r.body.error || "The bounty couldn't be claimed.";
  BOUNTY.at = 0; save(); if (S.bounty === b) render();
}
// the finish card: a bounty's result, or the offer to put one on the route you just drove
const canPostBounty = () => !isGuest() && S && S.done && !S.gaveUp && !S.race && !S.daily && !S.weekly && !S.stakes && !S.bounty && !S.voyage && !S.classic && !S.posted;
HOOKS.finishExtra = () => {
  if (S.bounty) return `<p class="chalrank">🎯 ${esc(S.bounty.result || 'Checking the bounty…')}</p>`;
  if (S.posted) return `<p class="chalrank">🎯 Your ${fmt(S.posted)}-coin bounty is up. See it in Online → Bounties.</p>`;
  if (!canPostBounty()) return '';
  const can = BOUNTY_REWARDS.filter(x => x <= P.coins);
  return `<details class="fold bountypost"><summary><span class="label">🎯 Put a bounty on this route</span></summary><div class="foldbody">
    <p class="hint" style="margin:0 0 8px">Whoever first beats your ${fmt(S.total)} points from ${esc(G.name[S.start])} to ${esc(G.name[S.dest])}, with the same vehicle and rules, takes the coins. If nobody does in 7 days, they come back.</p>
    ${can.length ? `<div class="bountyform"><label><span class="label">Reward</span><select class="field" id="bp-reward">${can.map(x => `<option value="${x}">${fmt(x)} coins</option>`).join('')}</select></label>
      <label><span class="label">Open to</span><select class="field" id="bp-target"><option value="">Anyone</option>${rivals().map(n => `<option value="${esc(n)}">${esc(displayName(n))} only</option>`).join('')}</select></label>
      <button class="btn go" type="button" id="bp-post">Post the bounty</button></div>` : `<p class="hint">You need at least ${BOUNTY_REWARDS[0]} coins.</p>`}
    <div class="msg bad" id="bp-msg"></div></div></details>`;
};
HOOKS.wireFinishExtra = () => {
  if (!$('bp-post')) return;
  $('bp-post').onclick = async e => {
    const reward = +$('bp-reward').value, target = $('bp-target').value || null;
    if (P.coins < reward) return;
    e.currentTarget.disabled = true;
    const spec = { from: G.gid[S.start], to: G.gid[S.dest], vehicle: S.opts.vehicle, length: S.opts.length, rules: S.rules, assist: S.opts.assist || 'explorer' };
    const r = await api('/api/bounty', { method: 'POST', body: JSON.stringify({ spec, beat: S.total, reward, target }) });
    if (!r.ok || !r.body.ok) { $('bp-msg').textContent = r.body.error || 'Could not post it.'; e.currentTarget.disabled = false; return; }
    P.coins -= reward; saveProfile(); renderCoins(); S.posted = reward; save(); BOUNTY.at = 0; render();
    toast(`Bounty posted · −${reward} coins`);
  };
};

// ---- hooks into the game
if (CLOUD) {
  HOOKS.online = true;
  HOOKS.afterTravel = () => { if (S.race) sendProgress(); };
  HOOKS.afterFinish = gaveUp => {
    if (S.race) { if (gaveUp) send({ t: 'giveup' }); else sendFinish(); }
    if (!gaveUp && (S.daily || S.weekly)) postChallenge();
    if (!gaveUp && S.bounty) claimBounty();
    // the save carries this trip's knowledge; crowns are re-read once it has landed
    Promise.resolve(CLOUD.flush()).then(() => loadCrowns(true));
  };
  HOOKS.greetName = () => CLOUD.user.nick || nameInfo(CLOUD.user.name).name;
  HOOKS.challengeLine = challengeLine;
  HOOKS.crownOf = cc => { const c = CROWNS.data && CROWNS.data[cc]; return c ? { who: c.nick || nameInfo(c.name).name, name: c.name, n: c.n, mine: c.name === CLOUD.user.name } : null; };
  HOOKS.crownsOf = name => CROWNS.data ? Object.keys(CROWNS.data).filter(cc => CROWNS.data[cc].name === name) : [];
  HOOKS.crownsReady = () => !!CROWNS.data;
  HOOKS.publishScore = () => CLOUD.flush();
  HOOKS.render = () => {
    renderRacePanel();
    // the entry box stays shut until the race starts
    const input = $('entry-input');
    if (input && S.race && !S.done && Date.now() < S.race.startAt) { input.disabled = true; input.placeholder = 'Get ready…'; const go = document.querySelector('#entry-form .go'); if (go) go.disabled = true; }
  };
  HOOKS.finishedButtons = () => `<div class="tools">${ONLINE.state && ONLINE.state.phase === 'results' && inThisRace() ? '<button class="btn go" type="button" id="race-results">Race results</button>' : '<span class="hint">Waiting for the others to finish…</span>'}<button class="btn" type="button" id="race-back-lobby">Back to the lobby</button><button class="btn" type="button" id="race-solo">Back to my trip</button></div>`;
  HOOKS.wireFinished = () => {
    if ($('race-results')) $('race-results').onclick = showResults;
    $('race-back-lobby').onclick = () => openOnline('race');
    $('race-solo').onclick = backToSolo;
  };
  HOOKS.mapLayer = (m, ctx, pal, tryLabel) => {
    if (!inThisRace()) return;
    const st = ONLINE.state, r = st.race;
    // rivals drive the model they chose for this vehicle, and glide between the stops they report
    for (const id of r.entrants) {
      const p = r.progress[id]; if (id === st.me || p.cur == null) continue;
      const who = nameInfo(r.names[id]), look = IDENT.get(r.names[id]) || {};
      drawRival(m, ctx, pal, id, p.cur, S.opts.vehicle, { color: who.color, emoji: who.emoji, label: displayName(r.names[id]), ride: look.ride || {}, fx: look.fx || null, done: p.done }, tryLabel);
    }
  };
  HOOKS.renderLeaderboard = el => {
    const rows = ONLINE.boards.flags && ONLINE.boards.flags.rows;
    el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px"><div class="label">Leaderboard · flags</div><button class="btn small" type="button" id="pp-board">Full leaderboard</button></div>
      ${rows ? `<ol class="list" style="list-style:decimal;padding-left:20px">${rows.slice(0, 5).map(x => `<li style="display:list-item"><span style="display:flex;justify-content:space-between;gap:8px">${unameHtml(x.name)}<span>🚩 ${fmt(x.flags)}</span></span></li>`).join('')}</ol>` : '<p class="hint" style="margin:0">Loading…</p>'}`;
    $('pp-board').onclick = () => openOnline('board');
    if (!rows) loadBoard(false, 'flags').then(() => { if ($('leaderboard')) HOOKS.renderLeaderboard($('leaderboard')); });
  };
  HOOKS.lookChanged = () => applyLook();
  HOOKS.boot = () => {
    noteNicks([CLOUD.user]);
    const setDlg = $('dlg-settings') && $('dlg-settings').querySelector('.dlg header');
    const drawSetNick = () => { $('set-nicksec').innerHTML = nickEditorHtml('set'); wireNickEditor('set', drawSetNick); };
    if (setDlg && !$('set-nicksec')) { setDlg.insertAdjacentHTML('afterend', '<div id="set-nicksec"></div>'); drawSetNick(); }
    P.playerName = CLOUD.user.name; saveProfile();
    CLOUD.summary = () => { const r = explorerRating(), k = countryKnowledge(), known = {}, cont = {}; k.forEach((n, i) => { if (n > 0) { known[G.countries[i][0]] = n; const c = G.contOf[i]; cont[c] = (cont[c] || 0) + n; } });
      return { rating: r.total, league: leagueOf(r.total).id, places: r.known, countries: Object.keys(P.stamps || {}).filter(k => !k.startsWith('area:')).length, known, cont,
        flair: P.flair || null, cover: P.cover || null, title: myTitle() }; };
    loadCrowns();
    const nav = document.querySelector('header.bar nav');
    nav.insertAdjacentHTML('afterbegin', `<button class="btn go icon" id="btn-online" type="button" title="Race your friends" aria-label="Race">🏁<span class="count" id="online-count" hidden></span></button>`);
    nav.insertAdjacentHTML('beforeend', `<button class="btn mebtn" id="btn-me" type="button" title="Your profile">${unameHtml(CLOUD.user.name)}</button>`);
    $('btn-online').onclick = () => openOnline(ONLINE.code ? 'race' : ONLINE.tab);
    $('btn-me').onclick = () => openProfile(CLOUD.user.name);
    // a race or lobby from before a reload carries on
    const lob = store.get('stopover-lobby');
    if (lob && lob.code) joinLobby(lob.code).then(err => { if (err) { store.set('stopover-lobby', null); if (store.get('stopover-race-trip')) { store.set('stopover-race-trip', null); } } });
    else if (store.get('stopover-race-trip')) store.set('stopover-race-trip', null);
    loadBoard(false, 'flags');
    loadBounties();
  };
}
