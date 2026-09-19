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
const nameInfo = n => (CLOUD && CLOUD.names.parse(n)) || { name: String(n || '?'), color: '#5F6368', emoji: '🧳' };
// Nicknames aren't unique, so the username's fruit and colour stay beside them: two players called Luka are
// still a watermelon and a pear. Every server reply that names players fills this cache, and every name on
// screen reads from it, so a nickname shows up everywhere without each screen having to ask for it.
const NICKS = new Map();
const noteNicks = list => { for (const x of list || []) if (x && x.name) { if (x.nick) NICKS.set(x.name, x.nick); else NICKS.delete(x.name); } };
const displayName = n => NICKS.get(n) || nameInfo(n).name;
const unameHtml = (n, cls = '') => { const p = nameInfo(n), nick = NICKS.get(n); return `<span class="uname ${cls}" style="--uc:${p.color}" ${nick ? `title="Username: ${esc(p.name)}"` : ''}><i aria-hidden="true">${p.emoji}</i>${esc(nick || p.name)}</span>`; };
const clock = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
const medal = place => place === 1 ? '🥇' : place === 2 ? '🥈' : place === 3 ? '🥉' : place ? ordinal(place) : '–';
const resultValue = (mode, r) => r.dnf ? (r.gaveUp ? 'Gave up' : 'Did not finish') : mode === 'time' ? clock(r.finishMs) : mode === 'points' ? `${fmt(r.total)} pts` : mode === 'distance' ? `${fmt(r.km)} km` : `${r.stops} ${r.stops === 1 ? 'stop' : 'stops'}`;
const api = (path, opts) => CLOUD.api(path, opts);
const inThisRace = () => { const st = ONLINE.state; return !!(S && S.race && st && st.race && S.race.code === st.code && S.race.n === st.race.n); };
const amHost = () => ONLINE.state && ONLINE.state.host === ONLINE.state.me;

