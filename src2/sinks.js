// ================= coin sinks: study decks, flight classes, rerolls and the high-stakes run =================
// Things to spend a pile of coins on once the map styles are all bought. None of them make a ranked trip
// easier: flight upgrades don't exist in races, the daily and weekly trips, or the high-stakes run.

// ---- study decks: places from all over the world, drilled like a country in Study
const isCapital = i => G.fc[i] === G.capital;
const contOfId = i => G.contOf[G.cc[i]];
const STUDY_DECKS = [
  { id: 'capitals-eu', name: 'Capitals of Europe', price: 400, blurb: 'Every European capital.', test: i => isCapital(i) && contOfId(i) === 'EU' },
  { id: 'capitals-as', name: 'Capitals of Asia', price: 400, blurb: 'From Ankara to Tokyo.', test: i => isCapital(i) && contOfId(i) === 'AS' },
  { id: 'capitals-af', name: 'Capitals of Africa', price: 500, blurb: 'All 54 and a few more.', test: i => isCapital(i) && contOfId(i) === 'AF' },
  { id: 'capitals-am', name: 'Capitals of the Americas', price: 500, blurb: 'North, Central, South and the Caribbean.', test: i => isCapital(i) && ['NA', 'SA'].includes(contOfId(i)) },
  { id: 'capitals-oc', name: 'Capitals of Oceania', price: 300, blurb: 'Specks in the Pacific included.', test: i => isCapital(i) && contOfId(i) === 'OC' },
  { id: 'islands', name: 'Island capitals', price: 600, blurb: 'The capitals of island nations.', test: i => isCapital(i) && ISLAND_NATIONS.includes(ccOf(i)) },
  { id: 'megacities', name: 'Megacities', price: 800, blurb: 'Every city of 5 million or more.', test: i => G.pop[i] >= 5e6 },
  { id: 'disputed', name: 'Disputed ground', price: 700, blurb: 'Towns in breakaway and contested territories.', test: i => { const a = G.area[i] ? areaName(i) : null; return !!a && !!DISPUTED[a] && G.pop[i] >= 5000; } },
  { id: 'million', name: 'Million-plus cities', price: 1200, blurb: 'Every city past a million people.', test: i => G.pop[i] >= 1e6 },
  { id: 'capitals-world', name: 'Every capital on Earth', price: 1500, blurb: 'The whole list, one country after another.', test: isCapital },
];
const deckOf = id => STUDY_DECKS.find(d => d.id === id);
const ownsDeck = id => P.owned.includes('deck:' + id);
const DECK_POOLS = new Map();
function deckPool(id) {
  if (DECK_POOLS.has(id)) return DECK_POOLS.get(id).slice();
  const d = deckOf(id), out = [], capsSeen = new Set();
  for (let i = 0; i < G.n; i++) if (d.test(i)) out.push(i);
  out.sort((a, b) => G.pop[b] - G.pop[a]);
  // a country with two capital entries (a seat of government and a capital) counts once
  const pool = out.filter(i => { if (!id.startsWith('capitals') && id !== 'islands') return true; const cc = ccOf(i); if (capsSeen.has(cc)) return false; capsSeen.add(cc); return true; });
  DECK_POOLS.set(id, pool); return pool.slice();
}

