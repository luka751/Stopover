// All Wikidata items that have both a GeoNames ID (P1566) and a flag image (P41).
import fs from 'node:fs';
const q = `SELECT ?gn (SAMPLE(?flag) AS ?f) WHERE { ?item wdt:P1566 ?gn; wdt:P41 ?flag. } GROUP BY ?gn`;
const r = await fetch('https://query.wikidata.org/sparql', { method: 'POST', body: new URLSearchParams({ query: q, format: 'json' }), headers: { 'User-Agent': 'stopover-game/1.0 (personal project)', Accept: 'application/sparql-results+json' } });
const rows = (await r.json()).results.bindings;
const map = {}; for (const b of rows) map[b.gn.value] = decodeURIComponent(b.f.value.split('/Special:FilePath/').pop()).replace(/_/g, ' ');
fs.writeFileSync('cache/wd_flags.json', JSON.stringify(map));
console.log('pairs', Object.keys(map).length);
