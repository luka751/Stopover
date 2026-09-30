// ================= the daily game (playstopover.me/) =================
// One screen and three tabs: today's trip, this week's longer trip, and free play with a length and continents of
// your choosing. No account, coins, flags or boards: the result is a score, a row of squares to share and a streak,
// all kept in this browser. Everything here is inert in the full game (MINI is false there).
const MINI_DAY1 = Date.UTC(2026, 8, 30);   // daily trip #1
const MINI_WEEK1 = Date.UTC(2026, 8, 28);  // the Monday of weekly trip #1 (2026-W40)
const utcDay = () => new Date().toISOString().slice(0, 10);
const dailyNo = day => Math.round((Date.parse(day) - MINI_DAY1) / 864e5) + 1;
const weekStart = w => { const [y, n] = w.split('-W').map(Number), jan4 = Date.UTC(y, 0, 4), wd = new Date(jan4).getUTCDay() || 7; return jan4 - (wd - 1) * 864e5 + (n - 1) * 6048e5; };
const weeklyNo = w => Math.round((weekStart(w) - MINI_WEEK1) / 6048e5) + 1;
const MINI_TABS = [{ id: 'daily', name: 'Daily' }, { id: 'weekly', name: 'Weekly' }, { id: 'free', name: 'Free play' }];
const MINI_REGIONS = REGIONS.filter(r => r.id !== 'ALL' && r.id !== 'UNCHARTED'); // Uncharted means the countries your passport knows least
const MG = {
  tab: 'daily', timer: 0, resultShown: '',
  stats: Object.assign({ daily: {}, weekly: {}, free: { played: 0, arrived: 0, best: {} } }, store.get('stats') || {}),
  prefs: Object.assign({ hard: false, length: 'medium', regions: ['EU'], seenHelp: false }, store.get('prefs') || {}),
};
const miniSaveStats = () => store.set('stats', MG.stats);
const miniSavePrefs = () => store.set('prefs', MG.prefs);
const regionName = id => (REGIONS.find(r => r.id === id) || { name: id }).name;

// what the sign says the trip is; each part is its own element so the translations (i18n.js) can find it
function miniTripHtml() {
  const parts = S.mini === 'daily' ? [`📅 Daily #${dailyNo(S.daily)}`] : S.mini === 'weekly' ? [`🗓️ Weekly #${weeklyNo(S.weekly)}`]
    : [lengthOf(S.opts.length).name, regionsOf(S.opts).map(r => `<span>${esc(regionName(r))}</span>`).join(' + ')];
  if (S.opts.assist === 'navigator') parts.push('🔥 Hard');
  return parts.map(p => p.startsWith('<') ? p : `<span>${esc(p)}</span>`).join(' · ');
}
const miniOpts = extra => ({ ...opts, vehicle: 'car', classic: false, assist: MG.prefs.hard ? 'navigator' : 'explorer', avoid: [], from: null, to: null, via: [], skip: [], rules: undefined,
  length: MG.prefs.length, regions: MG.prefs.regions, ...extra });