// ---- flight classes: pay more at the gate, land with a free scout (and in First, a fuller tank)
const FLIGHT_CLASSES = [
  { id: 'economy', name: 'Economy', blurb: 'Just the flight' },
  { id: 'business', name: 'Business', blurb: '+1 free scout on landing', cost: base => Math.max(20, Math.round(base * 0.5)) },
  { id: 'first', name: 'First', blurb: '+1 free scout and 125% range on landing', cost: base => Math.max(40, base) },
];
const classesAllowed = () => S && !S.race && !S.daily && !S.weekly && !S.stakes && !S.classic;
const flightClass = () => classesAllowed() ? FLIGHT_CLASSES.find(c => c.id === S.fclass) || FLIGHT_CLASSES[0] : FLIGHT_CLASSES[0];
function flightClassHtml() {
  if (!classesAllowed() || S.mode !== 'fly') return '';
  const base = flightCost(1000, S.flights);
  return `<div class="fclass" role="group" aria-label="Flight class">${FLIGHT_CLASSES.map(c => { const off = c.id === 'business' && RULES.hints === 'off';
    return `<button type="button" data-fclass="${c.id}" aria-pressed="${flightClass().id === c.id}" ${off ? 'disabled title="This trip has no hints, so there is nothing to scout"' : ''}><b>${c.id === 'first' ? '🥂 ' : c.id === 'business' ? '💺 ' : ''}${c.name}</b><small>${c.blurb}${c.cost ? ` · +${c.cost(base)} per 1,000 km` : ''}</small></button>`; }).join('')}</div>`;
}
document.addEventListener('click', e => { const b = e.target.closest('[data-fclass]'); if (!b || !S) return; S.fclass = b.dataset.fclass; save(); render(); const i = $('entry-input'); if (i) i.focus(); });
// the extra paid on top of a flight's fare (and on top of a free flight too)
const classUpgrade = base => { const c = flightClass(); return c.cost ? c.cost(base) : 0; };
// what the class gives you on landing; called from travel()
function landWithClass(res) {
  if (!res.fclass || res.fclass === 'economy') return '';
  S.freeScouts = (S.freeScouts || 0) + 1;
  if (res.fclass === 'first') S.fuel = Math.round(VEH(S.opts.vehicle).tank * 1.25);
  S.fclass = 'economy';
  return res.fclass === 'first' ? ' First class: a free scout and 125% range.' : ' Business class: a free scout.';
}

// ---- rerolling the wanted board: a new set of flags to hunt, at a price that doubles each time that day
const rerollPrice = () => { const w = P.wanted, n = w && w.rolls && w.rolls.day === localDay() ? w.rolls.n : 0; return 50 * 2 ** n; };
function rerollWanted() {
  const w = wantedToday(); if (!w) return;
  const price = rerollPrice(); if (P.coins < price) { toast(`A new board costs ${price} coins.`); return; }
  if (w.list.every(b => b.done)) { toast('This board is already cleared.'); return; }
  P.coins -= price; renderCoins();
  const n = (w.rolls && w.rolls.day === w.day ? w.rolls.n : 0) + 1, old = w.list;
  P.wanted = null; P.wantedRoll = { day: w.day, n, avoid: old.map(b => b.key) };
  const fresh = wantedToday();
  // flags already found today stay found; only the open ones are swapped
  fresh.list = old.map((b, i) => b.done ? b : fresh.list[i] || b); fresh.rolls = { day: w.day, n }; fresh.swept = false;
  saveProfile(); renderWanted(); if ($('dlg-passport').open && ppTab === 'flags') renderPassport(); tripMap.draw();
  toast(`New wanted board · −${price} coins`);
}
document.addEventListener('click', e => { if (e.target.closest('[data-reroll-wanted]')) rerollWanted(); });

