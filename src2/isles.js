// ================= Far-Flung Isles: boat voyages to remote island outposts =================
// A boat trip whose destination is a small, overlooked island territory or outpost. Places are found by
// country and coordinates (not by name alone), so Kingston, Norfolk Island never becomes Kingston, Jamaica.
// The boat carries provisions for the longest open-water crossing the outpost needs, and the destination
// counts even when it sits a little inland, as long as you sail to its island.
const OCEANS = [
  { id: 'south', name: 'Southern Ocean & South Atlantic' }, { id: 'north', name: 'North Atlantic & Arctic' },
  { id: 'carib', name: 'Caribbean' }, { id: 'indian', name: 'Indian Ocean' }, { id: 'pacific', name: 'Pacific' },
];
const ISLE_SPECS = [
  ['south', 'GS', -54.28, -36.51, 'A whaling station turned research outpost on South Georgia. Ernest Shackleton is buried here.'],
  ['south', 'TF', -49.35, 70.22, 'The research base of the Kerguelen Islands, nicknamed the Desolation Islands, in the French Southern Lands.'],
  ['south', 'SH', -37.07, -12.31, 'Edinburgh of the Seven Seas, the only settlement on Tristan da Cunha: the most remote inhabited island on Earth.'],
  ['south', 'SH', -15.93, -5.72, 'Jamestown, capital of St Helena, where Napoleon spent his final exile.'],
  ['south', 'SH', -7.93, -14.42, 'Georgetown on Ascension Island, a volcanic peak halfway between Africa and Brazil.'],
  ['south', 'FK', -51.69, -57.86, 'Stanley, capital of the Falkland Islands: a British territory that Argentina also claims.'],
  ['south', 'BR', -3.85, -32.42, 'Fernando de Noronha, a Brazilian volcanic archipelago 350 km offshore, where visitor numbers are capped.'],
  ['south', 'ST', 0.34, 6.73, 'São Tomé, capital of São Tomé and Príncipe, one of Africa’s smallest countries, just north of the Equator.'],
  ['north', 'SJ', 78.22, 15.65, 'Longyearbyen on Svalbard, one of the northernmost towns in the world.'],
  ['north', 'FO', 62.01, -6.77, 'Tórshavn, capital of the Faroe Islands, a self-governing part of the Danish realm.'],
  ['north', 'GL', 64.18, -51.72, 'Nuuk, capital of Greenland, the world’s largest island.'],
  ['north', 'PM', 46.78, -56.18, 'Saint-Pierre, the last piece of New France: a French territory just off Newfoundland.'],
  ['north', 'BM', 32.29, -64.78, 'Hamilton, capital of Bermuda, a British territory alone in the western Atlantic.'],
  ['north', 'PT', 39.45, -31.13, 'Santa Cruz das Flores, on Flores in the Azores: the westernmost island of Europe.'],
  ['north', 'ES', 27.81, -17.91, 'Valverde, capital of El Hierro, the smallest and most westerly of the Canary Islands.'],
  ['north', 'CV', 14.93, -23.51, 'Praia, capital of Cabo Verde, an Atlantic archipelago nation off West Africa.'],
  ['carib', 'TC', 21.46, -71.14, 'Cockburn Town, capital of the Turks and Caicos Islands, on tiny Grand Turk.'],
  ['carib', 'AI', 18.22, -63.05, 'The Valley, capital of Anguilla, a British territory of coral and sand.'],
  ['carib', 'MS', 16.79, -62.21, 'Brades, Montserrat’s working capital since the Soufrière Hills volcano buried Plymouth in the 1990s.', 'exact'],
  ['carib', 'VG', 18.43, -64.62, 'Road Town, capital of the British Virgin Islands, on Tortola.'],
  ['carib', 'BL', 17.90, -62.85, 'Gustavia, capital of Saint Barthélemy, named after a Swedish king from when Sweden owned the island.'],
  ['carib', 'BQ', 17.63, -63.24, 'The Bottom, capital of Saba: a single volcano that is a special municipality of the Netherlands.'],
  ['carib', 'KY', 19.29, -81.38, 'George Town, capital of the Cayman Islands.'],
  ['carib', 'CO', 12.58, -81.70, 'San Andrés, a Colombian island much closer to Nicaragua than to Colombia.'],
  ['indian', 'CX', -10.42, 105.68, 'Flying Fish Cove on Christmas Island, the Australian territory famous for its red crab migration.'],
  ['indian', 'CC', -12.19, 96.83, 'West Island, administrative centre of the Cocos (Keeling) Islands, Australian atolls in the Indian Ocean.'],
  ['indian', 'IO', -7.30, 72.40, 'Diego Garcia, the military atoll at the heart of the British Indian Ocean Territory.'],
  ['indian', 'MU', -19.68, 63.42, 'Port Mathurin, chief town of Rodrigues, an autonomous outer island of Mauritius.'],
  ['indian', 'YT', -12.78, 45.23, 'Mamoudzou, capital of Mayotte, a French department in the Comoros archipelago.'],
  ['indian', 'KM', -11.70, 43.26, 'Moroni, capital of the Comoros, on Grande Comore.'],
  ['indian', 'SC', -4.62, 55.45, 'Victoria, capital of the Seychelles and one of the smallest capitals in the world.'],
  ['indian', 'MV', 4.18, 73.51, 'Malé, capital of the Maldives, packed onto a single coral island.'],
  ['indian', 'YE', 12.65, 54.02, 'Hadibu, main town of Socotra, the island of dragon’s blood trees.'],
  ['indian', 'IN', 11.67, 92.74, 'Port Blair (now Sri Vijaya Puram), capital of India’s Andaman and Nicobar Islands.'],
  ['pacific', 'PN', -25.07, -130.10, 'Adamstown, capital of the Pitcairn Islands, settled by the Bounty mutineers. About 50 people live here.'],
  ['pacific', 'CL', -27.15, -109.43, 'Hanga Roa, the only town on Rapa Nui (Easter Island), home of the moai.'],
  ['pacific', 'EC', -0.90, -89.61, 'Puerto Baquerizo Moreno, capital of the Galápagos Islands, on San Cristóbal.'],
  ['pacific', 'PF', -23.12, -134.97, 'Rikitea, main village of the Gambier Islands in the far southeast of French Polynesia.'],
  ['pacific', 'PF', -9.80, -139.03, 'Atuona on Hiva Oa in the Marquesas, where Paul Gauguin and Jacques Brel are buried.'],
  ['pacific', 'PF', -17.54, -149.57, 'Papeete, capital of French Polynesia, on Tahiti.'],
  ['pacific', 'CK', -21.21, -159.78, 'Avarua, capital of the Cook Islands, on Rarotonga.'],
  ['pacific', 'NU', -19.06, -169.92, 'Alofi, capital of Niue, one of the world’s largest coral islands and a country of under 2,000 people.'],
  ['pacific', 'TK', -9.20, -171.85, 'Nukunonu, an atoll village of Tokelau, a New Zealand territory with no airport.'],
  ['pacific', 'WF', -13.28, -176.17, 'Mata-Utu, capital of Wallis and Futuna, a French territory with three traditional kingdoms.'],
  ['pacific', 'AS', -14.28, -170.70, 'Pago Pago, the harbour town of American Samoa.'],
  ['pacific', 'TV', -8.52, 179.20, 'Funafuti, capital of Tuvalu, an atoll nation only a few metres above the sea.'],
  ['pacific', 'NR', -0.55, 166.92, 'Yaren, seat of government of Nauru, the smallest island country in the world.'],
  ['pacific', 'KI', 1.33, 172.98, 'Tarawa, capital of Kiribati, the only country in all four hemispheres.'],
  ['pacific', 'KI', 1.98, -157.47, 'London, a village on Kiritimati (Christmas Island), the largest coral atoll in the world.'],
  ['pacific', 'MH', 7.09, 171.38, 'Majuro, capital of the Marshall Islands.'],
  ['pacific', 'FM', 6.92, 158.16, 'Palikir, capital of the Federated States of Micronesia, on Pohnpei.'],
  ['pacific', 'PW', 7.50, 134.62, 'Ngerulmud, Palau’s capital: a government complex on Babeldaob with almost nobody living there.'],
  ['pacific', 'NF', -29.06, 167.96, 'Kingston, capital of Norfolk Island, once a notorious penal colony.'],
  ['pacific', 'NZ', -43.95, -176.56, 'Waitangi, main settlement of the Chatham Islands, among the first inhabited places to see each new day.'],
  ['pacific', 'MP', 15.20, 145.75, 'Saipan, the main island and seat of government of the Northern Mariana Islands.'],
  ['pacific', 'GU', 13.47, 144.75, 'Hagåtña, capital of Guam, the westernmost territory of the United States.'],
  ['pacific', 'TO', -21.14, -175.20, 'Nukuʻalofa, capital of Tonga, the Pacific kingdom that was never formally colonised.'],
];
let islesCache = null;
// resolve each outpost to the gazetteer: the country's capital if it is within 25 km, else the nearest place within 60 km
function isles() {
  if (islesCache || !G) return islesCache || [];
  islesCache = [];
  for (const [ocean, cc, la, lo, note, exact] of ISLE_SPECS) {
    const ci = G.ccIndex[cc]; if (ci == null) continue;
    const near = nearby(la, lo, 60).filter(i => G.cc[i] === ci && dist(la, lo, G.lat[i], G.lon[i]) <= 60).sort((a, b) => dist(la, lo, G.lat[a], G.lon[a]) - dist(la, lo, G.lat[b], G.lon[b]));
    const cap = exact ? null : near.find(i => G.fc[i] === G.capital && dist(la, lo, G.lat[i], G.lon[i]) <= 25), id = cap ?? near[0];
    if (id != null && !islesCache.some(x => x.id === id)) islesCache.push({ id, ocean, cc, note });
  }
  return islesCache;
}
const isleOf = id => isles().find(x => x.id === id);
// how far the nearest other coast is: the crossing the boat's provisions must cover
function nearestCrossing(id) {
  const la = G.lat[id], lo = G.lon[id];
  for (const R of [300, 800, 1600, 3000, 4500]) {
    const c = nearby(la, lo, R).map(j => [j, dist(la, lo, G.lat[j], G.lon[j])]).filter(([j, d]) => d > 40 && d <= R && G.pop[j] >= 50).sort((a, b) => a[1] - b[1]);
    for (const [j, d] of c.slice(0, 80)) if (coastal(j)) return d;
  }
  return 3000;
}
// pick the outpost (or use the one chosen), a gateway port within reach, and a route there
function generateVoyage(o, picked, seed, avoid) {
  const r = rng(seed), all = isles().filter(x => !avoid.has(G.cc[x.id]));
  const pool = all.filter(x => !o.ocean || o.ocean === 'any' || x.ocean === o.ocean);
  let isle = o.isle != null ? isleOf(G.byGid.get(o.isle)) : null;
  if (!isle) {
    if (!pool.length) return { error: 'No outposts left to sail to with those settings.' };
    // outposts you have never reached come up first
    const fresh = pool.filter(x => !visitsBefore(x.id));
    const from = fresh.length ? fresh : pool; isle = from[Math.floor(r() * from.length)];
  }
  const target = isle.id, need = nearestCrossing(target);
  // real ports (20,000+ people, on the coast) sorted by distance: the nearest one also sets how far the boat must reach
  const ports = [];
  // a port in the same territory counts when it is on another island group (Papeete for the Marquesas)
  for (let i = 0; i < G.n && G.pop[i] >= 20000; i++) { if (avoid.has(G.cc[i])) continue; const d = dist(G.lat[i], G.lon[i], G.lat[target], G.lon[target]); if (d >= (G.cc[i] === G.cc[target] ? 400 : 150) && d <= 7000) ports.push([i, d]); }
  ports.sort((a, b) => a[1] - b[1]);
  const coastPorts = []; for (const p of ports) { if (coastal(p[0])) coastPorts.push(p); if (coastPorts.length >= 60) break; }
  if (!coastPorts.length && picked.from == null) return { error: `No port within sailing reach of ${G.name[target]} turned up.` };
  const reach = Math.max(need, coastPorts.length ? coastPorts[0][1] : need), deadline = performance.now() + 5000;
  // stores for the crossing plus 15%; if no port works (a coast like Greenland's makes you sail the long way round), stock up and try again
  for (const extra of [1.15, 1.7]) {
  const tank = Math.max(650, Math.min(4500, Math.ceil(reach * extra / 50) * 50));
  VOYAGE.scale = tank / VEHICLES.boat.tank; VOYAGE.inland = target;
  try {
    let starts;
    if (picked.from != null) starts = [picked.from];
    else {
      // try a couple of ports beyond one day's sailing first, so the voyage has stops to name, then closer ones
      const shuffle = a => a.map(x => [x, r()]).sort((a, b) => a[1] - b[1]).map(x => x[0]);
      const far = shuffle(coastPorts.filter(p => p[1] > tank * 1.05 && p[1] <= tank * 1.05 + 2000)).slice(0, 3);
      const near = shuffle(coastPorts.filter(p => p[1] <= tank).slice(0, 6)).slice(0, 3);
      starts = [...far, ...near].map(p => p[0]);
    }
    for (const s of starts) {
      if (performance.now() > deadline) break;
      const trip = generateTrip({ ...o, vehicle: 'boat', isles: true, from: s, to: target, via: [], deadline }, seed + s, avoid);
      if (trip && !trip.error) return { ...trip, voyage: { scale: VOYAGE.scale, tank, need: Math.round(need), isle: G.gid[target] } };
      if (picked.from != null && extra > 1.15 && performance.now() <= deadline) return { error: `No voyage from ${G.name[s]} to ${G.name[target]} fits: pick another port, or leave Start on Random.` };
    }
  } finally { useVoyage(S); }
  }
  return { error: `No voyage to ${G.name[target]} could be charted this time. Try again or pick another outpost.` };
}
