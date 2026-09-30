// ================= blind spots =================
// A spaced-repetition deck of the places you keep missing. It fills itself from play:
//   hop    – a town you drove straight past           fly    – a town under a flight or train ride
//   miss   – a wrong Study answer or a revealed scout  rescue – a stop on the route shown after giving up
// Five boxes: a card you know moves up a box and waits longer; a card you miss drops back to the first box.
const BS_WAIT = [0, 1, 3, 7, 16, 35].map(d => d * 864e5), BS_TOP = 5, BS_RETRY = 10 * 60e3;
const bsStore = () => (P.blind = P.blind || {});
const bsEntry = id => bsStore()['g' + G.gid[id]];
// places you already know well enough are not blind spots
const bsKnown = id => !!P.visits[placeKey(id)] || ((P.study[ccOf(id)] || {}).known || []).includes(G.gid[id]);
function bsNote(id, kind, amount = 1, quiet = false) {
  if (id == null || !G || MINI) return;
  const deck = bsStore(), k = 'g' + G.gid[id], now = Date.now();
  const e = deck[k] || (deck[k] = { hop: 0, fly: 0, miss: 0, rescue: 0, box: 0, due: 0, seen: 0, t: now });
  e[kind] = (e[kind] || 0) + amount; e.last = now;
  if (kind === 'miss' || kind === 'rescue') { e.box = 0; e.due = 0; }
  if (!quiet) { saveProfile(); renderBlindCount(); }
}
function bsWeight(id, e) { return e.miss * 3 + e.rescue * 2 + e.hop * (G.pop[id] >= 50000 ? 2 : 1) + e.fly; }
// the deck, most urgent first: due cards by weight, then resting cards by when they come back
function bsDeck(mode = 'due', cc = '') {
  if (!G) return [];
  const now = Date.now(), out = [];
  for (const [k, e] of Object.entries(bsStore())) {
    const id = G.byGid.get(+k.slice(1)); if (id == null) continue;
    const w = bsWeight(id, e); if (w < 2) continue;
    if (mode === 'due' && (e.box >= BS_TOP || e.due > now)) continue;
    if (cc && ccOf(id) !== cc) continue;
    out.push({ id, e, w });
  }
  return out.sort((a, b) => (a.e.due > now) - (b.e.due > now) || (a.e.due > now ? a.e.due - b.e.due : b.w - a.w || G.pop[b.id] - G.pop[a.id]));
}
// towns along a leg that you went straight past without stopping
function bsLegTowns(from, to, path, kind, taken) {
  if (kind === 'ferry' || kind === 'sail') return [];
  const over = kind === 'flight' || kind === 'train', radius = kind === 'flight' ? 18 : kind === 'train' ? 10 : 8;
  const minPop = kind === 'flight' ? 150000 : kind === 'train' ? 20000 : 5000, limit = kind === 'flight' ? 4 : 5;
  const pts = path || [[G.lat[from], G.lon[from]], [G.lat[to], G.lon[to]]], found = new Set();
  for (let i = 1; i < pts.length; i++) {
    const [a1, o1] = pts[i - 1], [a2, o2] = pts[i], steps = Math.max(1, Math.min(120, Math.ceil(dist(a1, o1, a2, o2) / (radius * 1.2))));
    for (let s = 0; s <= steps; s++) {
      const [la, lo] = interp(a1, o1, a2, o2, s / steps);
      for (const c of nearby(la, lo, radius)) if (G.pop[c] >= minPop && !taken.has(c) && dist(la, lo, G.lat[c], G.lon[c]) <= radius) found.add(c);
    }
  }
  const clear = radius * 1.5;
  return [...found].filter(c => dist(G.lat[c], G.lon[c], G.lat[from], G.lon[from]) > clear && dist(G.lat[c], G.lon[c], G.lat[to], G.lon[to]) > clear && !bsKnown(c))
    .sort((a, b) => G.pop[b] - G.pop[a]).slice(0, limit).map(c => ({ id: c, kind: over ? 'fly' : 'hop' }));
}
function bsRecordLeg(from, to, path, kind) {
  if (MINI) return;
  const taken = new Set([S.start, ...S.stops.map(s => s.id)]);
  for (const t of bsLegTowns(from, to, path, kind, taken)) bsNote(t.id, t.kind, 1, true);
  renderBlindCount();
}
// stopping somewhere on purpose is the best proof you've learned it
function bsVisited(id) { const e = bsEntry(id); if (!e) return; e.box = Math.min(BS_TOP, e.box + 1); e.due = Date.now() + BS_WAIT[e.box]; }
function bsGrade(id, knew, quiet) {
  const e = bsEntry(id); if (!e) return false;
  const wasDue = e.due <= Date.now() && e.box < BS_TOP;
  e.seen = (e.seen || 0) + 1; e.reviewed = Date.now();
  if (knew) { e.box = Math.min(BS_TOP, e.box + 1); e.due = Date.now() + BS_WAIT[e.box]; e.right = (e.right || 0) + 1; }
  else { e.box = 0; e.due = Date.now() + BS_RETRY; e.wrong = (e.wrong || 0) + 1; }
  if (!quiet) { saveProfile(); renderBlindCount(); }
  return wasDue;
}
// once: rebuild the deck from the trips you finished before blind spots existed
function bsBackfill() {
  if (P.blindV === 1 || !G) return;
  for (const h of P.history || []) {
    const ids = h.route.concat([h.dest]).map(g => G.byGid.get(g)).filter(x => x != null), taken = new Set(ids);
    for (let i = 1; i < ids.length; i++) for (const t of bsLegTowns(ids[i - 1], ids[i], null, 'road', taken)) bsNote(t.id, t.kind, 1, true);
  }
  P.blindV = 1; saveProfile();
}
function bsSample(n) {
  const around = S ? S.cur : G.byGid.get(2950159), picks = nearby(G.lat[around], G.lon[around], 400).filter(i => G.pop[i] >= 20000 && G.pop[i] < 400000 && !bsEntry(i)).sort(() => Math.random() - 0.5).slice(0, n);
  picks.forEach((id, i) => bsNote(id, i % 3 === 0 ? 'miss' : 'hop', i % 3 === 0 ? 1 : 2, true));
  saveProfile(); renderBlindCount(); toast(`${picks.length} sample blind spots added`);
}
function renderBlindCount() {
  const el = $('blind-count'); if (!el || !G) return;
  const n = bsDeck('due').length; el.hidden = !n; el.textContent = n > 99 ? '99+' : String(n);
  const m = $('menu-count'); if (m) { m.hidden = !n; m.textContent = el.textContent; }
}

