// ================= trip console =================
const flagHtml = cc => S && S.classic ? `<span class="fl emoji">${emojiFlag(cc)}</span>` : countryFlag(cc);
const placeFlagHtml = id => S && S.classic ? `<span class="fl emoji">${emojiFlag(ccOf(id))}</span>` : placeFlag(id);

function renderSign(v) {
  const goal = S.done ? S.dest : nextTarget(), toVia = goal !== S.dest, arrived = S.done && !S.gaveUp;
  const dLeft = dist(G.lat[S.cur], G.lon[S.cur], G.lat[goal], G.lon[goal]), brg = bearing(G.lat[S.cur], G.lon[S.cur], G.lat[goal], G.lon[goal]);
  $('sign').innerHTML = `
    <div class="from"><span>From ${flagHtml(ccOf(S.start))}${esc(G.name[S.start])}</span><span>${S.daily ? 'Daily · ' + S.daily : esc(markerFor(S.opts.vehicle) + ' ' + v.name + ' · ' + (S.voyage ? 'Far-Flung Isles' : LENGTHS.find(l => l.id === S.opts.length).name))}${S.classic ? ' · Classic' : ''}</span></div>
    <div class="to">
      <div class="arrow" style="transform: rotate(${Math.round(brg)}deg)" aria-hidden="true"><svg width="30" height="30" viewBox="0 0 30 30"><path d="M15 2 L25 16 H18 V28 H12 V16 H5 Z" fill="currentColor"/></svg></div>
      <div class="dest">${toVia ? '<span class="via-tag">Via</span>' : ''}${flagHtml(ccOf(goal))}${esc(G.name[goal])}<small>${esc(placeLine(goal))}</small></div>
      <div class="km">${arrived ? 'Arrived' : fmt(dLeft) + ' km'}<small>${arrived ? '' : compass(brg) + ' · as the crow flies'}</small></div>
    </div>
    ${(S.via || []).length ? `<div class="vialine">${[...S.via.map(id => `<span class="${S.stops.some(s => s.id === id) ? 'passed' : id === goal && !S.done ? 'next' : ''}">${esc(G.name[id])}</span>`), `<span class="${arrived ? 'passed' : !toVia && !S.done ? 'next' : ''}">🏁 ${esc(G.name[S.dest])}</span>`].join('<i>→</i>')}</div>` : ''}`;
}
function renderDash(v) {
  const pct = Math.max(0, Math.min(100, S.fuel / v.tank * 100));
  $('dash').innerHTML = `
    <div><div class="gaugehead"><span class="label">${v.gauge}</span><span class="gaugeval">${fmt(S.fuel)} / ${fmt(v.tank)} km</span></div>
    <div class="gauge ${pct < 25 ? 'low' : ''}" role="meter" aria-valuemin="0" aria-valuemax="${v.tank}" aria-valuenow="${Math.round(S.fuel)}" aria-label="${v.gauge} range"><div class="fill" style="width:${pct}%"></div><div class="ticks"><span></span><span></span><span></span><span></span></div></div>
    <div class="gaugescale"><span>E</span><span>½</span><span>F</span></div></div>
    <div class="stats">
      <div class="stat"><span class="label">Points</span><b>${fmt(S.done && !S.gaveUp ? S.total : S.pts - S.penalties)}</b></div>
      <div class="stat"><span class="label">Stops · score</span><b>${S.stops.length} <small class="mult" style="font-size:13px;vertical-align:3px">×${(S.mult || 1).toFixed(2)}</small></b></div>
      <div class="stat"><span class="label">${v.ferry ? 'Ferry tickets' : 'Travelled'}</span>${v.ferry ? `<div class="tickets">${Array.from({ length: S.ticketsTotal }, (_, i) => `<span class="ticket ${i >= S.tickets ? 'used' : ''}"></span>`).join('') || '<span class="hint">none</span>'}</div>` : `<b>${fmt(S.km)}</b>`}</div>
    </div>
    ${S.classic ? '' : (() => { const d = tripDiscovery(), pct = Math.round(discoveryBonusFactor(d.share) * 100); return `<div class="discovery" title="The arrival bonus grows with the share of stops that are places you have never been"><span class="label">Discovery</span><div class="levelbar"><div style="width:${d.stops ? d.share * 100 : 100}%;background:${d.share >= 0.6 ? 'var(--good)' : d.share >= 0.3 ? 'var(--fuel)' : 'var(--danger)'}"></div></div><span class="gaugeval">${d.stops ? `${d.fresh}/${d.stops} new` : 'no stops yet'} · bonus ${pct}%</span></div>`; })()}`;
}
// Driving is the heart of the game: Fly and Train only appear when this trip's rules allow them
function availableModes() {
  // boats can't be flown or put on rails, so a sailing trip only ever sails
  if (!S || S.classic || VEHICLES[S.opts.vehicle].coastal || VEHICLES[S.opts.vehicle].rail) return ['ground'];
  const modes = ['ground'];
  if (RULES.planes !== 'off') modes.push('fly');
  if (RULES.trains !== 'off' && RAIL.ready && G.lat[S.cur] >= RAIL.lat1 - RAIL.h * RAIL.res && G.lon[S.cur] >= RAIL.lon0 && G.lon[S.cur] <= RAIL.lon0 + RAIL.w * RAIL.res) modes.push('train');
  return modes;
}
function modeSwitch(v) {
  const modes = availableModes();
  if (!modes.includes(S.mode)) S.mode = 'ground';
  if (modes.length < 2) return '';
  const label = { ground: `${markerFor(S.opts.vehicle)} ${v.coastal ? 'Sail' : S.opts.vehicle === 'bike' ? 'Ride' : 'Drive'}`, fly: `✈ Fly${P.freeFlights ? ` <small class="free">${P.freeFlights} free</small>` : ''}`, train: `🚆 Train${P.freeTrains ? ` <small class="free">${P.freeTrains} free</small>` : ''}` };
  return `<div class="modes" role="group" aria-label="How to travel">${modes.map(m => `<button type="button" data-mode="${m}" aria-pressed="${S.mode === m}">${label[m]}</button>`).join('')}</div>`;
}
function renderPlaying(v) {
  const typing = $('entry-input'), keep = typing ? { value: typing.value, focus: document.activeElement === typing } : null;
  $('play').innerHTML = `
    <div class="entry">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap">
        <label class="label" for="entry-input">${S.mode === 'train' ? `Train from ${esc(G.name[S.cur])}` : S.mode === 'fly' ? `Fly from ${esc(G.name[S.cur])}` : `Next stop · within ${fmt(S.fuel)} km of ${esc(G.name[S.cur])}`}</label>
        ${modeSwitch(v)}
      </div>
      <form class="entryrow" id="entry-form" autocomplete="off">
        <input type="text" id="entry-input" placeholder="${S.mode === 'train' ? (stationOK(S.cur) ? 'A town with a station' : 'No station here') : S.mode === 'fly' ? (airportOK(S.cur) ? 'A city with an airport' : 'No qualifying airport here') : v.rail ? 'A town with a railway station' : S.stops.length ? 'Name a city, town or village' : 'e.g. a town on the way'}" spellcheck="false" aria-autocomplete="list" aria-controls="sugg">
        <button class="btn go" type="submit">${S.mode === 'fly' ? 'Fly ✈' : S.mode === 'train' ? 'Ride 🚆' : (v.rail ? 'Ride ' : 'Go ') + markerFor(S.opts.vehicle)}</button>
        <ul class="sugg" id="sugg" role="listbox" hidden></ul>
      </form>
      <div class="entryfoot">
        <div class="msg ${lastMsg.cls}" id="msg" aria-live="polite">${esc(lastMsg.text)}</div>
        <div class="toolbox">
          <button class="btn small" type="button" id="tools-btn" aria-expanded="false" aria-controls="tools-menu">Tools ▾</button>
          <div class="toolsmenu" id="tools-menu" hidden>
            ${S.avoid && S.avoid.length ? `<div class="hint">Avoiding ${S.avoid.map(cc => esc(ccName(cc))).join(', ')}</div>` : ''}
            ${RULES.hints === 'off' ? '' : `<button type="button" id="btn-scout" ${S.scouts.length ? 'disabled' : ''}><span>🔭 Scout ahead</span><span class="cost">−${scoutCost()}</span></button>
            <button type="button" id="btn-help-road" ${S.fuel >= v.tank * helpThreshold() ? `disabled title="Only when your tank is under ${helpThreshold() === 0.5 ? 'half' : Math.round(helpThreshold() * 100) + '%'}"` : ''}><span>🛟 ${v.coastal ? 'Resupply at sea' : v.rail ? 'Rail replacement' : S.opts.vehicle === 'bike' ? 'Rest stop' : 'Roadside help'}</span><span class="cost">−${helpCost()}</span></button>`}
            ${P.consumables.jerrycan ? `<button type="button" id="use-jerry"><span>⛽ Jerrycan: +30% range</span><span class="cost">×${P.consumables.jerrycan}</span></button>` : ''}
            ${P.consumables.ticket && v.ferry ? `<button type="button" id="use-ticket"><span>🎫 Add a ferry ticket</span><span class="cost">×${P.consumables.ticket}</span></button>` : ''}
            ${!S.classic && P.consumables.tow ? `<button type="button" id="use-tow" ${S.undo ? '' : 'disabled title="Nothing to undo yet"'}><span>🛻 Tow truck: undo last leg</span><span class="cost">×${P.consumables.tow}</span></button>` : ''}
            <hr>
            <button type="button" id="btn-giveup" class="danger"><span>Give up and see a route</span></button>
          </div>
        </div>
      </div>
      ${S.scouts.length ? `<div class="scouts">${S.scouts.map((sc, i) => `
        <div class="scout"><span class="pin">${i + 1}</span><div><span class="masked">${esc(sc.revealed ? G.name[sc.id] : maskName(G.name[sc.id]))}</span><small>${sc.fresh ? '🔭 never visited · ' : ''}${flagHtml(ccOf(sc.id))}${esc(tierOf(sc.id).label)} · ${fmt(dist(G.lat[S.cur], G.lon[S.cur], G.lat[sc.id], G.lon[sc.id]))} km ${compass(bearing(G.lat[S.cur], G.lon[S.cur], G.lat[sc.id], G.lon[sc.id]))}</small></div>
        ${sc.revealed || RULES.hints === 'off' ? '' : `<button class="btn small" type="button" data-reveal="${i}">Reveal<span class="cost">${revealCost() ? '−' + revealCost() : 'free'}</span></button>`}</div>`).join('')}</div>` : ''}
    </div>`;
  wireEntry();
  if (keep) { $('entry-input').value = keep.value; if (keep.focus) $('entry-input').focus(); }
}
function renderFinished() {
  const bk = `${S.opts.vehicle}-${S.opts.length}`, countries = new Set(S.stops.map(s => ccOf(s.id))).size, firsts = S.stops.filter(s => s.fresh && s.id !== S.dest).length;
  const routeList = (ids, cls) => `<ol class="rescue">${ids.map((id, i) => {
    const first = i === 0, last = i === ids.length - 1, prevId = ids[i - 1], ferry = !first && VEHICLES[S.opts.vehicle].ferry && checkLeg(S.opts.vehicle, prevId, id, 1e6, 9, null, true).kind === 'ferry';
    return `<li class="${ferry ? 'ferry' : ''}"><span class="dot">${first || last ? '' : i}</span><div><div class="where">${placeFlagHtml(id)}<a href="${wikiLink(id)}" target="_blank" rel="noopener">${esc(G.name[id])}</a><span class="tier ${tierOf(id).id}">${last ? 'Destination' : first ? (cls === 'rescue' ? 'You stopped here' : 'Start') : (S.via || []).includes(id) ? 'Via' : tierOf(id).label}</span></div><div class="meta">${esc(placeLine(id))} · pop ${fmt(G.pop[id])}${first ? '' : ` · ${ferry ? '⛴ ' : ''}${fmt(dist(G.lat[prevId], G.lon[prevId], G.lat[id], G.lon[id]))} km`}</div></div><div></div></li>`;
  }).join('')}</ol>`;
  $('play').innerHTML = `
    <div class="finish">
      <h2>${S.gaveUp ? 'Trip abandoned' : `${fmt(S.total)} points`}</h2>
      ${S.gaveUp
        ? (S.rescue ? `<p>Here's a way to ${esc(G.name[S.dest])} from ${esc(G.name[S.cur])}. It's drawn on the map in green and sticks to the biggest, closest places. Every leg fits your ${VEHICLES[S.opts.vehicle].gauge.toLowerCase()}${VEHICLES[S.opts.vehicle].ferry ? ' and ferry tickets' : ''}${viaLeft().length ? `, and it passes through ${viaLeft().map(x => esc(G.name[x])).join(' and ')}` : ''}.</p>${routeList(S.rescue, 'rescue')}` : `<p>No workable route from ${esc(G.name[S.cur])} could be found. Here's the one from the start: ${S.par.map(id => esc(G.name[id])).join(' → ')}.</p>`)
        : `<p>${fmt(S.km)} km through ${countries} ${countries === 1 ? 'country' : 'countries'}, ${firsts} new ${firsts === 1 ? 'place' : 'places'}${S.flights ? `, ${S.flights} ${S.flights === 1 ? 'flight' : 'flights'} (${Math.round((1 - (S.groundShare ?? 1)) * 100)}% of the distance flown, −${S.flightCoins} coins)` : ''}${S.penalties ? `, −${S.penalties} for scouting and help` : ''}. ${lengthOf(S.opts.length).name} trip, difficulty ×${(S.mult || 1).toFixed(2)}.${S.classic ? '' : ` Discovery ${Math.round((S.discovery ?? 1) * 100)}%: the arrival bonus paid ${Math.round(discoveryBonusFactor(S.discovery ?? 1) * 100)}%.`} Best for ${VEHICLES[S.opts.vehicle].name.toLowerCase()} · ${S.opts.length}: ${fmt(P.best[bk] || S.total)}.</p>
          <div class="stats"><div class="stat"><span class="label">Stop points</span><b>${fmt(S.pts)}</b></div><div class="stat"><span class="label">Arrival bonus</span><b>+${fmt(S.bonus)}</b></div><div class="stat"><span class="label">Coins</span><b>+${fmt(S.coins || 0)}</b></div></div>
          <details><summary class="hint" style="cursor:pointer">The big-city route from the start (${S.par.length - 2} stops)</summary>${routeList(S.par, 'par')}</details>`}
      ${S.passed && S.passed.length ? `<div><div class="label" style="margin-bottom:6px">Places you ${VEHICLES[S.opts.vehicle].rail ? 'rode' : VEHICLES[S.opts.vehicle].coastal ? 'sailed' : 'drove'} right past</div><ul>${S.passed.map(id => `<li>${esc(G.name[id])} <small>${fmt(G.pop[id])}</small></li>`).join('')}</ul></div>` : ''}
      ${!S.classic && bsDeck('due').length ? `<div class="news-perk"><span><strong>${bsDeck('due').length} blind spots to review.</strong><br><span class="hint">Towns you hopped over on your trips are waiting in the deck.</span></span><button class="btn small dark" type="button" id="btn-review" style="margin-left:auto">Review</button></div>` : ''}
      <div class="tools"><button class="btn go" type="button" id="btn-again">${opts.from != null && opts.to != null ? 'Same route again' : 'Next trip'}</button><button class="btn" type="button" id="btn-change">Change trip</button></div>
    </div>`;
  $('btn-again').onclick = () => startTrip(opts, false);
  if ($('btn-review')) $('btn-review').onclick = () => openBlind();
  $('btn-change').onclick = openNew;
}
function renderPostcard() {
  if (S.classic) { $('postcard').innerHTML = ''; return; }
  const last = S.stops.length ? S.stops[S.stops.length - 1].id : S.start, stack = flagStack(last), fresh = new Set(S.lastFlagsNew || []), n = visitsBefore(last);
  $('postcard').innerHTML = `<div class="postcard">
    <div><div class="label">${S.stops.length ? 'You’re in' : 'Starting in'}</div><h3>${esc(G.name[last])}</h3><div class="sub">${esc(placeLine(last))} · pop ${fmt(G.pop[last])} · <a href="${wikiLink(last)}" target="_blank" rel="noopener">Wikipedia ↗</a></div></div>
    ${stack.length ? `<div class="flagrow">${stack.map(f => `<div class="flagcard"><img src="${flagSrc(f.key)}" alt="Flag of ${esc(f.label)}"><em class="${fresh.has(f.key) ? 'newflag' : ''}">${fresh.has(f.key) ? 'New flag' : esc(f.kind)}</em><span>${esc(f.label)}</span></div>`).join('')}</div>` : `<div class="hint">${FLAGS.ready ? 'No flags on file for this place.' : FLAGS.failed ? 'Flags could not be loaded.' : 'Flags are loading…'}</div>`}
    ${S.voyage && last === S.dest && isleOf(last) ? `<div class="disputed-note isle-note"><b>🏝️ Outpost reached: ${esc(ccName(ccOf(last)))}</b><span>${esc(isleOf(last).note)}</span></div>` : ''}
    ${G.area[last] && DISPUTED[areaName(last)] ? `<div class="disputed-note"><b>⚑ Disputed territory: ${esc(areaName(last))}</b><span>${esc(DISPUTED[areaName(last)])}</span></div>` : ''}
    <div class="chipline"><span class="chip">${esc(tierOf(last).label)}</span><span class="chip">${n ? `Visited ${n}×` : 'Not visited yet'}</span>${n ? `<span class="chip">Next visit ×${familiarity(n).mult}</span>` : ''}</div>
  </div>`;
}
function renderLog() {
  const items = [`<li class="start"><span class="dot"></span><div><div class="where">${placeFlagHtml(S.start)}${esc(G.name[S.start])}</div><div class="meta">Start · ${esc(placeLine(S.start))}</div></div><div></div></li>`]
    .concat(S.stops.map(s => {
      const t = TIERS.find(x => x.id === s.tier), arrived = s.id === S.dest;
      return `<li class="${s.kind === 'ferry' || s.kind === 'flight' ? 'ferry' : ''}"><span class="dot"></span>
        <div><div class="where">${placeFlagHtml(s.id)}<a href="${wikiLink(s.id)}" target="_blank" rel="noopener">${esc(G.name[s.id])}</a>${arrived ? '<span class="tier">Destination</span>' : s.checkpoint ? '<span class="tier via">Checkpoint</span>' : `<span class="tier ${t.id}">${t.label}</span>`}${s.fresh ? '<span class="newstamp">New stamp</span>' : ''}</div>
        <div class="meta">${esc(placeLine(s.id))} · pop ${fmt(G.pop[s.id])} · ${s.kind === 'ferry' ? '⛴ ' : s.kind === 'flight' ? '✈ ' : s.kind === 'train' ? '🚆 ' : ''}${fmt(s.km)} km${s.kind === 'train' && !s.own ? ` · −${s.cost} coins` : s.kind === 'flight' ? ` · ${s.cost ? `−${s.cost} coins` : 'free flight'} · tank refilled` : arrived ? '' : ` · +${fmt(s.refill)} km`}${s.hop && s.hop < 1 ? ` · short hop ×${s.hop.toFixed(2)}` : ''}</div></div>
        <div class="pts">${arrived ? '🏁' : '+' + s.pts}${!arrived && s.mult && s.mult !== 1 ? `<small>×${s.mult}</small>` : ''}</div></li>`;
    }));
  $('log').innerHTML = `<div class="label">Route log</div><ol>${items.join('')}</ol>`;
}
function render() {
  if (!S || !G) return;
  const v = VEH(S.opts.vehicle);
  $('ver-badge').textContent = S.classic ? 'V1' : 'V3';
  renderBrandMode(S.opts.vehicle);
  $('trip-legend').innerHTML = `${v.rail ? '<span><i class="t"></i>Rail</span>' : `<span><i></i>${v.coastal ? 'Sea' : 'Road'}</span>`}${v.ferry ? '<span><i class="f"></i>Ferry</span>' : ''}${!v.rail && S.stops.some(x => x.kind === 'train') ? '<span><i class="t"></i>Train</span>' : ''}${S.done && S.gaveUp && S.rescue ? '<span><i class="s"></i>Route to learn</span>' : '<span><i class="r"></i>Range</span>'}`;
  $('sign').className = 'sign' + (S.classic ? '' : ' sign-' + (P.equip.sign || 'eroad'));
  renderSign(v); renderDash(v);
  if (S.done) renderFinished(); else renderPlaying(v);
  renderPostcard(); renderLog(); renderWanted();
  tripMap.draw();
}

let suggIds = [], suggSel = -1;
function wireEntry() {
  const input = $('entry-input'), list = $('sugg');
  input.addEventListener('input', () => {
    suggSel = -1;
    if (opts.assist !== 'explorer' || !searchIndex) { list.hidden = true; return; }
    const key = fold(input.value);
    if (key.length < 2) { list.hidden = true; suggIds = []; return; }
    suggIds = prefixIds(key).filter(id => (S.mode !== 'fly' || airportOK(id)) && (S.mode !== 'train' || stationOK(id)) && (!VEHICLES[S.opts.vehicle].rail || hasStation(id))).sort((a, b) => G.pop[b] - G.pop[a]).slice(0, 8);
    if (!suggIds.length) { list.hidden = true; return; }
    list.innerHTML = suggIds.map((id, i) => { const d = dist(G.lat[S.cur], G.lon[S.cur], G.lat[id], G.lon[id]), inRange = d <= S.fuel, n = visitsBefore(id);
      return `<li role="option" id="sg-${i}" data-i="${i}" aria-selected="false"><div>${flagHtml(ccOf(id))}${esc(G.name[id])}<small>${esc(placeLine(id))} · ${esc(tierOf(id).label)}${!S.classic && n ? ` · visited ${n}×` : ''}</small></div>${S.mode === 'train' ? `<span class="rng in">${fmt(d)} km<br>🚆 ${P.freeTrains ? 'free ride' : 'station'}</span>` : S.mode === 'fly' ? `<span class="rng ${P.freeFlights || P.coins >= flightCost(d, S.flights) ? 'in' : ''}">${fmt(d)} km<br>✈ ${P.freeFlights ? 'free' : flightCost(d, S.flights) + ' coins'}</span>` : `<span class="rng ${inRange ? 'in' : ''}">${fmt(d)} km<br>${inRange ? 'in range' : 'too far'}</span>`}</li>`; }).join('');
    list.hidden = false;
  });
  const submit = () => { if (!list.hidden && suggSel >= 0) { const id = suggIds[suggSel]; list.hidden = true; input.value = ''; travel(id, S.mode); return; } list.hidden = true; submitName(input.value); };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); return; }
    if (list.hidden || !suggIds.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); suggSel = (suggSel + (e.key === 'ArrowDown' ? 1 : -1) + suggIds.length) % suggIds.length; list.querySelectorAll('li').forEach((li, i) => li.setAttribute('aria-selected', String(i === suggSel))); input.setAttribute('aria-activedescendant', 'sg-' + suggSel); }
    else if (e.key === 'Escape') list.hidden = true;
  });
  input.addEventListener('blur', () => setTimeout(() => { list.hidden = true; }, 150));
  list.addEventListener('mousedown', e => { const li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); list.hidden = true; input.value = ''; travel(suggIds[+li.dataset.i], S.mode); } });
  $('entry-form').addEventListener('submit', e => { e.preventDefault(); submit(); });
  const menu = $('tools-menu');
  $('tools-btn').onclick = e => { e.stopPropagation(); menu.hidden = !menu.hidden; $('tools-btn').setAttribute('aria-expanded', String(!menu.hidden)); };
  menu.onclick = e => e.stopPropagation();
  if ($('btn-scout')) $('btn-scout').onclick = scout;
  document.querySelectorAll('.modes [data-mode]').forEach(b => b.onclick = () => { S.mode = b.dataset.mode; save(); lastMsg = S.mode === 'fly' && P.freeFlights && airportOK(S.cur) ? { text: `Your next ${P.freeFlights === 1 ? 'flight is' : P.freeFlights + ' flights are'} on us. After that, flights cost coins by distance. Landing refills your tank but scores nothing.`, cls: 'good' } : S.mode === 'train' ? { text: stationOK(S.cur) ? `Trains follow real track up to ${TRAIN_MAX_KM} km and cost a few coins${P.freeTrains ? ` (your next ${P.freeTrains === 1 ? 'ride is' : P.freeTrains + ' rides are'} free)` : ''}. They don't use fuel, and the town you arrive in scores half.` : `${G.name[S.cur]} has no ${RULES.trains === 'capitals' ? 'capital station' : 'station'}. Drive to one first.`, cls: '' } : S.mode === 'fly' ? { text: airportOK(S.cur) ? `Flights cost coins by distance: about ${flightCost(1000, S.flights)} coins for 1,000 km. Landing refills your tank but scores nothing.` : `${G.name[S.cur]} has no ${RULES.planes === 'capitals' ? 'capital airport' : RULES.planes === 'large' ? 'big airport' : 'airport'}. Drive to one first.`, cls: '' } : { text: '', cls: '' }; render(); $('entry-input').focus(); });
  if ($('btn-help-road')) $('btn-help-road').onclick = () => { const v = VEH(S.opts.vehicle); S.fuel = Math.max(S.fuel, v.tank * helpThreshold()); S.penalties += helpCost(); S.helps++; setMsg(`Help arrived: ${v.gauge.toLowerCase()} is back to ${Math.round(helpThreshold() * 100)}%. −${helpCost()} pts.`); save(); render(); tripMap.fit(tripBounds(), false, 56, 130); };
  $('btn-giveup').onclick = e => {
    const b = e.currentTarget;
    if (!b.dataset.armed) { b.dataset.armed = '1'; b.innerHTML = '<span>Tap again to give up</span>'; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.innerHTML = '<span>Give up and see a route</span>'; } }, 3000); return; }
    finishTrip(true); save(); render(); tripMap.fit(tripBounds(), false, 56, 130);
  };
  if ($('use-jerry')) $('use-jerry').onclick = useJerrycan;
  if ($('use-tow')) $('use-tow').onclick = useTow;
  if ($('use-ticket')) $('use-ticket').onclick = () => { P.consumables.ticket--; S.tickets++; S.ticketsTotal++; saveProfile(); setMsg('Extra ferry ticket added.', 'good'); save(); render(); };
  document.querySelectorAll('[data-reveal]').forEach(b => b.onclick = () => { S.scouts[+b.dataset.reveal].revealed = true; bsNote(S.scouts[+b.dataset.reveal].id, 'miss'); S.penalties += revealCost(); save(); render(); });
}