// ---- the high-stakes run: once a day, bet coins on a hard route with ten seconds a turn
// The same route for everyone that day: a Medium car trip with no planes, trains or hints, typed from memory.
// One wrong turn (a place you can't reach, or one you've been to) ends it, and so does the clock. The clock keeps
// running in another tab or through a reload, so looking the answer up costs the bet. Reach the destination and
// the wager comes back doubled.
const STAKES_WAGERS = [250, 500, 750, 1000], STAKES_SECONDS = 10;
const STAKES_RULES = { planes: 'capitals', planeKm: 0, trains: 'capitals', trainKm: 0, ferryKm: 800, tank: 'standard', hints: 'off' };
const stakesPlayedToday = () => P.lastStakes === localDay();
function openStakes() {
  let dlg = $('dlg-stakes');
  if (!dlg) { document.body.insertAdjacentHTML('beforeend', '<dialog id="dlg-stakes"><div class="dlg"><header><div><h2>💰 High stakes</h2><p>Bet coins on today’s hard route.</p></div><button class="x" type="button" data-close aria-label="Close">×</button></header><div id="stakes-body"></div></div></dialog>'); dlg = $('dlg-stakes'); dlg.addEventListener('click', e => { if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); }); }
  let pick = STAKES_WAGERS.find(w => w <= P.coins) || STAKES_WAGERS[0];
  const draw = () => {
    const played = stakesPlayedToday(), running = S && S.stakes && !S.done;
    $('stakes-body').innerHTML = `<section>
      <ul class="stakesrules"><li>⏱️ <b>${STAKES_SECONDS} seconds a turn.</b> The clock keeps running if you switch tabs or reload.</li><li>❌ <b>One wrong turn and it's over:</b> a place out of range, or one you've already stopped in.</li>
        <li>🧠 Typed from memory: no suggestions, no planes, trains or hints, and no supplies.</li><li>🏁 Reach the destination and your wager comes back <b>doubled</b>. One run a day.</li></ul></section>
      <section><div class="label">Your wager</div><div class="seg stakeseg" role="group" aria-label="Wager">${STAKES_WAGERS.map(w => `<button type="button" data-wager="${w}" aria-pressed="${pick === w}" ${P.coins < w ? 'disabled' : ''}>${fmt(w)}</button>`).join('')}</div>
        <p class="hint" style="margin:8px 0 0">You have ${fmt(P.coins)} coins. Win: +${fmt(pick)} (you get ${fmt(pick * 2)} back). Lose: −${fmt(pick)}.</p></section>
      <footer>${running ? '<span class="hint" style="margin-right:auto">Your run is on. Good luck.</span>' : played ? `<span class="hint" style="margin-right:auto">You've had today's run. A new route opens at midnight.</span>` : ''}
        <button class="btn go" type="button" id="stakes-go" ${played || running || P.coins < pick ? 'disabled' : ''}>Bet ${fmt(pick)} and start</button></footer>`;
    $('stakes-body').querySelectorAll('[data-wager]').forEach(b => b.onclick = () => { pick = +b.dataset.wager; draw(); });
    $('stakes-go').onclick = () => {
      if (P.coins < pick || stakesPlayedToday()) return;
      if (!startTrip({ ...opts, vehicle: 'car', length: 'medium', assist: 'navigator', rules: STAKES_RULES, avoid: [], from: null, to: null, via: [], classic: false }, 'stakes')) return;
      P.coins -= pick; P.lastStakes = localDay(); renderCoins();
      S.stakes = { wager: pick, day: localDay(), deadline: Date.now() + (STAKES_SECONDS + 3) * 1000 };
      saveProfile(); save(); render();
      document.querySelectorAll('dialog[open]').forEach(d => d.close());
      setMsg(`High stakes: ${fmt(pick)} coins on reaching ${G.name[S.dest]}. ${STAKES_SECONDS} seconds a turn, starting now.`, 'bad');
      const i = $('entry-input'); if (i) i.focus();
    };
  };
  draw(); if (!dlg.open) dlg.showModal();
}
function stakesBust(why) {
  if (!S || !S.stakes || S.done) return;
  S.stakes.result = 'lost'; S.stakes.why = why;
  finishTrip(true); save(); render(); tripMap.fit(tripBounds(), false, 56, 130);
  setMsg(`Busted: ${why} The house keeps your ${fmt(S.stakes.wager)} coins.`, 'bad');
}
// called by finishTrip; a finished run pays double
function stakesSettle(gaveUp) {
  if (!S.stakes || S.stakes.result) return;
  S.stakes.result = gaveUp ? 'lost' : 'won';
  if (!gaveUp) addCoins(S.stakes.wager * 2, 'high stakes won');
  feedAdd({ k: 'stakes', won: !gaveUp, wager: S.stakes.wager });
}
// a good turn restarts the clock
const stakesTurn = () => { if (S && S.stakes && !S.done) S.stakes.deadline = Date.now() + STAKES_SECONDS * 1000; };
setInterval(() => {
  if (!S || !S.stakes || S.done || !G) return;
  const left = S.stakes.deadline - Date.now(), bar = $('stakes-bar');
  if (bar) { const k = Math.max(0, Math.min(1, left / (STAKES_SECONDS * 1000))); bar.querySelector('i').style.width = (k * 100) + '%'; bar.querySelector('span').textContent = `${Math.max(0, left / 1000).toFixed(1)} s`; bar.classList.toggle('low', left < 3500); }
  if (left <= 0) stakesBust('the clock ran out.');
}, 100);