// ---- the flashcard viewer
const BS = { mode: 'due', cc: '', list: [], i: 0, flipped: false, graded: new Map(), coins: 0, lastCountry: -1, dir: 0 };
const capitals = new Map();
function capitalOf(ci) {
  if (!capitals.size) for (let i = 0; i < G.n; i++) if (G.fc[i] === G.capital && !capitals.has(G.cc[i])) capitals.set(G.cc[i], i);
  return capitals.get(ci);
}
const bsCurrent = () => BS.list.length ? BS.list[Math.min(BS.i, BS.list.length - 1)] : null;
const bsMap = new MapView($('bs-map'), {
  style: () => ['night', 'blueprint', 'antique', 'political', 'terrain', 'outdoor', 'midcentury', 'satellite', 'nightlights', 'grey', 'metro', 'newsprint', 'topo', 'synthwave'].includes(P.equip.style) ? P.equip.style : 'atlas',
  overlays: () => ({ towns: false }),
  tint: () => { const id = bsCurrent(); if (id == null) return null; const ci = G.cc[id]; return c => c === ci ? null : 'rgba(128,128,128,.4)'; },
  layer: (m, ctx, pal) => {
    const id = bsCurrent(), pin = $('bs-pin');
    if (id == null || !$('dlg-blind').open) { pin.hidden = true; return; }
    // the capital is the landmark you measure from
    const cap = capitalOf(G.cc[id]);
    if (cap != null && cap !== id) {
      const [x, y] = m.px(G.lon[cap], G.lat[cap]);
      ctx.beginPath(); for (let k = 0; k < 10; k++) { const r = k % 2 ? 3 : 7.5, a = -Math.PI / 2 + k * Math.PI / 5; ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a)); } ctx.closePath();
      ctx.fillStyle = pal.ink; ctx.fill(); m.label(G.name[cap], x + 11, y, { size: 12, weight: 600 });
    }
    // the other cards in this country, faint, so the shape of what you miss shows
    ctx.lineWidth = 1.5; ctx.strokeStyle = pal.ink; ctx.globalAlpha = .45;
    for (const other of BS.list) if (other !== id && G.cc[other] === G.cc[id]) { const [x, y] = m.px(G.lon[other], G.lat[other]); ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7); ctx.stroke(); }
    ctx.globalAlpha = 1;
    const [x, y] = m.px(G.lon[id], G.lat[id]);
    pin.hidden = x < -20 || y < -20 || x > m.W + 20 || y > m.H + 20; pin.style.left = x + 'px'; pin.style.top = y + 'px';
    if (BS.flipped) m.label(G.name[id], x + 17, y, { size: 16, weight: 700 });
  },
});
function bsFocus(instant) {
  const id = bsCurrent(); if (id == null) { bsMap.draw(); return; }
  const ci = G.cc[id], sh = G.shapes[ci];
  const [x, y] = bsMap.px(G.lon[id], G.lat[id]), onScreen = x > 40 && y > 40 && x < bsMap.W - 40 && y < bsMap.H - 40;
  if (ci !== BS.lastCountry || !onScreen) {
    const pts = [[G.lat[id], G.lon[id]]]; if (sh) pts.push([sh.main.minY, sh.main.minX], [sh.main.maxY, sh.main.maxX]);
    bsMap.fit(pts, instant, 50, 50); BS.lastCountry = ci;
  } else bsMap.draw();
}
function bsBuild() { BS.list = bsDeck(BS.mode, BS.cc).map(x => x.id); BS.i = 0; BS.flipped = false; BS.graded = new Map(); BS.dir = 0; }
function openBlind() {
  if (!G) return;
  BS.lastCountry = -1; bsBuild();
  if (!BS.list.length && BS.mode === 'due' && bsDeck('all').length) { BS.mode = 'all'; bsBuild(); }
  renderBlind(); $('dlg-blind').showModal();
  requestAnimationFrame(() => { bsMap.resize(); bsFocus(true); applyCosmetics(); });
}
$('btn-blind').onclick = openBlind;
const relTime = ms => { const m = Math.round(ms / 60e3); return m < 60 ? `${Math.max(1, m)} min` : m < 36 * 60 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} days`; };
const pipsHtml = e => `<span class="pips" title="Box ${e.box} of ${BS_TOP}">${Array.from({ length: BS_TOP }, (_, i) => `<i class="${i < e.box ? 'on' : ''}"></i>`).join('')}</span>`;
function bsWhy(id, e) {
  const out = [];
  if (e.hop) out.push(`Drove past ${e.hop}×`);
  if (e.fly) out.push(`Flew or rode over ${e.fly}×`);
  if (e.miss) out.push(`Missed ${e.miss}×`);
  if (e.rescue) out.push(`On a route you gave up ${e.rescue}×`);
  return out;
}
function bsFlags(id, reveal) {
  const st = FLAGS.ready ? flagStack(id) : [], by = kinds => st.find(f => kinds.includes(f.kind));
  const cc = ccOf(id), adm = admOf(id)[0];
  const fig = (f, caption, fallback) => `<figure>${f ? `<img src="${flagSrc(f.key)}" alt="">` : `<span class="noflag">${fallback}</span>`}<figcaption>${esc(caption)}</figcaption></figure>`;
  const country = by(['Country']), region = by(['Region', 'Autonomous area']), city = by(['City', 'Capital city']);
  return `<div class="flagset">
    ${country ? fig(country, countryName(id)) : `<figure><span class="noflag" style="font-size:30px">${emojiFlag(cc)}</span><figcaption>${esc(countryName(id))}</figcaption></figure>`}
    ${fig(region, region ? region.label : adm || 'Region', 'no flag')}
    ${fig(city, reveal ? G.name[id] : 'City flag', 'no flag')}
  </div>`;
}
function renderBlind() {
  const side = $('bs-side'), all = bsDeck('all'), due = bsDeck('due');
  const counts = new Map(); for (const x of (BS.mode === 'due' ? due : all)) counts.set(ccOf(x.id), (counts.get(ccOf(x.id)) || 0) + 1);
  const filters = `<div class="bs-filters">
      <select class="field" id="bs-cc" aria-label="Country"><option value="">All countries · ${BS.mode === 'due' ? due.length : all.length}</option>${[...counts.entries()].sort((a, b) => ccName(a[0]).localeCompare(ccName(b[0]))).map(([cc, n]) => `<option value="${cc}" ${BS.cc === cc ? 'selected' : ''}>${esc(ccName(cc))} · ${n}</option>`).join('')}</select>
      <div class="seg" role="group" aria-label="Which cards"><button type="button" data-bsmode="due" aria-pressed="${BS.mode === 'due'}">Due · ${due.length}</button><button type="button" data-bsmode="all" aria-pressed="${BS.mode === 'all'}">Whole deck · ${all.length}</button></div>
    </div>`;
  const id = bsCurrent();
  if (id == null) {
    const resting = all.filter(x => x.e.due > Date.now() && x.e.box < BS_TOP).sort((a, b) => a.e.due - b.e.due)[0];
    side.innerHTML = filters + (all.length
      ? `<div class="bs-empty"><h3>All caught up</h3><p class="hint" style="margin:0">${resting ? `The next card comes back in ${relTime(resting.e.due - Date.now())}.` : 'Every card is in the top box.'} Keep travelling: every town you drive past without stopping lands here.</p><div class="tools"><button class="btn" type="button" data-bsmode="all">Browse the whole deck</button></div></div>`
      : `<div class="bs-empty"><h3>No blind spots yet</h3><p class="hint" style="margin:0">Finish a few legs of a trip. The towns you drive straight past, the ones under your flights and train rides, and the Study answers you get wrong are collected here as flashcards.</p><div class="tools"><button class="btn go" type="button" data-close>Back to the road</button></div></div>`);
    $('bs-track').innerHTML = ''; wireBlind(); bsMap.draw(); return;
  }
  const e = bsEntry(id), graded = BS.graded.get(id), done = BS.graded.size === BS.list.length;
  const cap = capitalOf(G.cc[id]), fromCap = cap != null && cap !== id ? `${fmt(dist(G.lat[cap], G.lon[cap], G.lat[id], G.lon[id]))} km ${compass(bearing(G.lat[cap], G.lon[cap], G.lat[id], G.lon[id]))} of ${G.name[cap]}` : G.fc[id] === G.capital ? 'The capital' : '';
  const why = bsWhy(id, e).map(w => `<span class="chip">${esc(w)}</span>`).join('');
  const knewN = [...BS.graded.values()].filter(Boolean).length;
  side.innerHTML = filters + `
    ${done ? `<div class="news-perk"><b>${knewN}/${BS.list.length}</b><span><strong>Round done.</strong><br><span class="hint">${BS.list.length - knewN ? `${BS.list.length - knewN} to go again.` : 'Clean sweep.'}${BS.coins ? ` +${BS.coins} coins when you close.` : ''}</span></span>${BS.list.length - knewN ? '<button class="btn small dark" type="button" id="bs-again" style="margin-left:auto">Retry missed</button>' : ''}</div>` : ''}
    <div class="card ${BS.flipped ? 'flipped' : ''}" id="bs-card">
      <div class="card-inner ${BS.dir > 0 ? 'in-next' : BS.dir < 0 ? 'in-prev' : ''}">
        <div class="face front" ${BS.flipped ? 'inert' : ''}>
          <div class="cardtop"><span>Card ${BS.i + 1} of ${BS.list.length}</span>${pipsHtml(e)}</div>
          <div class="q">Name this place</div>
          <div class="masked" aria-label="${G.name[id].length} letters, starts with ${esc(G.name[id][0])}">${esc(maskName(G.name[id]))}</div>
          ${bsFlags(id, false)}
          <div class="why">${why}</div>
          <button class="btn go" type="button" id="bs-flip" style="display:flex;justify-content:space-between;align-items:center">Flip card <kbd>Space</kbd></button>
        </div>
        <div class="face back" ${BS.flipped ? '' : 'inert'}>
          <div class="cardtop"><span>${esc(tierOf(id).label)}${graded != null ? ` · ${graded ? 'knew it' : 'missed it'}` : ''}</span>${pipsHtml(e)}</div>
          <h3 class="answer">${esc(G.name[id])}</h3>
          <div class="hint">${esc(placeLine(id))} · pop ${fmt(G.pop[id])}${fromCap ? ` · ${esc(fromCap)}` : ''} · <a href="${wikiLink(id)}" target="_blank" rel="noopener">Wikipedia ↗</a></div>
          ${bsFlags(id, true)}
          <div class="why">${why}${e.box >= BS_TOP ? '<span class="chip good">Learned</span>' : e.due > Date.now() ? `<span class="chip">Back in ${relTime(e.due - Date.now())}</span>` : ''}</div>
          <div class="grade"><button class="btn miss" type="button" id="bs-miss">Missed it <kbd>S</kbd></button><button class="btn go" type="button" id="bs-knew">Knew it <kbd>W</kbd></button></div>
        </div>
      </div>
    </div>
    <div class="keys"><span><kbd>A</kbd> <kbd>D</kbd> or <kbd>←</kbd> <kbd>→</kbd> browse</span><span><kbd>Space</kbd> flip</span><span><kbd>W</kbd> knew it</span><span><kbd>S</kbd> missed it</span></div>
    <div class="tools"><button class="btn dark" type="button" id="bs-drill">Drill ${esc(countryName(id))} on the map · ${all.filter(x => ccOf(x.id) === ccOf(id) && x.e.box < BS_TOP).length}</button><button class="btn small" type="button" id="bs-remove">Remove card</button></div>`;
  $('bs-track').innerHTML = BS.list.map((cid, i) => {
    const ce = bsEntry(cid), g = BS.graded.get(cid);
    return `<button type="button" class="bs-tile" data-bsi="${i}" aria-current="${i === BS.i}" aria-label="Card ${i + 1}${g != null ? ', ' + G.name[cid] : ''}"><span class="nm">${countryFlag(ccOf(cid))}${esc(g != null ? G.name[cid] : maskName(G.name[cid]))}</span><span class="sub">${pipsHtml(ce)}${g != null ? `<span>${g ? '✓' : '✗'}</span>` : ce.due <= Date.now() && ce.box < BS_TOP ? '<span class="due">due</span>' : ''}</span></button>`;
  }).join('');
  const cur = $('bs-track').children[BS.i]; if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  BS.dir = 0;
  wireBlind(); bsMap.draw();
}
function wireBlind() {
  const side = $('bs-side');
  side.querySelectorAll('[data-bsmode]').forEach(b => b.onclick = () => { BS.mode = b.dataset.bsmode; BS.cc = ''; bsBuild(); renderBlind(); bsFocus(false); });
  if ($('bs-cc')) $('bs-cc').onchange = e => { BS.cc = e.target.value; bsBuild(); renderBlind(); bsFocus(false); };
  if ($('bs-flip')) $('bs-flip').onclick = bsFlip;
  if ($('bs-knew')) $('bs-knew').onclick = () => bsAnswer(true);
  if ($('bs-miss')) $('bs-miss').onclick = () => bsAnswer(false);
  if ($('bs-again')) $('bs-again').onclick = () => { BS.list = BS.list.filter(id => !BS.graded.get(id)); BS.i = 0; BS.flipped = false; BS.graded = new Map(); renderBlind(); bsFocus(false); };
  if ($('bs-drill')) $('bs-drill').onclick = () => bsDrill(ccOf(bsCurrent()));
  if ($('bs-remove')) $('bs-remove').onclick = () => {
    const id = bsCurrent(); delete bsStore()['g' + G.gid[id]]; saveProfile(); renderBlindCount();
    BS.list.splice(BS.i, 1); BS.i = Math.min(BS.i, Math.max(0, BS.list.length - 1)); BS.flipped = false; toast(`${G.name[id]} removed from blind spots`); renderBlind(); bsFocus(false);
  };
  side.querySelectorAll('[data-close]').forEach(b => b.onclick = () => $('dlg-blind').close());
}
$('bs-track').onclick = e => { const b = e.target.closest('[data-bsi]'); if (b) bsGo(+b.dataset.bsi); };
$('bs-prev').onclick = () => bsGo(BS.i - 1);
$('bs-next').onclick = () => bsGo(BS.i + 1);
function bsGo(i) {
  if (!BS.list.length) return;
  const next = (i + BS.list.length) % BS.list.length; if (next === BS.i) return;
  BS.dir = next > BS.i ? 1 : -1; BS.i = next; BS.flipped = false; renderBlind(); bsFocus(false);
}
function bsFlip() { if (bsCurrent() == null) return; BS.flipped = !BS.flipped; const card = $('bs-card'); if (card) { card.classList.toggle('flipped', BS.flipped); card.querySelector('.front').inert = BS.flipped; card.querySelector('.back').inert = !BS.flipped; } bsMap.draw(); }
function bsAnswer(knew) {
  const id = bsCurrent(); if (id == null) return;
  if (!BS.flipped) { bsFlip(); return; } // look at the answer before you grade yourself
  if (!BS.graded.has(id)) { if (bsGrade(id, knew) && knew) BS.coins += 2; BS.graded.set(id, knew); }
  // move on to the next card you haven't answered yet
  const n = BS.list.length; let j = BS.i;
  for (let k = 1; k <= n; k++) { const c = (BS.i + k) % n; if (!BS.graded.has(BS.list[c])) { j = c; break; } }
  if (j !== BS.i) { BS.dir = 1; BS.i = j; BS.flipped = false; }
  renderBlind(); bsFocus(false);
}
function bsDrill(cc) {
  const ids = bsDeck('all').filter(x => ccOf(x.id) === cc && x.e.box < BS_TOP).map(x => x.id);
  if (!ids.length) return;
  $('dlg-blind').close();
  Object.assign(Q, { cc, adm: '', custom: ids, mode: 'find', running: false, done: false, items: [] });
  renderStudySide(); $('dlg-study').showModal();
  requestAnimationFrame(() => { stMap.resize(); startStudy(); applyCosmetics(); });
}
$('dlg-blind').addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest('select, input, textarea')) return;
  const k = e.key.toLowerCase();
  if (k === 'a' || k === 'arrowleft') bsGo(BS.i - 1);
  else if (k === 'd' || k === 'arrowright') bsGo(BS.i + 1);
  else if (k === ' ' || e.code === 'Space') bsFlip();
  else if (k === 'w' || k === 'arrowup') bsAnswer(true);
  else if (k === 's' || k === 'arrowdown') bsAnswer(false);
  else return;
  e.preventDefault();
});
$('dlg-blind').addEventListener('close', () => {
  $('bs-pin').hidden = true;
  if (BS.coins) { addCoins(BS.coins, 'blind spot reviews'); BS.coins = 0; }
  renderBlindCount();
});
