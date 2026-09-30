// ================= rating, leagues and the passport book =================
// Explorer rating (0–1000+): how well you travel plus how much you know.
//   trips (up to 600): average of your last 10 finished trips, each scored against a par for its length and vehicle
//   knowledge (up to 400): unique places you know, with diminishing returns
//   flags (up to 150): the size of your flag collection, with diminishing returns
const TRIP_PAR = { short: 400, medium: 750, long: 1300, epic: 2200 };
const VEHICLE_PAR = { car: 1, bike: 0.6, boat: 0.9, train: 0.8 };
const LEAGUES = [
  { id: 'travel-doc', at: 0, name: 'Travel document', color: '#5F6368', ink: '#D9DCD6', emblem: 'doc', title: 'TRAVEL DOCUMENT' },
  { id: 'passport', at: 150, name: 'Passport', color: '#1F4B35', ink: '#E7C46A', emblem: 'globe', title: 'PASSPORT' },
  { id: 'service', at: 350, name: 'Service passport', color: '#6B1E2C', ink: '#E7C46A', emblem: 'globe', title: 'SERVICE PASSPORT' },
  { id: 'diplomatic', at: 550, name: 'Diplomatic passport', color: '#17191C', ink: '#E7C46A', emblem: 'laurel', title: 'DIPLOMATIC PASSPORT' },
  { id: 'laissez', at: 750, name: 'Laissez-passer', color: '#1D5FA8', ink: '#EAF2FB', emblem: 'laurel', title: 'LAISSEZ-PASSER' },
];
function explorerRating(p = P) {
  const recent = (p.history || []).slice(0, 10);
  // a trip through places you already knew counts for less: 40% for an all-familiar route, 100% for an all-new one
  const perf = recent.map(h => Math.min(2, h.total / ((TRIP_PAR[h.length] || 750) * (VEHICLE_PAR[h.vehicle] || 1))) * (h.stopsN ? 0.4 + 0.6 * h.fresh / h.stopsN : 1));
  const trips = 300 * perf.reduce((a, b) => a + b, 0) / 10;
  const known = countryKnowledge(p).reduce((a, b) => a + b, 0);
  const knowledge = 400 * (1 - Math.exp(-known / 400));
  const flagsHave = flagCounts(p).have, flags = flagRating(flagsHave);
  return { total: Math.round(trips + knowledge + flags), trips: Math.round(trips), knowledge: Math.round(knowledge), flags, flagsHave, known, tripsCounted: recent.length };
}
const leagueOf = rating => { let l = LEAGUES[0]; for (const x of LEAGUES) if (rating >= x.at) l = x; return l; };