// ---- connection
function send(msg) { if (ONLINE.ws && ONLINE.ws.readyState === 1) { ONLINE.ws.send(JSON.stringify(msg)); return true; } return false; }
setInterval(() => { if (ONLINE.ws && ONLINE.ws.readyState === 1) ONLINE.ws.send('ping'); }, 25000);
function connect(code) {
  if (ONLINE.ws) { ONLINE.ws.onclose = null; try { ONLINE.ws.close(); } catch {} }
  if (ONLINE.code !== code) ONLINE.state = null;
  ONLINE.code = code; store.set('stopover-lobby', { code });
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/lobby/${code}/ws`);
  ONLINE.ws = ws;
  ws.onopen = () => { ONLINE.retry = 0; };
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
  const r = m.race, mine = r && r.progress[m.me];
  // a player who finished and went back to their own trip stays there
  if (G && m.phase === 'racing' && mine) { if (inThisRace()) syncRace(m); else if (ONLINE.leftRace !== `${m.code}:${r.n}`) enterRace(m); }
  if (G && m.phase === 'results' && inThisRace()) {
    if (!S.done) { finishTrip(true); save(); tripMap.fit(tripBounds(), false, 56, 130); lastMsg = { text: "Time's up! The green line shows a way you could have finished.", cls: 'bad' }; }
    if (ONLINE.resultsShown !== r.n) { ONLINE.resultsShown = r.n; render(); showResults(); }
  }
  refreshOnline();
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
  </ul>`;
}
function openRaceSetup(st) {
  const race = { draft: raceDraft(st.settings), extra: { mode: st.settings.mode || 'time', limit: st.settings.limit ?? 15, show: st.settings.show || 'live' },
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
    </div></details>`;
  el.querySelectorAll('[data-raceset]').forEach(b => b.onclick = () => { const k = b.dataset.raceset; x[k] = k === 'limit' ? +b.dataset.v : b.dataset.v; HOOKS.renderRaceSection(el, race); });
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
  el.innerHTML = `<div class="racehead"><b>🏁 ${esc(RACE_MODES[r.mode].name)}</b><span class="raceclock" id="race-clock"></span><button class="btn small" type="button" id="race-lobby">Lobby ${esc(st.code)}</button></div>
    <ol class="racerows">${rows.map((p, i) => `<li class="${p.id === st.me ? 'me' : ''} ${p.done ? 'done' : ''} ${p.gaveUp ? 'out' : ''}"><span class="place">${p.done ? medal(i + 1) : ''}</span>${unameHtml(p.name)}<span class="racestat">${p.done ? `🏁 ${esc(resultValue(r.mode, { ...p, dnf: false }))}` : p.gaveUp ? 'gave up' : `${p.stops} ${p.stops === 1 ? 'stop' : 'stops'} · ${fmt(p.km)} km${r.mode === 'points' ? ` · ${fmt(p.pts)} pts` : ''}`}</span></li>`).join('')}</ol>`;
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
    <ol class="results">${st.results.map(x => `<li class="${x.id === st.me ? 'me' : ''}"><span class="place">${medal(x.place)}</span><button type="button" class="linkish" data-profile="${esc(x.name)}">${unameHtml(x.name)}</button><span class="val">${esc(resultValue(mode, x))}</span><small>${x.dnf ? '' : `${x.stops} stops · ${fmt(x.km)} km · ${fmt(x.total || 0)} pts`}</small></li>`).join('')}</ol>
    <p class="hint" style="margin:10px 0 0">${esc(RACE_MODES[mode].name)}. Coins, flags and places from the race are yours to keep.</p></section>`;
}

// ---- the Online dialog: race lobby, leaderboard, account
function ensureOnlineDialogs() {
  if ($('dlg-online')) return;
  document.body.insertAdjacentHTML('beforeend', `
<dialog id="dlg-online"><div class="dlg">
  <header><div><h2>Online</h2><p>Race your friends, check the leaderboard, manage your account.</p></div><button class="x" type="button" data-close aria-label="Close">×</button></header>
  <div class="tabs onlinetabs" role="tablist">${[['race', '🏁 Race'], ['board', '🏆 Leaderboard'], ['account', '👤 Account']].map(([id, n]) => `<button type="button" role="tab" data-otab="${id}">${n}</button>`).join('')}</div>
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
      <button type="button" class="linkish" data-profile="${esc(p.name)}">${unameHtml(p.name)}</button>${p.id === st.me ? '<span class="hint">(you)</span>' : ''}
      <span class="lobbytags">${p.id === st.host ? '<span class="chip">👑 Host</span>' : ''}${!p.online ? '<span class="chip">Offline</span>' : p.id === st.host ? '' : p.ready ? '<span class="chip good">✓ Ready</span>' : '<span class="chip">Not ready</span>'}${host && p.id !== st.me && !racing ? `<button class="btn small" type="button" data-kick="${p.id}">Remove</button>` : ''}</span></li>`).join('')}</ul></section>
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
  if ($('lob-ready')) $('lob-ready').onclick = () => send({ t: 'ready', on: !me.ready });
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
      if (!send({ t: 'start', trip: plan.trip })) toast('Not connected to the lobby. Try again in a moment.');
      renderOnline();
    }, 60);
  };
}
async function loadBoard(force) {
  if (!force && ONLINE.board && Date.now() - ONLINE.boardAt < 20000) return ONLINE.board;
  const r = await api('/api/leaderboard');
  if (r.ok) { ONLINE.board = r.body.rows; ONLINE.boardAt = Date.now(); noteNicks(r.body.rows); }
  return ONLINE.board;
}
function renderBoard(body) {
  const rows = ONLINE.board, me = CLOUD.user.name;
  body.innerHTML = `<section><p class="hint" style="margin:0 0 10px">Ranked by flags collected. Tap a name to see their profile.</p>
    ${rows ? `<table class="board"><thead><tr><th>#</th><th>Player</th><th>🚩 Flags</th><th class="wide">League</th><th>Races won</th></tr></thead><tbody>${rows.map((x, i) => `<tr class="${x.name === me ? 'me' : ''}"><td>${i < 3 ? medal(i + 1) : i + 1}</td><td><button type="button" class="linkish" data-profile="${esc(x.name)}">${unameHtml(x.name)}</button></td><td><b>${fmt(x.flags)}</b></td><td class="wide">${esc((LEAGUES.find(l => l.id === x.league) || LEAGUES[0]).name)}</td><td>${fmt(x.wins)}<small class="hint"> / ${fmt(x.races)}</small></td></tr>`).join('')}</tbody></table>` : '<p class="hint">Loading…</p>'}</section>`;
  loadBoard().then(b => { if (b !== rows && $('dlg-online').open && ONLINE.tab === 'board') renderBoard(body); });
}
function renderAccount(body) {
  const u = CLOUD.user;
  body.innerHTML = `<section><div class="label">Logged in as</div><div style="margin:8px 0">${unameHtml(u.name, 'big')}</div>
      <p class="hint" style="margin:0 0 10px">Your progress saves to this account by itself. Log in on any computer or phone to carry on.</p>
      <div class="tools"><button class="btn" type="button" data-profile="${esc(u.name)}">See my profile</button><button class="btn" type="button" id="acc-logout">Log out</button></div></section>
    <section><div class="label">Change password</div>
      <form class="authform" id="acc-pass" style="margin-top:8px"><input type="text" autocomplete="username" value="${esc(u.name)}" hidden>
        <label><span class="label">Current password</span><input class="field" type="password" id="acc-old" autocomplete="current-password" required></label>
        <label><span class="label">New password</span><input class="field" type="password" id="acc-new" autocomplete="new-password" minlength="6" required></label>
        <label><span class="label">New password again</span><input class="field" type="password" id="acc-new2" autocomplete="new-password" minlength="6" required></label>
        <div><button class="btn go" type="submit">Change password</button></div>
      </form><div class="msg" id="acc-msg"></div></section>`;
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

// ---- profiles
// what the profile endpoint sends back, shaped like the parts of a save the Passport reads
const passportOf = pr => ({ visits: pr.visits || {}, study: pr.study || {}, flagsSeen: pr.flagsSeen || {}, stamps: pr.stamps || {}, history: pr.history || [],
  achievements: pr.achievements || {}, trips: pr.trips || 0, km: pr.km || 0, ferries: pr.ferries || 0, feats: pr.feats || {}, cover: pr.cover || null,
  equip: pr.equip || {}, flagStreak: pr.flagStreak || null, flagSets: pr.flagSets || {} });
function nickEditorHtml(id) {
  const u = CLOUD.user;
  return `<section class="nickedit"><div class="label">Nickname</div>
    <p class="hint" style="margin:6px 0 8px">What other players see. It doesn't have to be unique, and your fruit stays beside it. You still log in as <b>${esc(u.name)}</b>.</p>
    <form class="nickrow" id="${id}-nickform"><input class="field" id="${id}-nick" maxlength="24" placeholder="${esc(u.name)}" value="${esc(u.nick || '')}" aria-label="Nickname" autocomplete="off" spellcheck="false">
      <button class="btn go" type="submit">Save</button>${u.nick ? `<button class="btn" type="button" id="${id}-nickclear">Use ${esc(u.name)}</button>` : ''}</form>
    <div class="msg" id="${id}-nickmsg"></div></section>`;
}
async function setNick(nick) {
  const r = await api('/api/nick', { method: 'POST', body: JSON.stringify({ nick }) });
  if (!r.ok) return r.body.error || 'Could not save that nickname.';
  CLOUD.user.nick = r.body.nick; noteNicks([CLOUD.user]);
  if ($('btn-me')) $('btn-me').innerHTML = unameHtml(CLOUD.user.name);
  if (ONLINE.state) renderRacePanel();
  return null;
}
function wireNickEditor(id, after) {
  const say = (text, cls) => { const m = $(id + '-nickmsg'); if (m) { m.className = 'msg ' + cls; m.textContent = text; } };
  // the form redraws itself after a save, so the confirmation goes into the new one
  const done = async () => { if (after) await after(); say(CLOUD.user.nick ? `Players now see you as ${CLOUD.user.nick}.` : 'Players see your username again.', 'good'); };
  $(id + '-nickform').onsubmit = async e => { e.preventDefault(); say('Saving…', ''); const err = await setNick($(id + '-nick').value); if (err) say(err, 'bad'); else done(); };
  if ($(id + '-nickclear')) $(id + '-nickclear').onclick = async () => { const err = await setNick(''); if (err) say(err, 'bad'); else done(); };
}
async function openProfile(name) {
  ensureOnlineDialogs();
  $('profile-title').innerHTML = unameHtml(name, 'big'); $('profile-sub').textContent = ''; $('profile-body').innerHTML = '<section><p class="hint">Loading…</p></section>';
  if (!$('dlg-profile').open) $('dlg-profile').showModal();
  const r = await api('/api/profile/' + encodeURIComponent(name));
  if (!r.ok) { $('profile-body').innerHTML = `<section><p class="msg bad">${esc(r.body.error || 'Could not load this profile.')}</p></section>`; return; }
  noteNicks([r.body]);
  $('profile-title').innerHTML = unameHtml(r.body.name, 'big');
  renderProfile(r.body);
}
function ago(t) { const m = Math.round((Date.now() - t) / 60000); return m < 2 ? 'just now' : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; }
function renderProfile(x, showAll) {
  const pr = x.profile, league = LEAGUES.find(l => l.id === x.league) || LEAGUES[0], cat = flagCatalog();
  const mine = CLOUD.user && x.name === CLOUD.user.name;
  $('profile-sub').textContent = `${x.nick ? `@${x.name} · ` : ''}#${x.rank} on the leaderboard · joined ${new Date(x.created).toLocaleDateString()} · seen ${ago(x.seen)}`;
  const keys = Object.keys(pr.flagsSeen), flags = cat ? keys.map(k => cat.byKey.get(k)).filter(Boolean) : [];
  const rarity = RARITY.map((r, i) => flags.filter(f => f.rarity === i).length), kinds = FLAG_KINDS.map(k => flags.filter(f => f.kind === k.id).length);
  flags.sort((a, b) => b.rarity - a.rarity || pr.flagsSeen[b.key] - pr.flagsSeen[a.key]);
  const shown = showAll ? flags : flags.slice(0, 48);
  const countries = Object.keys(pr.stamps).filter(k => !k.startsWith('area:')), visas = Object.keys(pr.stamps).filter(k => k.startsWith('area:'));
  const stat = (label, value) => `<div class="stat"><span class="label">${label}</span><b>${value}</b></div>`;
  $('profile-body').innerHTML = `
    <section class="profilehead"><div class="profilecover">${coverSvg({ color: league.color, ink: league.ink, emblem: league.emblem, title: league.title, top: 'STOPOVER', bottom: displayName(x.name).toUpperCase() })}</div>
      <div class="stats profilestats">${stat('🚩 Flags', fmt(x.flags))}${stat('League', esc(league.name))}${stat('Rating', fmt(x.rating))}${stat('Trips', fmt(pr.trips))}${stat('Distance', fmt(pr.km) + ' km')}${stat('Places known', fmt(x.places))}${stat('Countries', fmt(countries.length))}${stat('Races won', `${fmt(x.wins)}<small class="hint"> / ${fmt(x.races)}</small>`)}${stat('Achievements', fmt(Object.keys(pr.achievements || {}).length))}</div></section>
    <section class="pfpassport"><button class="btn go big" type="button" id="pf-passport">📖 Open ${mine ? 'your' : `${esc(displayName(x.name))}'s`} passport</button><span class="hint">Mastery map, stamps, country covers, the full flag collection, stats and trips${mine ? '' : ', just as they see them'}.</span></section>
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
  if ($('pf-all')) $('pf-all').onclick = () => renderProfile(x, true);
  $('pf-passport').onclick = () => mine ? openPassport(null) : openPassport({ label: displayName(x.name), data: passportOf(pr) });
  if (mine) wireNickEditor('pf', () => openProfile(x.name));
}

// ---- hooks into the game
if (CLOUD) {
  HOOKS.online = true;
  HOOKS.afterTravel = () => { if (S.race) sendProgress(); };
  HOOKS.afterFinish = gaveUp => { if (S.race) { if (gaveUp) send({ t: 'giveup' }); else sendFinish(); } CLOUD.flush(); };
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
    for (const id of r.entrants) {
      const p = r.progress[id]; if (id === st.me || p.cur == null) continue;
      const at = G.byGid.get(p.cur); if (at == null) continue;
      const who = nameInfo(r.names[id]), [x, y] = m.px(G.lon[at], G.lat[at]);
      ctx.beginPath(); ctx.arc(x, y, 12, 0, 7); ctx.fillStyle = who.color; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = pal.halo || '#FFFFFF'; ctx.stroke();
      ctx.font = '13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.done ? '🏁' : who.emoji, x, y + 1);
      tryLabel(who.name, x + 15, y + 15, { size: 12, weight: 700, color: who.color });
    }
  };
  HOOKS.renderLeaderboard = el => {
    const rows = ONLINE.board;
    el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px"><div class="label">Leaderboard · flags</div><button class="btn small" type="button" id="pp-board">Full leaderboard</button></div>
      ${rows ? `<ol class="list" style="list-style:decimal;padding-left:20px">${rows.slice(0, 5).map(x => `<li style="display:list-item"><span style="display:flex;justify-content:space-between;gap:8px">${unameHtml(x.name)}<span>🚩 ${fmt(x.flags)}</span></span></li>`).join('')}</ol>` : '<p class="hint" style="margin:0">Loading…</p>'}`;
    $('pp-board').onclick = () => openOnline('board');
    if (!rows) loadBoard().then(() => { if ($('leaderboard')) HOOKS.renderLeaderboard($('leaderboard')); });
  };
  HOOKS.boot = () => {
    noteNicks([CLOUD.user]);
    const setDlg = $('dlg-settings') && $('dlg-settings').querySelector('.dlg header');
    const drawSetNick = () => { $('set-nicksec').innerHTML = nickEditorHtml('set'); wireNickEditor('set', drawSetNick); };
    if (setDlg && !$('set-nicksec')) { setDlg.insertAdjacentHTML('afterend', '<div id="set-nicksec"></div>'); drawSetNick(); }
    P.playerName = CLOUD.user.name; saveProfile();
    CLOUD.summary = () => { const r = explorerRating(); return { rating: r.total, league: leagueOf(r.total).id, places: r.known, countries: Object.keys(P.stamps || {}).filter(k => !k.startsWith('area:')).length }; };
    const nav = document.querySelector('header.bar nav');
    nav.insertAdjacentHTML('afterbegin', `<button class="btn go icon" id="btn-online" type="button" title="Race your friends" aria-label="Race">🏁<span class="count" id="online-count" hidden></span></button>`);
    nav.insertAdjacentHTML('beforeend', `<button class="btn mebtn" id="btn-me" type="button" title="Your profile">${unameHtml(CLOUD.user.name)}</button>`);
    $('btn-online').onclick = () => openOnline(ONLINE.code ? 'race' : ONLINE.tab);
    $('btn-me').onclick = () => openProfile(CLOUD.user.name);
    // a race or lobby from before a reload carries on
    const lob = store.get('stopover-lobby');
    if (lob && lob.code) joinLobby(lob.code).then(err => { if (err) { store.set('stopover-lobby', null); if (store.get('stopover-race-trip')) { store.set('stopover-race-trip', null); } } });
    else if (store.get('stopover-race-trip')) store.set('stopover-race-trip', null);
    loadBoard();
  };
}