// ---- tabs: each keeps its own trip, so a half-driven weekly waits while you play today's
function miniSaved(tab) {
  const t = store.get('stopover-trip-' + tab);
  if (!t || t.v !== 2 || t.start >= G.n || t.dest >= G.n || t.mini !== tab) return null;
  if (tab === 'daily' && t.daily !== utcDay()) return null;
  if (tab === 'weekly' && t.weekly !== isoWeek()) return null;
  return t;
}
function miniResume(t) {
  S = t; useVoyage(S); RULES = migrateRules(S.rules); hintIds = S.scouts ? S.scouts.map(s => s.id) : [];
  lastMsg = { text: S.done ? '' : S.stops.length ? `You're in ${G.name[S.cur]}. ${fmt(dist(G.lat[S.cur], G.lon[S.cur], G.lat[nextTarget()], G.lon[nextTarget()]))} km to go.` : `Name a place within ${fmt(S.fuel)} km of ${G.name[S.start]} to set off.`, cls: '' };
  render(); tripMap.fit(tripBounds(), true, 56, 130);
}
function miniStart(tab) {
  const ok = tab === 'daily' ? startTrip(miniOpts(), true) : tab === 'weekly' ? startTrip(miniOpts(), 'weekly') : startTrip(miniOpts(), false);
  if (!ok && tab === 'free') { MG.prefs.length = 'medium'; MG.prefs.regions = ['EU']; miniSavePrefs(); startTrip(miniOpts(), false); }
}
function miniShow(tab) {
  MG.tab = tab;
  const t = miniSaved(tab);
  if (t) miniResume(t); else miniStart(tab);
  renderMiniTabs();
  if (S && !S.done && matchMedia('(pointer: fine)').matches && $('entry-input')) $('entry-input').focus({ preventScroll: true });
}
function renderMiniTabs() {
  const doneOf = tab => tab === 'daily' ? MG.stats.daily[utcDay()] : tab === 'weekly' ? MG.stats.weekly[isoWeek()] : null;
  $('mini-tabs').innerHTML = MINI_TABS.map(t => { const d = doneOf(t.id);
    return `<button type="button" role="tab" data-minitab="${t.id}" aria-selected="${MG.tab === t.id}">${t.id === 'daily' ? `Daily <small>#${dailyNo(utcDay())}</small>` : t.id === 'weekly' ? `Weekly <small>#${weeklyNo(isoWeek())}</small>` : t.name}${d ? `<i class="${d.gaveUp ? 'lost' : 'won'}" aria-label="${d.gaveUp ? 'given up' : 'done'}">${d.gaveUp ? '✗' : '✓'}</i>` : ''}</button>`; }).join('');
}

// ---- the result: squares for the share line, one per stop, coloured by how much the place paid
const MINI_SQUARES = { village: '🟩', town: '🟨', 'large-town': '🟧', city: '🟥', metropolis: '🟪', capital: '🟪' };
const miniSquare = s => s.id === S.dest ? '🏁' : (s.kind === 'ferry' ? '⛴️' : '') + (s.scouted ? '⬜' : MINI_SQUARES[s.tier] || '🟨');
function miniShareText() {
  const hard = S.opts.assist === 'navigator' ? ' 🔥' : '';
  const head = S.mini === 'daily' ? `Stopover #${dailyNo(S.daily)}${hard}` : S.mini === 'weekly' ? `Stopover weekly #${weeklyNo(S.weekly)}${hard}` : `Stopover · ${lengthOf(S.opts.length).name} trip${hard}`;
  const route = `${emojiFlag(ccOf(S.start))} ${G.name[S.start]} → ${G.name[S.dest]} ${emojiFlag(ccOf(S.dest))}`;
  const helps = S.penalties ? ` · −${S.penalties} hints` : '';
  const line = S.gaveUp ? `Gave up in ${G.name[S.cur]} after ${S.stops.length} ${S.stops.length === 1 ? 'stop' : 'stops'}` : `⭐ ${fmt(S.total)} pts · ${S.stops.length} stops · ${fmt(S.km)} km${helps}`;
  const url = /^https?:/.test(location.protocol) && !/localhost|127\.0\.0\.1/.test(location.host) ? '\n' + location.host + (S.mini === 'weekly' ? '/?play=weekly' : '') : '';
  return `${head}\n${route}\n${S.stops.map(miniSquare).join('')}${S.gaveUp ? '❌' : ''}\n${line}${url}`;
}
// the button says what happened, since a toast would sit under the statistics dialog
async function miniShare(e) {
  const text = miniShareText(), btn = e && e.currentTarget;
  if (window.sa_event) sa_event('shared_mini_' + S.mini);
  try { if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({ text }); return; } } catch { return; }
  let copied = false;
  try { await navigator.clipboard.writeText(text); copied = true; } catch {
    const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0';
    (btn ? btn.parentElement : document.body).appendChild(ta); ta.select();
    try { copied = document.execCommand('copy'); } catch {} ta.remove();
  }
  if (btn) { const was = btn.innerHTML; btn.innerHTML = copied ? '✓ Copied' : 'Could not copy'; setTimeout(() => { if (btn.isConnected) btn.innerHTML = was; }, 2200); }
  if (!copied) toast(text.replace(/\n/g, ' · ')); else if (!btn) toast('Result copied. Paste it anywhere.');
}

// ---- stats and streaks (the daily streak counts days you reached the destination, in a row)
function dailyStreaks() {
  const days = Object.keys(MG.stats.daily).sort(), won = new Set(days.filter(d => !MG.stats.daily[d].gaveUp));
  const prev = d => new Date(Date.parse(d) - 864e5).toISOString().slice(0, 10);
  let best = 0, run = 0, last = null;
  for (const d of days) { if (!won.has(d)) { run = 0; last = d; continue; } run = last && won.has(last) && prev(d) === last ? run + 1 : 1; best = Math.max(best, run); last = d; }
  // the current streak survives until today's trip is lost or tomorrow comes without yesterday's
  let cur = 0, d = won.has(utcDay()) ? utcDay() : prev(utcDay());
  while (won.has(d)) { cur++; d = prev(d); }
  return { cur, best, played: days.length, won: won.size };
}
function miniFinished(gaveUp) {
  const rec = { pts: gaveUp ? 0 : S.total, stops: S.stops.length, km: Math.round(S.km), gaveUp: !!gaveUp, hard: S.opts.assist === 'navigator', t: Date.now() };
  if (S.mini === 'daily' && !MG.stats.daily[S.daily]) MG.stats.daily[S.daily] = rec;
  else if (S.mini === 'weekly' && !MG.stats.weekly[S.weekly]) MG.stats.weekly[S.weekly] = rec;
  else if (S.mini === 'free') { const f = MG.stats.free; f.played++; if (!gaveUp) { f.arrived++; f.best[S.opts.length] = Math.max(f.best[S.opts.length] || 0, S.total); } }
  miniSaveStats(); renderMiniTabs();
  // like the puzzle games it sits beside: the day's result opens on its own, once the confetti has had its moment
  const key = S.mini + ':' + (S.daily || S.weekly);
  if (S.mini !== 'free' && MG.resultShown !== key) { MG.resultShown = key; setTimeout(() => { if (S && S.done && !document.querySelector('dialog[open]')) openMiniStats(); }, gaveUp ? 400 : 1700); }
}
const nextDailyIn = () => { const now = Date.now(), next = Math.ceil((now + 1) / 864e5) * 864e5; return next - now; };
const nextWeeklyIn = () => weekStart(isoWeek()) + 6048e5 - Date.now();
const clock = ms => { const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), d = Math.floor(h / 24); return d ? `${d}d ${h % 24}h` : `${String(h).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
function tickClocks() {
  document.querySelectorAll('[data-clock]').forEach(el => { el.textContent = clock(el.dataset.clock === 'weekly' ? nextWeeklyIn() : nextDailyIn()); });
  // a new day has come while the page was open: the Daily tab moves on to the new trip
  const today = utcDay();
  if (MG.day && MG.day !== today) { MG.day = today; renderMiniTabs(); if (MG.tab === 'daily' && S && S.done) { toast(`Daily #${dailyNo(today)} is ready.`); miniShow('daily'); } }
}