// ================= dialogs: new trip, settings, shop =================
document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-close]')) d.close(); }));
let draft = { ...opts };
function choiceGroup(el, items, key, fn, onPick) {
  el.innerHTML = items.map(it => `<button type="button" class="choice" data-v="${it.id}" aria-pressed="${draft[key] === it.id}" ${it.disabled ? `disabled title="${esc(it.disabled)}"` : ''}>${fn(it)}</button>`).join('');
  el.onclick = e => { const b = e.target.closest('[data-v]'); if (!b || b.disabled) return; draft[key] = b.dataset.v; el.querySelectorAll('[data-v]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.v === draft[key]))); if (onPick) onPick(); };
}
const ASSISTS = [{ id: 'explorer', name: 'Explorer', blurb: 'Suggestions as you type · ×1' }, { id: 'navigator', name: 'Navigator', blurb: 'No suggestions: type it from memory · ×1.25' }];
function openNew() {
  draft = { ...opts, regions: regionsOf(opts), via: [...(opts.via || [])] };
  if (draft.vehicle === 'train' && opts.classic) draft.vehicle = 'car';
  renderNewTrip();
  $('dlg-new').showModal();
}
// a place picker: type to search every settlement, pick one, or leave it on Random
function placePicker(el, value, label, onPick, filter) {
  const id = value == null ? null : G.byGid.get(value);
  el.innerHTML = `<div class="picker"><span class="label">${label}</span>
    <div class="pickfield ${id != null ? 'set' : ''}">${id != null ? `<span class="picked">${placeFlag(id)}<b>${esc(G.name[id])}</b><small>${esc(placeLine(id))}</small></span><button type="button" class="x small" data-clear aria-label="Clear ${esc(label)}">×</button>`
      : `<input type="text" class="field" placeholder="${label === 'Pass through' ? 'Add a place…' : 'Random'}" spellcheck="false" autocomplete="off" aria-label="${esc(label)}"><ul class="sugg" hidden role="listbox"></ul>`}</div></div>`;
  const clear = el.querySelector('[data-clear]'); if (clear) { clear.onclick = () => onPick(null); return; }
  const input = el.querySelector('input'), list = el.querySelector('ul'); let ids = [], sel = -1;
  const show = () => {
    const key = fold(input.value); sel = -1;
    if (!searchIndex || key.length < 2) { list.hidden = true; return; }
    ids = prefixIds(key).filter(i => !filter || filter(i)).sort((a, b) => G.pop[b] - G.pop[a]).slice(0, 8);
    list.innerHTML = ids.length ? ids.map((i, k) => `<li role="option" data-k="${k}" aria-selected="false"><div>${countryFlag(ccOf(i))}${esc(G.name[i])}<small>${esc(placeLine(i))} · ${esc(tierOf(i).label)}</small></div></li>`).join('') : `<li class="none"><div><small>No ${VEHICLES[draft.vehicle].rail ? 'station' : VEHICLES[draft.vehicle].coastal ? 'port' : 'place'} by that name</small></div></li>`;
    list.hidden = false;
  };
  input.oninput = show;
  input.onkeydown = e => {
    if (e.key === 'Enter') { e.preventDefault(); if (ids.length) onPick(G.gid[ids[Math.max(0, sel)]]); return; }
    if (list.hidden || !ids.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + ids.length) % ids.length; list.querySelectorAll('li').forEach((li, k) => li.setAttribute('aria-selected', String(k === sel))); }
    else if (e.key === 'Escape') { e.stopPropagation(); list.hidden = true; }
  };
  input.onblur = () => setTimeout(() => { list.hidden = true; }, 150);
  list.onmousedown = e => { const li = e.target.closest('[data-k]'); if (li) { e.preventDefault(); onPick(G.gid[ids[+li.dataset.k]]); } };
}
function renderNewTrip() {
  const railOk = TRAINS_READY && !opts.classic;
  choiceGroup($('opt-vehicle'), Object.values(VEHICLES).map(v => ({ ...v, disabled: v.rail && !railOk ? (opts.classic ? 'Classic rules have no train trips' : 'The rail network is still loading') : '' })), 'vehicle', v => `<b>${markerFor(v.id)} ${v.name}</b><small>${v.blurb}</small>`, () => { renderBrandMode(draft.vehicle); renderNewTrip(); });
  renderBrandMode(draft.vehicle);
  // Far-Flung Isles: a boat voyage to a remote island outpost, picked from a list or at random
  const voyage = draft.vehicle === 'boat' && !opts.classic && draft.voyage === 'isles';
  $('sec-voyage').hidden = draft.vehicle !== 'boat' || opts.classic;
  $('sec-regions').hidden = voyage; $('sec-length').hidden = voyage; $('pick-to').hidden = voyage; $('pick-via').hidden = voyage;
  if (draft.vehicle === 'boat' && !opts.classic) {
    draft.voyage ||= 'coast';
    choiceGroup($('opt-voyage'), [{ id: 'coast', name: 'Coastal trip', blurb: 'Port to port along the coast' }, { id: 'isles', name: '🏝️ Far-Flung Isles', blurb: 'Sail to a remote island outpost · ×1.3' }], 'voyage', x => `${x.name}<small>${x.blurb}</small>`, renderNewTrip);
    const list = isles(), reached = new Set((P.feats || {}).isles || []);
    $('isle-pick').innerHTML = voyage ? `<div class="isle-row">
        <label class="picker"><span class="label">Ocean</span><select class="field" id="isle-ocean"><option value="any">Any ocean</option>${OCEANS.map(x => `<option value="${x.id}" ${draft.ocean === x.id ? 'selected' : ''}>${x.name}</option>`).join('')}</select></label>
        <label class="picker"><span class="label">Outpost</span><select class="field" id="isle-target"><option value="">Random outpost${reached.size ? ' (new ones first)' : ''}</option>${OCEANS.filter(x => !draft.ocean || draft.ocean === 'any' || draft.ocean === x.id).map(oc => `<optgroup label="${oc.name}">${list.filter(x => x.ocean === oc.id).sort((a, b) => ccName(a.cc).localeCompare(ccName(b.cc))).map(x => `<option value="${G.gid[x.id]}" ${draft.isle === G.gid[x.id] ? 'selected' : ''}>${reached.has(G.gid[x.id]) ? '✓ ' : ''}${esc(G.name[x.id])} · ${esc(ccName(x.cc))}</option>`).join('')}</optgroup>`).join('')}</select></label>
      </div>
      <p class="hint" style="margin:8px 0 0">${draft.isle != null && isleOf(G.byGid.get(draft.isle)) ? esc(isleOf(G.byGid.get(draft.isle)).note) : `${list.length} outposts: overseas territories, remote islands and tiny island nations. Leave Start on Random for a port within sailing reach. ${reached.size} reached so far.`}</p>` : '';
    if (voyage) {
      $('isle-ocean').onchange = e => { draft.ocean = e.target.value; if (draft.isle != null) { const x = isleOf(G.byGid.get(draft.isle)); if (x && draft.ocean !== 'any' && x.ocean !== draft.ocean) draft.isle = null; } renderNewTrip(); };
      $('isle-target').onchange = e => { draft.isle = e.target.value ? +e.target.value : null; renderNewTrip(); };
    }
  } else $('isle-pick').innerHTML = '';
  // regions: pick any mix of continents, or Anywhere, or Uncharted
  const regs = new Set(draft.regions);
  $('opt-region').innerHTML = REGIONS.map(r => `<button type="button" class="choice ${r.id === 'ALL' || r.id === 'UNCHARTED' ? 'solo' : ''}" data-region="${r.id}" aria-pressed="${regs.has(r.id)}" ${VEHICLES[draft.vehicle].rail && !['ALL', 'UNCHARTED'].includes(r.id) && !railIn(r.id) ? 'disabled title="No rail network loaded here"' : ''}>${r.id === 'UNCHARTED' ? `${r.name}<small>The countries you know least · ×1.15</small>` : r.id === 'ALL' ? `${r.name}<small>Every continent</small>` : r.name}</button>`).join('');
  $('opt-region').onclick = e => {
    const b = e.target.closest('[data-region]'); if (!b || b.disabled) return; const id = b.dataset.region;
    if (id === 'ALL' || id === 'UNCHARTED') draft.regions = [id];
    else { const set = new Set(draft.regions.filter(x => x !== 'ALL' && x !== 'UNCHARTED')); if (set.has(id)) set.delete(id); else set.add(id); draft.regions = set.size ? [...set] : [id]; }
    renderNewTrip();
  };
  $('region-hint').textContent = draft.regions.length > 1 ? `Trips start and end anywhere in ${regionLabel(draft.regions)}.` : draft.regions[0] === 'EU' ? 'Russia west of the Urals counts as Europe, east of them as Asia.' : '';
  // route: optional start, end and places to pass through
  const veh = VEHICLES[draft.vehicle], fits = i => (!veh.rail || hasStation(i)) && (!veh.coastal || coastal(i));
  const setPlace = (key, gid) => { draft[key] = gid; renderNewTrip(); };
  placePicker($('pick-from'), draft.from, 'Start', gid => setPlace('from', gid), i => fits(i) && G.gid[i] !== draft.to && !draft.via.includes(G.gid[i]));
  placePicker($('pick-to'), draft.to, 'Destination', gid => setPlace('to', gid), i => fits(i) && G.gid[i] !== draft.from && !draft.via.includes(G.gid[i]));
  $('pick-via').innerHTML = `<span class="label">Pass through</span><div class="viachips">${draft.via.map((g, k) => { const i = G.byGid.get(g); return i == null ? '' : `<span class="tag">${placeFlag(i)}${esc(G.name[i])}<button type="button" data-unvia="${k}" aria-label="Remove ${esc(G.name[i])}">×</button></span>`; }).join('')}${draft.via.length < 3 ? '<span id="pick-via-add" class="viaadd"></span>' : ''}</div>`;
  $('pick-via').querySelectorAll('[data-unvia]').forEach(b => b.onclick = () => { draft.via.splice(+b.dataset.unvia, 1); renderNewTrip(); });
  if ($('pick-via-add')) placePicker($('pick-via-add'), null, 'Pass through', gid => { if (gid != null) draft.via.push(gid); renderNewTrip(); }, i => fits(i) && G.gid[i] !== draft.from && G.gid[i] !== draft.to && !draft.via.includes(G.gid[i]));
  const both = draft.from != null && draft.to != null;
  $('route-hint').innerHTML = !searchIndex ? 'Place search is still loading…' : voyage ? 'Pick a port to sail from, or leave it on Random.' : both
    ? (() => { const ids = [draft.from, ...draft.via, draft.to].map(g => G.byGid.get(g)); let km = 0; for (let k = 1; k < ids.length; k++) km += dist(G.lat[ids[k - 1]], G.lon[ids[k - 1]], G.lat[ids[k]], G.lon[ids[k]]); return `${ids.map(i => esc(G.name[i])).join(' → ')}: about ${fmt(km)} km as the crow flies, so it plays as ${(n => (/^[AEIOU]/.test(n) ? 'an ' : 'a ') + `<b>${n}</b>`)(lengthForKm(km, draft.vehicle).name)} trip. Length and region are ignored.`; })()
    : draft.from != null || draft.to != null ? 'The other end is picked at random from your regions, at the trip length below.'
    : draft.via.length ? 'Start and destination are picked at random so the route passes through your places.' : 'Leave these on Random, or pick a start, a destination and up to three places to pass through.';
  choiceGroup($('opt-length'), LENGTHS.map(l => ({ ...l, disabled: both ? 'The route you picked sets the length' : '' })), 'length', l => `${l.name}<small>${fmt(l.km[0] * LEN_SCALE[draft.vehicle])}–${fmt(l.km[1] * LEN_SCALE[draft.vehicle])} km · bonus ${l.bonus}</small>`);
  choiceGroup($('opt-assist'), ASSISTS, 'assist', a => `${a.name}<small>${a.blurb}</small>`, renderRules);
  renderRules();
  $('avoid-summary').innerHTML = opts.classic ? '<span class="hint">Classic rules are on. Turn them off in Settings.</span>'
    : `<div class="label">Avoiding</div><p class="hint" style="margin:6px 0 0">${opts.avoid.length ? opts.avoid.map(cc => esc(ccName(cc))).join(', ') : 'No countries.'} Change this in Settings or your Passport. The daily trip ignores it.</p>`;
}
$('start-trip').onclick = () => { opts = { ...opts, ...draft }; saveOpts(); if (startTrip(opts, false)) $('dlg-new').close(); };
$('start-daily').onclick = () => { opts = { ...opts, ...draft }; saveOpts(); if (startTrip(opts, true)) $('dlg-new').close(); };
$('btn-new').onclick = openNew;
$('dlg-new').addEventListener('close', () => { if (S) renderBrandMode(S.opts.vehicle); });
$('btn-help').onclick = () => $('dlg-help').showModal();
$('tier-table').innerHTML = `<thead><tr><th>Stop</th><th>Size</th><th>Points</th><th>Refill</th></tr></thead><tbody>${TIERS.map(t => `<tr><td><span class="tier ${t.id}">${t.label}</span></td><td>${t.id === 'capital' ? 'national capital' : t.note}</td><td>+${t.pts}</td><td>${Math.round(t.refill * 100)}% of tank</td></tr>`).join('')}
  <tr><td colspan="2">First visit ever</td><td>×1.5</td><td></td></tr><tr><td colspan="2">2nd, 3rd, 4th visit</td><td>×1 · ×0.75 · ×0.6</td><td></td></tr><tr><td colspan="2">5th visit onwards</td><td>×0.5 → ×0.35</td><td></td></tr>
  <tr><td colspan="2">A hop shorter than a fifth of your tank</td><td>down to ×0.25</td><td></td></tr>
  <tr><td colspan="2">4th and 5th visit refuel</td><td></td><td>half</td></tr><tr><td colspan="2">6th visit onwards refuel</td><td></td><td>a quarter</td></tr>
  <tr><td colspan="2">Passing a checkpoint you picked</td><td>+${VIA_BONUS}</td><td></td></tr>
  <tr><td colspan="2">Reaching the destination</td><td>${LENGTHS.map(l => `${l.name} +${l.bonus}`).join(' · ')}</td><td>+${TICKET_BONUS} per spare ticket</td></tr></tbody>`;

function setAvoid(cc, on) {
  const set = new Set(opts.avoid); if (on) set.add(cc); else set.delete(cc); opts.avoid = [...set]; saveOpts();
  toast(on ? `Avoiding ${ccName(cc)} from your next trip` : `No longer avoiding ${ccName(cc)}`);
}
function renderSettings() {
  $('set-classic').checked = !!opts.classic; $('set-sound').checked = P.sound !== false;
  $('set-popup').innerHTML = POPUP_SIZES.map(x => `<button type="button" data-popup="${x.id}" aria-pressed="${(P.flagPopup || 'medium') === x.id}">${x.name}</button>`).join('');
  $('avoid-tags').innerHTML = opts.avoid.length ? opts.avoid.map(cc => `<span class="tag">${countryFlag(cc)}${esc(ccName(cc))}<button type="button" data-unavoid="${cc}" aria-label="Stop avoiding ${esc(ccName(cc))}">×</button></span>`).join('') : '<span class="hint">Not avoiding any countries.</span>';
  $('avoid-add').innerHTML = G.countries.map((c, i) => [c, i]).filter(([c, i]) => G.placeCount[i] > 0 && !opts.avoid.includes(c[0])).sort((a, b) => a[0][1].localeCompare(b[0][1])).map(([c]) => `<option value="${c[0]}">${esc(c[1])}</option>`).join('');
  $('avoid-tags').querySelectorAll('[data-unavoid]').forEach(b => b.onclick = () => { setAvoid(b.dataset.unavoid, false); renderSettings(); });
  const opt = (value, label, sel) => `<option value="${value}" ${sel ? 'selected' : ''}>${label}</option>`;
  $('equip').innerHTML = `
    <div class="switchrow"><span>Interface theme</span><select class="field" id="eq-theme">${Object.entries(THEMES).filter(([k, x]) => !x.price || P.owned.includes('theme:' + k)).map(([k, x]) => opt(k, x.name, P.equip.theme === k)).join('')}</select></div>
    <div class="switchrow"><span>Map style</span><select class="field" id="eq-style">${Object.keys(STYLES).filter(k => P.owned.includes('style:' + k)).map(k => opt(k, STYLES[k].name, P.equip.style === k)).join('')}</select></div>
    <div class="switchrow"><span>Route colour</span><select class="field" id="eq-route">${ROUTES.filter(r => P.owned.includes('route:' + r.id)).map(r => opt(r.id, r.name, P.equip.route === r.id)).join('')}</select></div>
    <div class="switchrow"><span>Map cursor</span><select class="field" id="eq-cursor">${CURSORS.filter(c => P.owned.includes('cursor:' + c.id)).map(c => opt(c.id, `${c.emoji} ${c.name}`, P.equip.cursor === c.id)).join('')}</select></div>
    ${Object.values(VEHICLES).map(v => `<div class="switchrow"><span>${v.name} marker</span><select class="field" data-marker="${v.id}">${opt('', `${v.icon} Standard`, !P.equip.markers[v.id])}${MARKERS.filter(m => m.vehicle === v.id && P.owned.includes('marker:' + m.id)).map(m => opt(m.id, `${m.icon} ${m.name}`, P.equip.markers[v.id] === m.id)).join('')}</select></div>`).join('')}
    <div class="switchrow"><span>Destination sign</span><select class="field" id="eq-sign">${SIGNS.filter(x => !x.price || P.owned.includes('sign:' + x.id)).map(x => opt(x.id, x.name, P.equip.sign === x.id)).join('')}</select></div>
    <div class="switchrow"><span>Route trail</span><select class="field" id="eq-trail">${TRAILS.filter(x => !x.price || P.owned.includes('trail:' + x.id)).map(x => opt(x.id, x.name, P.equip.trail === x.id)).join('')}</select></div>
    <div class="switchrow"><span>Arrival effect</span><select class="field" id="eq-effect">${EFFECTS.filter(x => !x.price || P.owned.includes('effect:' + x.id)).map(x => opt(x.id, x.name, P.equip.effect === x.id)).join('')}</select></div>
    <div class="switchrow"><span>Stamp inks</span><select class="field" id="eq-ink">${Object.entries(INK_PACKS).filter(([k, x]) => !x.price || P.owned.includes('ink:' + k)).map(([k, x]) => opt(k, x.name, P.equip.ink === k)).join('')}</select></div>
    <div class="switchrow"><span>Sound pack</span><select class="field" id="eq-sound">${Object.entries(SOUND_PACKS).filter(([k, x]) => !x.price || P.owned.includes('sound:' + k)).map(([k, x]) => opt(k, `${x.icon} ${x.name}`, P.equip.sound === k)).join('')}</select></div>
    ${P.owned.includes('holo:on') ? `<div class="switchrow"><span>Holo shine on legendary flags</span><label class="toggle"><input type="checkbox" id="eq-holo" ${P.equip.holo ? 'checked' : ''} aria-label="Holo shine"><span></span></label></div>` : ''}
    <p class="hint">Buy more in the shop.</p>`;
  ['theme', 'sign', 'trail', 'effect', 'ink', 'sound'].forEach(k => { $('eq-' + k).onchange = e => { P.equip[k] = e.target.value; saveProfile(); ensureEquipDefaults(); render(); if (k === 'sound') chime(2, false); }; });
  if ($('eq-holo')) $('eq-holo').onchange = e => { P.equip.holo = e.target.checked; saveProfile(); ensureEquipDefaults(); };
  $('eq-style').onchange = e => { P.equip.style = e.target.value; saveProfile(); tripMap.draw(); };
  $('eq-route').onchange = e => { P.equip.route = e.target.value; saveProfile(); applyCosmetics(); tripMap.draw(); };
  $('eq-cursor').onchange = e => { P.equip.cursor = e.target.value; saveProfile(); applyCosmetics(); };
  $('equip').querySelectorAll('[data-marker]').forEach(sel => sel.onchange = () => { if (sel.value) P.equip.markers[sel.dataset.marker] = sel.value; else delete P.equip.markers[sel.dataset.marker]; saveProfile(); render(); });
}
$('btn-settings').onclick = () => { renderSettings(); $('dlg-settings').showModal(); };
$('set-classic').onchange = e => { opts.classic = e.target.checked; saveOpts(); toast(opts.classic ? 'Classic rules apply from your next trip' : 'V3 rules apply from your next trip'); };
$('set-popup').onclick = e => { const b = e.target.closest('[data-popup]'); if (!b) return; P.flagPopup = b.dataset.popup; saveProfile(); renderSettings(); };
// a sample card with two flags you haven't collected yet; nothing is granted
$('popup-preview').onclick = () => {
  const cat = flagCatalog(); if (!cat) { toast('Flags are still loading'); return; }
  const sample = [cat.all.find(f => f.rarity === 4 && !owns(f.key)), cat.all.find(f => f.rarity === 1 && !owns(f.key))].filter(Boolean);
  const a = albumOf(sample[0].cc);
  $('dlg-settings').close();
  showFlagDrop(sample, 47, [{ cc: sample[0].cc, before: a.have, have: a.have + 1, total: a.total }], [{ icon: '👀', text: 'Preview: nothing was added to your collection' }]);
};
$('set-sound').onchange = e => { P.sound = e.target.checked; saveProfile(); if (P.sound) chime(2, false); };
$('avoid-add-btn').onclick = () => { const cc = $('avoid-add').value; if (cc) { setAvoid(cc, true); renderSettings(); } };

const SHOP_TABS = [
  { id: 'supplies', name: 'Supplies' }, { id: 'upgrades', name: 'Upgrades' }, { id: 'themes', name: 'Themes' },
  { id: 'maps', name: 'Maps' }, { id: 'road', name: 'Signs & routes' }, { id: 'extras', name: 'Collection' },
];
let shopTab = store.get('stopover-shoptab') || 'supplies';
function renderShop() {
  ensureEquipDefaults();
  if (!SHOP_TABS.some(t => t.id === shopTab)) shopTab = 'supplies';
  const league = LEAGUES.indexOf(leagueOf(explorerRating().total));
  const card = (key, title, blurb, price, swatch, extra = '') => {
    const owned = price === 0 || P.owned.includes(key), [kind, id] = key.split(':'), equipped = owned && ((kind === 'marker' && P.equip.markers[(MARKERS.find(m => m.id === id) || {}).vehicle] === id) || P.equip[kind] === id || (kind === 'holo' && P.equip.holo));
    return `<div class="item"><div class="swatch" style="${swatch.style || ''}">${swatch.html || ''}</div><div><b>${esc(title)}</b><small>${esc(blurb)}</small></div>
      <div class="row">${owned ? (equipped ? '<span class="chip good">Equipped</span>' : kind === 'holo' ? '<span class="chip good">Owned</span>' : `<button class="btn small" type="button" data-equip="${key}">Use</button>`) : `<span class="price"><i></i>${price}</span><button class="btn small go" type="button" data-buy="${key}" data-price="${price}" ${P.coins < price ? 'disabled' : ''}>Buy</button>`}${extra}</div></div>`;
  };
  const styleSwatch = k => { const p = PALETTES[k](); if (p.raster) return { style: `background: url(maps/${p.raster}.jpg) 52% 30% / 900% auto; ${p.filter ? 'filter:' + p.filter : ''}` }; return { style: `background: linear-gradient(135deg, ${p.sea} 0 38%, ${p.fills ? p.fills[0] : p.land} 38% 60%, ${p.coast} 60% 62%, ${p.fills ? p.fills[3] : p.land} 62%)` }; };
  const section = (title, hint, html) => `<div class="shopsection"><div class="label">${title}</div>${hint ? `<p class="hint" style="margin:4px 0 0">${hint}</p>` : ''}<div class="shopgrid">${html}</div></div>`;
  const trailSvg = t => `<svg viewBox="0 0 120 50" width="100%" height="100%" aria-hidden="true"><path d="M8 40 C 40 5, 70 45, 112 10" fill="none" stroke="${t === 'rainbow' ? 'url(#rb)' : routeColor()}" stroke-width="${t === 'dotted' ? 5 : 4}" stroke-linecap="round" ${t === 'dotted' ? 'stroke-dasharray="0.1 9"' : t === 'march' ? 'stroke-dasharray="9 6" class="marching"' : ''} ${t === 'glow' ? 'style="filter:drop-shadow(0 0 4px ' + routeColor() + ')"' : ''}/><defs><linearGradient id="rb"><stop offset="0" stop-color="#EF476F"/><stop offset=".33" stop-color="#FFD166"/><stop offset=".66" stop-color="#06D6A0"/><stop offset="1" stop-color="#118AB2"/></linearGradient></defs></svg>`;
  const byPrice = list => list.slice().sort((x, y) => x.price - y.price || (x.league || 0) - (y.league || 0));
  const entries = obj => byPrice(Object.entries(obj).map(([k, x]) => ({ ...x, id: k })));
  const night = isDarkUI();
  const tabs = {
    supplies: () => section('Supplies', 'One-off help for a trip, used from the Tools menu. Three that earn their place: range when a leg is just out of reach, a crossing when an island is the only way on, and an undo for the wrong turn.', byPrice(CONSUMABLES).map(c => `<div class="item"><div class="swatch" style="background: var(--panel)">${c.icon}</div><div><b>${c.name}</b><small>${c.blurb} You have ${P.consumables[c.id] || 0}.</small></div><div class="row"><span class="price"><i></i>${c.price}</span><button class="btn small go" type="button" data-supply="${c.id}" data-price="${c.price}" ${P.coins < c.price ? 'disabled' : ''}>Buy</button></div></div>`).join('')),
    upgrades: () => section('Upgrades', 'Permanent, and each one changes how a trip plays. The bigger ones need a passport league as well as coins.', PERKS.map(p => { const owned = hasPerk(p.id), locked = league < p.league;
      return `<div class="item ${locked && !owned ? 'lockeditem' : ''}"><div class="swatch" style="background: var(--panel)">${p.icon}</div><div><b>${esc(p.name)}</b><small>${esc(p.blurb)}${p.league ? ` Needs ${esc(LEAGUES[p.league].name)}.` : ''}</small></div><div class="row">${owned ? '<span class="chip good">Owned</span>' : locked ? `<span class="price"><i></i>${p.price}</span><span class="chip warn">🔒 ${esc(LEAGUES[p.league].name)}</span>` : `<span class="price"><i></i>${p.price}</span><button class="btn small go" type="button" data-buy="perk:${p.id}" data-price="${p.price}" ${P.coins < p.price ? 'disabled' : ''}>Buy</button>`}</div></div>`; }).join('')),
    themes: () => section('Interface themes', `Recolour the whole game: panels, text, buttons and toggles. Destination signs and map styles stay as they are. Every theme has a day and a night version; the preview shows ${night ? 'night' : 'day'}.`, entries(THEMES).map(x => card('theme:' + x.id, x.name, x.blurb, x.price, { html: themeSwatch(x.id, night), style: 'padding:0' })).join('')),
    maps: () => section('Map styles', 'How the map under your trip is drawn.', entries(STYLES).map(x => card('style:' + x.id, x.name, x.blurb, x.price, styleSwatch(x.id))).join('')),
    road: () => section('Destination signs', 'The road plate above your trip.', byPrice(SIGNS).map(x => card('sign:' + x.id, x.name, x.blurb, x.price, { html: `<span class="signswatch sign-${x.id}">MADRID</span>`, style: 'background: var(--panel)' })).join(''))
      + section('Route trails', 'How your route is drawn on the trip map.', byPrice(TRAILS).map(x => card('trail:' + x.id, x.name, x.blurb, x.price, { html: trailSvg(x.id), style: 'background: var(--panel)' })).join(''))
      + section('Route colours', '', byPrice(ROUTES).map(r => card('route:' + r.id, r.name, 'The line your trip draws.', r.price, { style: `background: linear-gradient(160deg, var(--panel) 44%, ${r.color} 44% 56%, var(--panel) 56%)` })).join(''))
      + section('Vehicle markers', '', byPrice(MARKERS).map(m => card('marker:' + m.id, m.name, `Replaces the ${VEHICLES[m.vehicle].name.toLowerCase()} on the map.`, m.price, { html: m.icon, style: 'background: var(--panel)' })).join(''))
      + section('Arrival effects', 'Played over the map when you reach the destination.', byPrice(EFFECTS).map(x => card('effect:' + x.id, x.name, x.blurb, x.price, { html: { none: '🏁', fireworks: '🎆', confetti: '🎉' }[x.id], style: 'background: var(--panel)' }, x.id === 'none' ? '' : `<button class="btn small" type="button" data-preview-effect="${x.id}">Preview</button>`)).join(''))
      + section('Map cursors', '', byPrice(CURSORS).map(c => card('cursor:' + c.id, c.name, 'What you point with on every map.', c.price, { html: c.emoji || '↖', style: 'background: var(--panel)' })).join('')),
    extras: () => section('Flag collection', 'Completed country albums get gold frames for free.', card('holo:on', HOLO.name, HOLO.blurb, HOLO.price, { html: '<span class="holoswatch">✦</span>', style: 'background: linear-gradient(120deg,#FFE08A,#F6A5FF,#9BE7FF,#FFE08A)' }))
      + section('Stamp inks', 'The colours of the entry stamps in your passport.', entries(INK_PACKS).map(x => card('ink:' + x.id, x.name, 'Every new and old stamp in these inks.', x.price, { html: x.inks.map(c => `<i style="display:inline-block;width:16px;height:16px;border-radius:50%;background:${c};margin:2px"></i>`).join(''), style: 'background: #F6F1E3' })).join(''))
      + section('Sound packs', 'The chime you hear when a flag lands.', entries(SOUND_PACKS).map(x => card('sound:' + x.id, x.name, 'Plays when you collect a flag.', x.price, { html: x.icon, style: 'background: var(--panel)' }, `<button class="btn small" type="button" data-preview-sound="${x.id}" aria-label="Play ${esc(x.name)}">▶</button>`)).join('')),
  };
  $('shop-body').innerHTML = `
    <div class="shophead"><span class="coins"><i></i><span>${fmt(P.coins)}</span></span><span class="hint">Trips pay 1 coin per 10 points, and longer trips pay a bigger arrival bonus. Flags, study, blind spots and achievements top it up.</span></div>
    <div class="tabs shoptabs" role="tablist">${SHOP_TABS.map(t => `<button type="button" role="tab" data-shoptab="${t.id}" aria-selected="${t.id === shopTab}">${t.name}</button>`).join('')}</div>
    <div role="tabpanel">${tabs[shopTab]()}</div>`;
  $('shop-body').querySelectorAll('[data-shoptab]').forEach(b => b.onclick = () => { shopTab = b.dataset.shoptab; store.set('stopover-shoptab', shopTab); renderShop(); });
  const equip = key => {
    const [kind, id] = key.split(':');
    if (kind === 'style') P.equip.style = id; else if (kind === 'route') P.equip.route = id; else if (kind === 'cursor') P.equip.cursor = id; else if (kind === 'marker') P.equip.markers[MARKERS.find(m => m.id === id).vehicle] = id;
    else if (kind === 'holo') P.equip.holo = true; else if (['theme', 'sign', 'trail', 'effect', 'ink', 'sound'].includes(kind)) P.equip[kind] = id;
  };
  $('shop-body').querySelectorAll('[data-buy]').forEach(b => b.onclick = () => {
    const price = +b.dataset.price; if (P.coins < price) return;
    P.coins -= price; P.owned.push(b.dataset.buy); equip(b.dataset.buy);
    const [kind, id] = b.dataset.buy.split(':');
    saveProfile(); ensureEquipDefaults(); renderCoins(); renderShop(); applyCosmetics(); render(); renderLeagueChip();
    toast(kind === 'perk' ? `${PERKS.find(p => p.id === id).name} is yours for good` : 'Bought and equipped');
  });
  $('shop-body').querySelectorAll('[data-equip]').forEach(b => b.onclick = () => { equip(b.dataset.equip); saveProfile(); ensureEquipDefaults(); renderShop(); applyCosmetics(); render(); tripMap.draw(); });
  $('shop-body').querySelectorAll('[data-supply]').forEach(b => b.onclick = () => {
    const price = +b.dataset.price, id = b.dataset.supply; if (P.coins < price) return; P.coins -= price;
    P.consumables[id] = (P.consumables[id] || 0) + 1;
    saveProfile(); renderCoins(); renderShop(); if (S && !S.done) render(); toast('Added to your supplies');
  });
  $('shop-body').querySelectorAll('[data-preview-sound]').forEach(b => b.onclick = () => chime(3, true, b.dataset.previewSound));
  $('shop-body').querySelectorAll('[data-preview-effect]').forEach(b => b.onclick = () => { const was = P.equip.effect; P.equip.effect = b.dataset.previewEffect; $('dlg-shop').close(); playArrivalEffect(); P.equip.effect = was; });
}
$('btn-shop').onclick = () => { renderShop(); $('dlg-shop').showModal(); };

// ================= debug tools =================
$('debug-fuel').onchange = e => { P.debug = { ...(P.debug || {}), infiniteFuel: e.target.checked }; saveProfile(); toast(e.target.checked ? 'Infinite fuel on' : 'Infinite fuel off'); if (S) render(); };
$('debug').addEventListener('toggle', () => { $('debug-fuel').checked = !!(P.debug && P.debug.infiniteFuel); });
document.querySelectorAll('[data-debug]').forEach(btn => btn.onclick = () => {
  const act = btn.dataset.debug, v = S && VEH(S.opts.vehicle);
  if (act === 'news') { $('dlg-settings').close(); showNews('all'); }
  else if (act === 'news-train') { $('dlg-settings').close(); showNews('trains'); }
  else if (act === 'flagdrop') {
    const cat = flagCatalog(); if (!cat) { toast('Flags are still loading'); return; }
    const pickR = r => cat.all.filter(f => !owns(f.key) && f.rarity === r)[0];
    const keys = [pickR(4), pickR(1)].filter(Boolean).map(f => f.key); keys.forEach(k => { P.flagsSeen[k] = Date.now(); });
    $('dlg-settings').close(); celebrateFlags(keys);
  }
  else if (act === 'blind') { bsSample(12); $('dlg-settings').close(); openBlind(); }
  else if (act === 'coins') { P.coins += 10000; saveProfile(); renderCoins(); toast('+10,000 coins'); }
  else if (act === 'unlock') { for (const k of Object.keys(STYLES)) P.owned.push('style:' + k); for (const m of MARKERS) P.owned.push('marker:' + m.id); for (const r of ROUTES) P.owned.push('route:' + r.id); for (const c of CURSORS) P.owned.push('cursor:' + c.id); for (const x of SIGNS) P.owned.push('sign:' + x.id); for (const k of Object.keys(THEMES)) P.owned.push('theme:' + k); for (const x of TRAILS) P.owned.push('trail:' + x.id); for (const x of EFFECTS) P.owned.push('effect:' + x.id); for (const k of Object.keys(INK_PACKS)) P.owned.push('ink:' + k); for (const k of Object.keys(SOUND_PACKS)) P.owned.push('sound:' + k); for (const p of PERKS) P.owned.push('perk:' + p.id); P.owned.push('holo:on'); P.owned = [...new Set(P.owned)]; saveProfile(); renderSettings(); toast('Everything in the shop is unlocked'); }
  else if (act === 'supplies') { for (const c of CONSUMABLES) P.consumables[c.id] = (P.consumables[c.id] || 0) + 10; saveProfile(); if (S && !S.done) render(); toast('+10 of every supply'); }
  else if (!S || S.done) toast('Start a trip first');
  else if (act === 'fill') { S.fuel = v.tank; save(); render(); tripMap.fit(tripBounds(), false, 56, 130); toast('Tank filled'); }
  else if (act === 'tickets') { S.tickets += 5; S.ticketsTotal += 5; save(); render(); toast('+5 ferry tickets'); }
  else if (act === 'route') {
    const taken = new Set([S.start, ...S.stops.map(s => s.id)]); taken.delete(S.cur);
    S.rescue = rescueRoute();
    if (!S.rescue) { toast('No route found from here'); return; }
    S.rescuePaths = rescuePaths(S.rescue);
    S.showRoute = true; save(); render(); tripMap.fit(tripBounds(), false, 56, 130); $('dlg-settings').close();
    toast('Route shown on the map: ' + S.rescue.slice(1, -1).map(id => G.name[id]).join(' → '));
  }
  else if (act === 'finish') { $('dlg-settings').close(); const infinite = P.debug && P.debug.infiniteFuel; P.debug = { ...(P.debug || {}), infiniteFuel: true }; S.tickets += 3; for (const id of viaLeft()) travel(id); travel(S.dest); if (!infinite) P.debug.infiniteFuel = false; saveProfile(); }
  else if (act === 'reset') {
    if (!btn.dataset.armed) { btn.dataset.armed = '1'; btn.textContent = 'Tap again to erase everything'; return; }
    store.set('stopover-profile', null); store.set('stopover-trip', null); store.set('stopover-passport', null); location.reload();
  }
});

// console access for testing: stopoverDebug.checkLeg(...), stopoverDebug.find('Tirana')
window.stopoverDebug = { get G() { return G; }, get S() { return S; }, generateTrip, generateVoyage, isles, get VOYAGE() { return VOYAGE; }, learningRoute, get RULES() { return RULES; }, checkLeg, travel, railPath, hasStation, get RAIL() { return RAIL; }, find: name => exactIds(fold(name)).map(id => ({ id, name: G.name[id], country: ccOf(id), pop: G.pop[id] })) };

// ================= night mode =================
function applyTheme(theme) {
  if (theme) document.documentElement.dataset.theme = theme; else delete document.documentElement.dataset.theme;
  const dark = isDarkUI();
  $('btn-theme').textContent = dark ? '☀️' : '🌙';
  $('btn-theme').setAttribute('aria-label', dark ? 'Switch to day mode' : 'Switch to night mode');
  for (const m of [tripMap, ppMap, stMap]) m.draw();
  if ($('dlg-shop').open) renderShop();
}
$('btn-theme').onclick = () => { const next = isDarkUI() ? 'light' : 'dark'; store.set('stopover-theme', next); applyTheme(next); };

// ================= difficulty presets and rules =================
const PRESETS = [
  { id: 'beginner', name: 'Beginner', blurb: 'Fly anywhere, big tank', rules: { planes: 'all', trains: 'all', ferries: 'on', tank: 'big', hints: 'on' }, assist: 'explorer' },
  { id: 'standard', name: 'Standard', blurb: 'Big airports, normal tank', rules: { ...DEFAULT_RULES }, assist: 'explorer' },
  { id: 'expert', name: 'Expert', blurb: 'Capitals only, from memory', rules: { planes: 'capitals', trains: 'capitals', ferries: 'on', tank: 'standard', hints: 'on' }, assist: 'navigator' },
  { id: 'purist', name: 'Purist', blurb: 'No planes, trains or hints', rules: { planes: 'off', trains: 'off', ferries: 'on', tank: 'small', hints: 'off' }, assist: 'navigator' },
];
function renderRules() {
  draft.rules = { ...DEFAULT_RULES, ...(draft.rules || {}) };
  // only the rules that change a trip in this vehicle are shown and counted: a boat has no use for planes
  const live = rulesThatApply(draft.vehicle, draft.regions);
  const same = p => p.assist === draft.assist && live.every(k => p.rules[k] === draft.rules[k]);
  $('opt-preset').innerHTML = PRESETS.map(p => `<button type="button" class="choice" data-preset="${p.id}" aria-pressed="${same(p)}">${p.name} <span class="mult" style="font-size:12px">×${scoreMultiplier(p.rules, p.assist, 0, draft.regions, draft.vehicle).toFixed(2)}</span><small>${p.blurb}</small></button>`).join('');
  $('opt-rules').innerHTML = Object.entries(RULE_OPTIONS).filter(([key]) => live.includes(key)).map(([key, r]) => `<div class="rulerow"><span class="label">${r.label}</span><div class="choices">${r.options.map(o => `<button type="button" class="choice" data-rule="${key}" data-v="${o.id}" aria-pressed="${draft.rules[key] === o.id}">${o.name} <small>${o.note} · ×${o.mult}</small></button>`).join('')}</div></div>`).join('');
  $('mult-badge').textContent = 'Score ×' + (scoreMultiplier(draft.rules, draft.assist, opts.classic ? 0 : (opts.avoid || []).length, draft.regions, draft.vehicle) * (draft.vehicle === 'boat' && draft.voyage === 'isles' && !opts.classic ? 1.3 : 1)).toFixed(2);
  $('opt-preset').onclick = e => { const b = e.target.closest('[data-preset]'); if (!b) return; const p = PRESETS.find(x => x.id === b.dataset.preset); draft.rules = { ...p.rules }; draft.assist = p.assist; choiceGroup($('opt-assist'), ASSISTS, 'assist', a => `${a.name}<small>${a.blurb}</small>`, renderRules); renderRules(); };
  $('opt-rules').onclick = e => { const b = e.target.closest('[data-rule]'); if (!b || b.disabled) return; draft.rules[b.dataset.rule] = b.dataset.v; renderRules(); };
}

// ================= announcements =================
// Planes open first; trains open after, so the train card sits on top of the plane card. Closing it reveals planes.
function showNews(force) {
  P.news = P.news || {};
  const plane = force === 'planes' || force === 'all' || (!force && !P.news.planes), train = force === 'trains' || force === 'all' || (!force && !P.news.trains);
  if (!P.news.planes) { P.news.planes = Date.now(); P.freeFlights = (P.freeFlights || 0) + 2; }
  if (!P.news.trains) { P.news.trains = Date.now(); P.freeTrains = (P.freeTrains || 0) + 2; }
  saveProfile(); if (S && !S.done) render();
  if (plane && !$('dlg-news').open) $('dlg-news').showModal();
  if (train && !$('dlg-news-train').open) $('dlg-news-train').showModal();
  $('dlg-news-train').classList.toggle('stacked', $('dlg-news').open);
}
$('news-fly').onclick = () => {
  $('dlg-news').close();
  if (S && !S.done && availableModes().includes('fly')) { const b = document.querySelector('.modes [data-mode="fly"]'); if (b) b.click(); }
  else toast('Flights are ready on your next trip. Pick a rule set with planes on.');
};
$('news-train-go').onclick = () => {
  $('dlg-news-train').close();
  if ($('dlg-news').open) return; // the plane card underneath still wants an answer
  if (S && !S.done && availableModes().includes('train')) { const b = document.querySelector('.modes [data-mode="train"]'); if (b) b.click(); }
  else toast(`Trains are ready on your next trip in ${[...RAIL_REGIONS].map(r => (REGIONS.find(x => x.id === r) || { name: r }).name).join(', ') || 'regions with a rail network'}. Pick a rule set with trains on, or take a Train trip.`);
};
$('dlg-news').addEventListener('close', () => $('dlg-news-train').classList.remove('stacked'));

document.addEventListener('click', () => { const m = $('tools-menu'); if (m && !m.hidden) { m.hidden = true; $('tools-btn').setAttribute('aria-expanded', 'false'); } });

// ================= brand: the road under the logo matches the vehicle =================
const BRAND_SCENES = {
  car: `<svg viewBox="0 0 72 28" aria-hidden="true"><rect x="0" y="9" width="72" height="12" rx="2" fill="#3B3F45"/><path class="lane" d="M-8 15 H80" stroke="#F6F1E3" stroke-width="1.8" stroke-dasharray="7 5"/><path d="M0 9.5 H72 M0 20.5 H72" stroke="#F6F1E3" stroke-width=".8" opacity=".6"/></svg>`,
  bike: `<svg viewBox="0 0 72 28" aria-hidden="true"><rect x="0" y="16" width="72" height="6" rx="3" fill="#C0694A"/><path class="lane" d="M-8 19 H80" stroke="#F6F1E3" stroke-width="1" stroke-dasharray="3 4"/><g class="rider" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="27" cy="12" r="4.2"/><circle cx="45" cy="12" r="4.2"/><path d="M27 12 L33 5 L41 5 L45 12 M33 5 L36 12 L41 5 M31 3 H35 M41 5 L40 2.5 H43"/></g></svg>`,
  boat: `<svg viewBox="0 0 72 28" aria-hidden="true"><g class="waves" fill="none" stroke="#1D6FB8" stroke-width="2" stroke-linecap="round"><path d="M-12 14 q4 -3 8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0"/><path d="M-16 21 q4 -3 8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0" opacity=".55"/></g></svg>`,
  train: `<svg viewBox="0 0 72 28" aria-hidden="true"><g class="sleepers" fill="#8A6A4A"><rect x="-10" y="8" width="3" height="14"/><rect x="-2" y="8" width="3" height="14"/><rect x="6" y="8" width="3" height="14"/><rect x="14" y="8" width="3" height="14"/><rect x="22" y="8" width="3" height="14"/><rect x="30" y="8" width="3" height="14"/><rect x="38" y="8" width="3" height="14"/><rect x="46" y="8" width="3" height="14"/><rect x="54" y="8" width="3" height="14"/><rect x="62" y="8" width="3" height="14"/><rect x="70" y="8" width="3" height="14"/></g><path d="M0 11 H72 M0 19 H72" stroke="#5F6368" stroke-width="2"/></svg>`,
};
function renderBrandMode(vehicle) {
  const el = $('brand-mode'); if (!el) return;
  const v = VEHICLES[vehicle] ? vehicle : 'car';
  if (el.dataset.mode === v) return;
  el.dataset.mode = v; el.className = 'brandmode mode-' + v; el.innerHTML = BRAND_SCENES[v]; el.title = VEHICLES[v].name + ' trip';
}