// ---- stamps: the first stop in each country, plus visa stickers for breakaway and autonomous areas
// visas: disputed territories and autonomous areas (from their outlines), plus Gagauzia by its region code
const VISA_AREAS = { 'MD.51': 'Gagauzia' };
const visaArea = id => areaName(id) || VISA_AREAS[admOf(id)[2]];
function recordStamp(id, via) {
  if (MINI) return;
  P.stamps = P.stamps || {};
  const cc = ccOf(id), area = visaArea(id), now = Date.now();
  const add = (key, kind) => { if (!P.stamps[key]) { P.stamps[key] = { g: G.gid[id], t: now, via, kind }; if (kind === 'entry') feedAdd({ k: 'stamp', cc: key }); } };
  add(cc, 'entry');
  if (area) add('area:' + area, 'visa');
}
function backfillStamps() {
  P.stamps = P.stamps || {};
  for (const [k, v] of Object.entries(P.visits).sort((a, b) => a[1].first - b[1].first)) {
    const id = G.byGid.get(+k.slice(1)); if (id == null) continue;
    const cc = ccOf(id); if (!P.stamps[cc]) P.stamps[cc] = { g: G.gid[id], t: v.first, via: 'road', kind: 'entry' };
    const area = visaArea(id); if (area && !P.stamps['area:' + area]) P.stamps['area:' + area] = { g: G.gid[id], t: v.first, via: 'road', kind: 'visa' };
  }
}
const hashOf = s => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; return h; };
const INKS = ['#A32D2D', '#185FA5', '#2E7D32', '#5B3FA6', '#2B2B2B', '#B3541E'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
function stampSvg(key, s, p = P) {
  const id = G.byGid.get(s.g), h = hashOf(key), inks = (INK_PACKS[(p.equip || {}).ink] || INK_PACKS.classic).inks, ink = inks[h % inks.length], rot = (h >> 3) % 29 - 14;
  const d = new Date(s.t), date = `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const title = (key.startsWith('area:') ? key.slice(5) : ccName(key)).toUpperCase(), city = id != null ? G.name[id].toUpperCase() : '';
  const via = { road: 'BY ROAD', ferry: 'BY SEA', sail: 'BY SEA', flight: 'BY AIR', train: 'BY RAIL' }[s.via] || 'BY ROAD';
  const t = (txt, y, size, weight = 700) => `<text x="80" y="${y}" text-anchor="middle" font-family="'Barlow Condensed', 'Arial Narrow', sans-serif" font-size="${size}" font-weight="${weight}" fill="${ink}" letter-spacing="1">${esc(txt.length > 18 ? txt.slice(0, 17) + '…' : txt)}</text>`;
  if (s.kind === 'visa') {
    const flag = id != null ? (flagStack(id).find(f => f.kind === 'Disputed territory' || f.kind === 'Autonomous area') || flagStack(id).find(f => f.kind === 'Region') || {}).key : null, src = flag && flagSrc(flag);
    return `<svg viewBox="0 0 160 120" role="img" aria-label="Visa sticker: ${esc(title)}"><g transform="rotate(${rot / 2} 80 60)"><rect x="8" y="12" width="144" height="96" rx="6" fill="#FFF8E6" stroke="${ink}" stroke-width="2" stroke-dasharray="5 3"/>${src ? `<image href="${src}" x="16" y="22" width="42" height="28" preserveAspectRatio="xMidYMid slice"/>` : ''}<text x="68" y="34" font-family="'Barlow Condensed', sans-serif" font-size="11" font-weight="700" fill="${ink}" letter-spacing="1.5">VISA</text><text x="68" y="48" font-family="'Barlow Condensed', sans-serif" font-size="15" font-weight="800" fill="${ink}">${esc(title.slice(0, 14))}</text>${t(city, 76, 13, 600)}${t(date + ' · ' + via, 96, 11, 600)}${DISPUTED[key.slice(5)] ? `<rect x="8" y="99" width="144" height="13" fill="#C42B2B"/><text x="80" y="109" text-anchor="middle" font-family="'Barlow Condensed', sans-serif" font-size="9.5" font-weight="700" letter-spacing="2" fill="#FFF">DISPUTED TERRITORY</text>` : ''}</g></svg>`;
  }
  const shape = h % 5, frame = shape === 0 ? `<circle cx="80" cy="60" r="52" fill="none" stroke="${ink}" stroke-width="3"/><circle cx="80" cy="60" r="45" fill="none" stroke="${ink}" stroke-width="1.2"/>`
    : shape === 1 ? `<rect x="10" y="18" width="140" height="84" rx="4" fill="none" stroke="${ink}" stroke-width="3"/><rect x="16" y="24" width="128" height="72" fill="none" stroke="${ink}" stroke-width="1"/>`
    : shape === 2 ? `<ellipse cx="80" cy="60" rx="72" ry="48" fill="none" stroke="${ink}" stroke-width="3"/>`
    : shape === 3 ? `<polygon points="80,6 152,60 80,114 8,60" fill="none" stroke="${ink}" stroke-width="3"/>`
    : `<rect x="12" y="16" width="136" height="88" rx="22" fill="none" stroke="${ink}" stroke-width="3"/>`;
  return `<svg viewBox="0 0 160 120" role="img" aria-label="Entry stamp: ${esc(title)}, ${esc(date)}"><g transform="rotate(${rot} 80 60)" opacity=".88">${frame}${t(title, 46, title.length > 12 ? 14 : 18, 800)}${t(city, 66, 12, 600)}${t(date, 84, 12)}${t('ARRIVED ' + via, 100, 9, 600)}</g></svg>`;
}

// ---- covers: one template, a league (document type) or an earned country cover
const EMBLEMS = {
  doc: ink => `<rect x="-20" y="-26" width="40" height="52" rx="3" fill="none" stroke="${ink}" stroke-width="3"/><path d="M-11 -12h22M-11 -2h22M-11 8h14" stroke="${ink}" stroke-width="3"/>`,
  globe: ink => `<circle r="26" fill="none" stroke="${ink}" stroke-width="3"/><ellipse rx="11" ry="26" fill="none" stroke="${ink}" stroke-width="2.4"/><path d="M-26 0h52M-22 -13h44M-22 13h44" stroke="${ink}" stroke-width="2.4"/>`,
  laurel: ink => `<circle r="20" fill="none" stroke="${ink}" stroke-width="3"/><ellipse rx="8" ry="20" fill="none" stroke="${ink}" stroke-width="2"/><path d="M-20 0h40" stroke="${ink}" stroke-width="2"/>${[...Array(6)].map((_, i) => `<ellipse cx="${-30 + i * 1}" cy="${18 - i * 8}" rx="3.5" ry="7" transform="rotate(${-30 + i * 12} ${-30 + i} ${18 - i * 8})" fill="${ink}"/><ellipse cx="${30 - i}" cy="${18 - i * 8}" rx="3.5" ry="7" transform="rotate(${30 - i * 12} ${30 - i} ${18 - i * 8})" fill="${ink}"/>`).join('')}`,
};
// sub: an earned title, lettered small between the document type and the holder's name
// finish: a bought cover finish (garage.js) laid over the league or country colours
// Every cover gets its own gradient ids: url(#id) finds the first element with that id in the whole page, and when
// that one sits in a closed dialog (the shop's previews) the browser paints nothing, so the finish never showed.
let coverSeq = 0;
function coverSvg({ color, ink, emblem, title, top, bottom, emblemImg, sub, finish }) {
  const F = finish && COVER_FINISHES[finish], uid = ++coverSeq, own = s => String(s || '').replace(/\bcf-([a-z]+)/g, `cf-$1-${uid}`);
  if (F) { color = own(F.color || color); ink = own(F.ink || ink); }
  return `<svg viewBox="0 0 220 310" role="img" aria-label="${esc(title)} cover${F ? ', ' + esc(F.name.toLowerCase()) : ''}">${F ? `<defs>${own(F.defs)}</defs>` : ''}<rect x="0" y="0" width="220" height="310" rx="10" fill="${color}"/>${F ? own(F.over) : ''}<rect x="0" y="0" width="12" height="310" rx="4" fill="rgba(0,0,0,.22)"/>
    <text x="116" y="46" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="15" letter-spacing="3" fill="${ink}">${esc(top)}</text>
    ${emblemImg ? `<image href="${emblemImg}" x="66" y="92" width="100" height="100" preserveAspectRatio="xMidYMid meet"/>` : `<g transform="translate(116 142)">${EMBLEMS[emblem](ink)}</g>`}
    <text x="116" y="236" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${title.length > 16 ? 13 : 17}" letter-spacing="2.5" fill="${ink}">${esc(title)}</text>
    ${sub ? `<text x="116" y="259" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-size="${sub.length > 22 ? 9.5 : 11}" letter-spacing="1" fill="${ink}" opacity=".9">${esc(sub)}</text>` : ''}
    <text x="116" y="278" text-anchor="middle" font-family="'Barlow Condensed', sans-serif" font-size="12" letter-spacing="2" fill="${ink}" opacity=".85">${esc(bottom)}</text>
    <rect x="98" y="286" width="36" height="12" rx="2" fill="none" stroke="${ink}" stroke-width="1.4" opacity=".7"/><circle cx="106" cy="292" r="2.4" fill="${ink}" opacity=".7"/></svg>`;
}
function renderBook(body) {
  const p = pp(), view = !!PV.other;
  if (!view && (!P.stamps || !Object.keys(P.stamps).length)) backfillStamps();
  const r = explorerRating(p), league = leagueOf(r.total), next = LEAGUES[LEAGUES.indexOf(league) + 1];
  // online, your cover carries your nickname like everyone else sees it
  const name = view ? PV.other.label : HOOKS.greetName ? HOOKS.greetName() : P.playerName || 'Traveller';
  const stamps = Object.entries(p.stamps || {}).sort((a, b) => a[1].t - b[1].t), PER_PAGE = 6, pages = Math.max(1, Math.ceil(stamps.length / PER_PAGE));
  bookPage = Math.min(bookPage, pages - 1);
  const pageStamps = stamps.slice(bookPage * PER_PAGE, (bookPage + 1) * PER_PAGE);
  const owner = view ? PV.other.name : CLOUD && CLOUD.user.name, show = showcaseOf(p, owner), title = titleName(view ? p.title : myTitle());
  const cover = coverSvg({ ...((p.cover && countryCover(p.cover, league)) || { color: league.color, ink: league.ink, emblem: league.emblem, title: league.title, top: 'STOPOVER' }), bottom: name.toUpperCase(), sub: title, finish: finishOf(p) });
  const motto = mottoText(view ? p.motto : myMotto());
  body.innerHTML = `
    <div style="display:grid;grid-template-columns:140px 1fr;gap:14px;align-items:center">
      <div>${coverWithShowcase(cover, show)}</div>
      <div style="display:grid;gap:6px">
        <div class="label">${view ? 'League' : 'Your league'}</div>
        <b style="font:800 24px/1 var(--display);text-transform:uppercase">${league.name}</b>
        ${motto ? `<span class="motto">“${esc(motto)}”</span>` : ''}
        <div class="chipline"><span class="chip">Rating ${fmt(r.total)}</span><span class="chip">Trips ${fmt(r.trips)}/600</span><span class="chip">Knowledge ${fmt(r.knowledge)}/400</span><span class="chip">Flags ${fmt(r.flags)}/${FLAG_RATING_MAX}</span></div>
        <div class="levelbar"><div style="width:${next ? Math.min(100, (r.total - league.at) / (next.at - league.at) * 100) : 100}%;background:${league.color}"></div></div>
        <span class="hint">${view ? `${fmt(r.flagsHave)} flags make them a ${flagRankOf(r.flagsHave).name}. Rating counts their last 10 trips (${r.tripsCounted} so far), the places they know and their flags.` : `${next ? `${next.at - r.total} more rating for ${next.name}.` : 'The top document there is.'} Trips count your last 10 (${r.tripsCounted} so far), so harder rules and fewer flights raise it fastest. Your ${fmt(r.flagsHave)} flags make you a ${flagRankOf(r.flagsHave).name}.`}</span>
        ${CLOUD || view ? '' : `<label class="hint" for="pp-name" style="margin-top:4px">Name on your passport</label>
        <input class="field" id="pp-name" maxlength="24" value="${esc(name)}">`}
        ${view && CLOUD ? '<div class="tools" style="margin-top:4px"><button class="btn go" type="button" data-goto-tab="compare">⚖️ Compare with me</button></div>' : ''}
      </div>
    </div>
    <div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><div class="label">Showcase${show.length ? ` · ${show.length}` : ''}</div>${view ? '' : `<button class="btn small" type="button" id="sc-edit">${showcaseEditing ? 'Close' : show.length ? 'Edit showcase' : 'Pin to showcase'}</button>`}</div>
      ${show.length ? showcaseListHtml(show) : `<p class="hint" style="margin:6px 0 0">${view ? 'Nothing pinned.' : `Pin up to ${SHOWCASE_MAX} favourites (achievements, rare flags, stamps, covers or crowns) to the top of your cover. Other players see them.`}</p>`}
      <div id="sc-editor"></div>
    </div>
    <div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><div class="label">Visas and entry stamps · ${stamps.length}</div>
        <div class="tools"><button class="btn small" type="button" id="bk-prev" ${bookPage ? '' : 'disabled'}>←</button><span class="hint">Page ${bookPage + 1} of ${pages}</span><button class="btn small" type="button" id="bk-next" ${bookPage < pages - 1 ? '' : 'disabled'}>→</button></div></div>
      <div class="bookpage">${pageStamps.length ? pageStamps.map(([k, s]) => `<div class="stamp">${stampSvg(k, s, p)}</div>`).join('') : `<p class="hint">${view ? 'No stamps yet.' : 'Your first stop in a new country stamps a page here.'}</p>`}</div>
    </div>
    <div>
      <div class="label" style="margin-bottom:6px">Leagues</div>
      <div class="leaguerow">${LEAGUES.map(l => `<div class="${l === league ? 'current' : ''}" title="${l.name}: rating ${l.at}+">${coverSvg({ color: l.color, ink: l.ink, emblem: l.emblem, title: l.title, top: 'STOPOVER', bottom: l.at + '+' })}<span>${l.name}</span></div>`).join('')}</div>
    </div>
    <div id="covers"></div>
    ${view ? '' : '<div id="leaderboard"></div>'}`;
  $('bk-prev').onclick = () => { bookPage--; renderBook(body); };
  $('bk-next').onclick = () => { bookPage++; renderBook(body); };
  if ($('pp-name')) $('pp-name').onchange = e => { P.playerName = e.target.value.trim().slice(0, 24) || 'Traveller'; saveProfile(); renderBook(body); publishScore(); };
  if ($('sc-edit')) { $('sc-edit').onclick = () => { showcaseEditing = !showcaseEditing; renderBook(body); }; renderShowcaseEditor($('sc-editor')); }
  renderCovers($('covers'), league, p);
  if (p.cover && !COVERS.data) loadCovers().then(() => renderPassport());
  if (!view) renderLeaderboard();
}
let bookPage = 0;

// ---- shared leaderboard: lights up only when this artifact has the shared database switched on
const PLAYER_ID = (() => { let id = store.get('stopover-player'); if (!id) { id = 'p' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); store.set('stopover-player', id); } return id; })();
let boardDb = null, boardRows = null;
async function initLeaderboard() {
  if (HOOKS.online) return;
  try { boardDb = window.claude && window.claude.use ? await window.claude.use('db') : null; } catch { boardDb = null; }
  if (!boardDb) return;
  boardDb.collection('leaderboard').orderBy('rating', 'desc').limit(50).onSnapshot(snap => { boardRows = snap.docs.map(d => ({ id: d.id, ...d.data() })); renderLeaderboard(); }, () => { boardDb = null; renderLeaderboard(); });
  publishScore();
}
let lastPublished = '';
async function publishScore() {
  if (HOOKS.publishScore) return HOOKS.publishScore();
  if (!boardDb) return;
  const r = explorerRating(), body = { name: P.playerName || 'Traveller', rating: r.total, league: leagueOf(r.total).id, places: r.known, trips: P.trips, updated: new Date().toISOString().slice(0, 10) };
  const sig = JSON.stringify(body); if (sig === lastPublished) return; lastPublished = sig;
  try { await boardDb.doc('leaderboard/' + PLAYER_ID).set(body); } catch { /* read-only viewers still see the board */ }
}
function renderLeaderboard() {
  const el = $('leaderboard'); if (!el) return;
  if (HOOKS.renderLeaderboard) return HOOKS.renderLeaderboard(el);
  if (!boardDb) { el.innerHTML = '<div class="label" style="margin-bottom:6px">Leaderboard</div><p class="hint" style="margin:0">Only you so far. A shared leaderboard appears here once it is switched on for this page.</p>'; return; }
  const rows = boardRows || [];
  el.innerHTML = `<div class="label" style="margin-bottom:6px">Leaderboard</div><ol class="list" style="list-style:decimal;padding-left:20px">${rows.map(x => `<li style="display:list-item"><span style="display:flex;justify-content:space-between;gap:8px"><span>${esc(x.name || 'Traveller')}${x.id === PLAYER_ID ? ' (you)' : ''} · ${esc((LEAGUES.find(l => l.id === x.league) || LEAGUES[0]).name)}</span><span>${fmt(x.rating || 0)}</span></span></li>`).join('') || '<li>No one yet</li>'}</ol>`;
}

function renderLeagueChip() {
  if (!G || MINI) return; const l = leagueOf(explorerRating().total), chip = $('league-chip');
  chip.querySelector('i').style.background = l.color; chip.querySelector('span').textContent = l.name; chip.title = `Your league · rating ${explorerRating().total} · opens your passport`;
}
$('league-chip').onclick = () => { if (!P.flagsNew) ppTab = 'book'; $('btn-passport').click(); };

// ---- earned country covers: know 25 places in a country (Local mastery) and its passport cover is yours
const COVER_UNLOCK = 25;
const COVERS = { data: null, loading: null };
function loadCovers() { return COVERS.loading ||= fetch('covers.json').then(r => r.ok ? r.json() : null).then(d => { COVERS.data = d; }).catch(() => {}); }
// a country's own cover colour: measured from its passport where known, else the nearest of the common cover colours
const coverColour = cc => { const c = COVERS.data && COVERS.data.countries[cc]; return !c ? null : c.hex || (c.colour ? COVERS.data.palette[c.colour] : '#1B2A44'); };
function countryCover(cc, league) {
  const c = COVERS.data && COVERS.data.countries[cc]; if (!c) return null;
  return { color: coverColour(cc), ink: '#E3BD5A', emblem: 'globe', emblemImg: c.arms ? 'data:image/webp;base64,' + c.arms : null, title: league.title, top: (c.name || ccName(cc)).toUpperCase() };
}
function renderCovers(el, league, p = P) {
  const view = p !== P;
  if (!COVERS.data) { el.innerHTML = '<div class="label">Country covers</div><p class="hint">Loading covers…</p>'; loadCovers().then(() => renderCovers(el, league, p)); return; }
  const k = countryKnowledge(p);
  const rows = G.countries.map((c, i) => ({ cc: c[0], known: k[i] })).filter(x => COVERS.data.countries[x.cc]);
  const unlocked = rows.filter(x => x.known >= COVER_UNLOCK).sort((a, b) => b.known - a.known);
  const close = rows.filter(x => x.known > 0 && x.known < COVER_UNLOCK).sort((a, b) => b.known - a.known).slice(0, 6);
  const tile = (x, locked) => { const cov = countryCover(x.cc, league); return `<button type="button" class="covertile ${locked ? 'locked' : ''} ${p.cover === x.cc ? 'equipped' : ''}" ${locked || view ? 'disabled' : `data-cover="${x.cc}"`} title="${esc(ccName(x.cc))}">${coverSvg({ ...cov, bottom: locked ? `${x.known} / ${COVER_UNLOCK}` : (p.cover === x.cc ? (view ? 'CARRIED' : 'EQUIPPED') : view ? 'EARNED' : 'TAP TO USE') })}<span>${esc(ccName(x.cc))}</span></button>`; };
  el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><div class="label">Country covers · ${unlocked.length} earned</div>${P.cover && !view ? '<button class="btn small" type="button" id="cover-reset">Use league cover</button>' : ''}</div>
    <p class="hint" style="margin:6px 0 8px">${view ? `A country's cover is earned by knowing ${COVER_UNLOCK} of its places.` : `Know ${COVER_UNLOCK} places in a country, from trips or Study, and its passport cover is yours to carry in any league.`}</p>
    ${unlocked.length ? `<div class="covergrid">${unlocked.map(x => tile(x, false)).join('')}</div>` : ''}
    ${close.length ? `<div class="label" style="margin:10px 0 6px">Closest to unlocking</div><div class="covergrid">${close.map(x => tile(x, true)).join('')}</div>` : view ? '' : '<p class="hint">Visit or study a country to start earning its cover.</p>'}`;
  if (view) return;
  el.querySelectorAll('[data-cover]').forEach(b => b.onclick = () => { P.cover = b.dataset.cover; saveProfile(); renderPassport(); });
  if ($('cover-reset')) $('cover-reset').onclick = () => { delete P.cover; saveProfile(); renderPassport(); };
}