// the finish card in the console, under the sign
function renderMiniFinished() {
  const v = VEHICLES[S.opts.vehicle], countries = new Set([S.start, ...S.stops.map(s => s.id)].map(ccOf)).size, st = dailyStreaks();
  const next = S.mini === 'daily' ? `<p class="mininext">Next daily trip in <b data-clock="daily">${clock(nextDailyIn())}</b></p>` : S.mini === 'weekly' ? `<p class="mininext">Next weekly trip in <b data-clock="weekly">${clock(nextWeeklyIn())}</b></p>` : '';
  const buttons = S.mini === 'free'
    ? `<button class="btn go" type="button" id="mini-again">Play again</button><button class="btn" type="button" id="mini-change">New trip…</button>`
    : `${S.mini === 'daily' && !MG.stats.weekly[isoWeek()] ? `<button class="btn" type="button" data-goto="weekly">Weekly trip →</button>` : ''}<button class="btn" type="button" data-goto="free">Free play →</button>`;
  $('play').innerHTML = `
    <div class="finish minifinish">
      <h2>${S.gaveUp ? 'Trip abandoned' : `${fmt(S.total)} points`}</h2>
      <div class="minisquares" aria-label="${S.stops.length} stops">${S.stops.map(miniSquare).join('')}${S.gaveUp ? '❌' : ''}</div>
      ${S.gaveUp
        ? `<p>${S.rescue ? `A route that works from ${esc(G.name[S.cur])} is drawn on the map in green, and listed under <b>The way</b>.` : `No workable route from ${esc(G.name[S.cur])} turned up. The one from the start is under <b>The way</b>.`}${S.mini === 'daily' ? ' Your streak starts again tomorrow.' : ''}</p>`
        : `<p>${S.stops.length} stops · ${fmt(S.km)} km · ${countries} ${countries === 1 ? 'country' : 'countries'}${S.penalties ? ` · −${S.penalties} for hints` : ''}</p>
          <div class="stats">
            <div class="stat"><span class="label">Stop points</span><b>${fmt(S.pts)}</b></div>
            <div class="stat"><span class="label">Arrival bonus</span><b>+${fmt(S.bonus)}</b></div>
            ${S.mini === 'daily' ? `<div class="stat"><span class="label">Streak</span><b>🔥 ${st.cur}</b></div>` : `<div class="stat"><span class="label">${v.ferry ? 'Spare tickets' : 'Travelled'}</span><b>${v.ferry ? S.tickets : fmt(S.km)}</b></div>`}
          </div>`}
      ${next}
      <div class="tools">${S.mini === 'free'
        ? `${buttons}${S.gaveUp ? '' : '<button class="btn sharebtn" type="button" id="mini-share">↗ Share</button>'}`
        : `<button class="btn go sharebtn" type="button" id="mini-share">↗ Share</button><button class="btn" type="button" id="mini-open-stats">📊 Stats</button>${buttons}`}</div>
    </div>`;
  if ($('mini-share')) $('mini-share').onclick = miniShare;
  if ($('mini-open-stats')) $('mini-open-stats').onclick = () => openMiniStats();
  if ($('mini-again')) $('mini-again').onclick = () => { miniStart('free'); renderMiniTabs(); };
  if ($('mini-change')) $('mini-change').onclick = openMiniNew;
  $('play').querySelectorAll('[data-goto]').forEach(b => b.onclick = () => miniShow(b.dataset.goto));
}

// ---- the stats dialog, which is also the result screen after a daily or weekly trip
function openMiniStats() {
  const st = dailyStreaks(), days = [];
  for (let i = 13; i >= 0; i--) days.push(new Date(Date.parse(utcDay()) - i * 864e5).toISOString().slice(0, 10));
  const recs = days.map(d => MG.stats.daily[d]), top = Math.max(1, ...recs.filter(Boolean).map(r => r.pts));
  const weeks = Object.values(MG.stats.weekly), f = MG.stats.free;
  const tile = (n, label) => `<div class="ms-tile"><b>${n}</b><span>${label}</span></div>`;
  const doneToday = S && S.done && (S.mini === 'daily' || S.mini === 'weekly');
  $('ms-body').innerHTML = `
    ${doneToday ? `<section class="ms-result">
      <div class="label">${miniTripHtml()}</div>
      <h3>${S.gaveUp ? 'Trip abandoned' : `${fmt(S.total)} points`}</h3>
      <div class="minisquares">${S.stops.map(miniSquare).join('')}${S.gaveUp ? '❌' : ''}</div>
      <p class="hint">${esc(G.name[S.start])} → ${esc(G.name[S.dest])} · ${S.stops.length} stops · ${fmt(S.km)} km</p>
      <div class="tools"><button class="btn go sharebtn" type="button" id="ms-share">↗ Share result</button></div>
    </section>` : ''}
    <section>
      <div class="label">Daily trips</div>
      <div class="ms-tiles">${tile(st.played, 'Played')}${tile(st.played ? Math.round(st.won / st.played * 100) + '%' : '–', 'Arrived')}${tile(st.cur, 'Streak')}${tile(st.best, 'Best streak')}</div>
      <div class="ms-bars" role="img" aria-label="Daily scores, last two weeks">${recs.map((r, i) => `<div class="ms-bar ${r ? (r.gaveUp ? 'lost' : 'won') : 'none'} ${days[i] === utcDay() ? 'today' : ''}" title="${days[i]}${r ? ` · ${r.gaveUp ? 'gave up' : fmt(r.pts) + ' pts'}` : ''}"><i style="height:${r && !r.gaveUp ? Math.max(8, r.pts / top * 100) : 6}%"></i><span>${+days[i].slice(8)}</span></div>`).join('')}</div>
      <p class="mininext">Next daily trip in <b data-clock="daily">${clock(nextDailyIn())}</b></p>
    </section>
    <section>
      <div class="label">Weekly trips</div>
      <div class="ms-tiles">${tile(weeks.length, 'Played')}${tile(weeks.filter(w => !w.gaveUp).length, 'Arrived')}${tile(weeks.length ? fmt(Math.max(...weeks.map(w => w.pts))) : '–', 'Best')}${tile(MG.stats.weekly[isoWeek()] ? '✓' : '<span data-clock="weekly">' + clock(nextWeeklyIn()) + '</span>', MG.stats.weekly[isoWeek()] ? 'This week' : 'Left this week')}</div>
    </section>
    <section>
      <div class="label">Free play</div>
      <div class="ms-tiles">${tile(f.played, 'Played')}${LENGTHS.filter(l => l.id !== 'short').map(l => tile(f.best[l.id] ? fmt(f.best[l.id]) : '–', 'Best ' + l.name.toLowerCase())).join('')}</div>
    </section>`;
  if ($('ms-share')) $('ms-share').onclick = miniShare;
  $('dlg-mini-stats').showModal();
}

// ---- free play: how long, and where
function openMiniNew() {
  const d = { length: MG.prefs.length, regions: [...MG.prefs.regions] };
  const draw = () => {
    $('mn-length').innerHTML = LENGTHS.map(l => `<button type="button" class="choice" data-len="${l.id}" aria-pressed="${d.length === l.id}">${l.name}<small>${l.blurb}</small></button>`).join('');
    $('mn-regions').innerHTML = [...MINI_REGIONS, { id: 'ALL', name: 'Anywhere' }].map(r => `<button type="button" class="choice" data-reg="${r.id}" aria-pressed="${d.regions.includes(r.id)}">${r.name}</button>`).join('');
  };
  $('mn-length').onclick = e => { const b = e.target.closest('[data-len]'); if (!b) return; d.length = b.dataset.len; draw(); };
  $('mn-regions').onclick = e => {
    const b = e.target.closest('[data-reg]'); if (!b) return; const id = b.dataset.reg;
    if (id === 'ALL') d.regions = ['ALL'];
    else { const set = new Set(d.regions.filter(x => x !== 'ALL')); if (set.has(id) && set.size > 1) set.delete(id); else set.add(id); d.regions = [...set]; }
    draw();
  };
  $('mn-go').onclick = () => {
    MG.prefs.length = d.length; MG.prefs.regions = d.regions; miniSavePrefs();
    if (startTrip(miniOpts(), false)) { $('dlg-mini-new').close(); MG.tab = 'free'; renderMiniTabs(); }
  };
  draw(); $('dlg-mini-new').showModal();
}

// ---- settings
function openMiniSettings() {
  $('mset-hard').checked = !!MG.prefs.hard; $('mset-dark').checked = isDarkUI(); $('mset-sound').checked = P.sound !== false; $('mset-fx').checked = juiceOn('fx');
  $('dlg-mini-settings').showModal();
}
$('mset-hard').onchange = e => {
  MG.prefs.hard = e.target.checked; miniSavePrefs();
  // like the word games' hard mode: it can be switched on or off before the first move, not halfway through
  if (S && !S.done && !S.stops.length && !S.penalties) { const tab = S.mini; store.set('stopover-trip-' + tab, null); miniStart(tab); toast(MG.prefs.hard ? 'Hard mode on for this trip' : 'Hard mode off'); }
  else toast(MG.prefs.hard ? 'Hard mode starts with your next trip' : 'Hard mode ends after this trip');
};
$('mset-dark').onchange = e => { const t = e.target.checked ? 'dark' : 'light'; store.set('stopover-theme', t); applyTheme(t); };
$('mset-sound').onchange = e => { P.sound = e.target.checked; saveProfile(); };
$('mset-fx').onchange = e => { P.juice = { ...(P.juice || {}), fx: e.target.checked }; saveProfile(); };

function miniBoot() {
  document.documentElement.classList.add('mini');
  // the tabs and the daily game's buttons take the place of the full game's bar (mini.html holds them)
  document.querySelector('header.bar .brand').after($('mini-tabs'), $('mini-nav'));
  // the daily game's one arrival effect is the confetti with the ARRIVED stamp
  P.equip.effect = 'confetti';
  const play = new URLSearchParams(location.search).get('play');
  if (play) { history.replaceState(null, '', location.pathname + location.hash); if (window.sa_event) sa_event('opened_shared_mini_' + play); }
  MG.day = utcDay();
  miniShow(play === 'weekly' ? 'weekly' : 'daily');
  $('mini-tabs').onclick = e => { const b = e.target.closest('[data-minitab]'); if (b && b.dataset.minitab !== MG.tab) miniShow(b.dataset.minitab); };
  $('mini-help').onclick = () => $('dlg-mini-help').showModal();
  $('mini-stats').onclick = () => openMiniStats();
  $('mini-settings').onclick = openMiniSettings;
  $('mh-play').onclick = () => { $('dlg-mini-help').close(); if ($('entry-input')) $('entry-input').focus(); };
  $('mini-legend').innerHTML = TIERS.filter(t => t.id !== 'capital').map(t => `<span>${MINI_SQUARES[t.id]} ${t.id === 'metropolis' ? 'Capital or 1M+' : t.label} <b>+${t.pts}</b></span>`).join('');
  MG.timer = setInterval(tickClocks, 1000);
}
// someone who played the full game on this browser comes back to find the daily game on the front page: once, say
// where their account went
function worldNote() {
  let played = false; try { played = localStorage.getItem('stopover-world-player') === '1'; } catch {}
  if (MG.prefs.worldNoted) return false;
  // accounts from before the split never ran the code that leaves that mark, so ask the server once whether this
  // browser is logged in (a quick 401 for everyone else)
  if (!played) {
    if (!MG.prefs.worldAsked && /^https?:/.test(location.protocol)) {
      MG.prefs.worldAsked = true; miniSavePrefs();
      fetch('/api/me', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).then(j => {
        if (j && j.user && !j.user.guest) { try { localStorage.setItem('stopover-world-player', '1'); } catch {} if (!document.querySelector('dialog[open]')) worldNote(); }
      }).catch(() => {});
    }
    return false;
  }
  MG.prefs.worldNoted = true; miniSavePrefs();
  document.querySelector('header.bar').insertAdjacentHTML('beforebegin', `<div class="worldnote" id="world-note" role="status"><span>👋 <b>Stopover has a daily trip now.</b> Your account, passport, coins and races are all in Stopover World.</span><span class="guestbtns"><a class="btn small go" href="/world">Go to Stopover World</a><button class="btn small" type="button" id="world-note-x">Play the daily trip</button></span></div>`);
  $('world-note-x').onclick = () => $('world-note').remove();
  return true;
}
function miniAfterBoot() {
  if (worldNote()) return;
  if (!MG.prefs.seenHelp) { MG.prefs.seenHelp = true; miniSavePrefs(); $('dlg-mini-help').showModal(); }
  else if (matchMedia('(pointer: fine)').matches && $('entry-input') && !document.querySelector('dialog[open]')) $('entry-input').focus({ preventScroll: true });
}
