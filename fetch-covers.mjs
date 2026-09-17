// Data for earned passport covers: each country's coat of arms (Wikidata P237 → P18, or P94) and a photo of its
// passport (the lead image of the Wikipedia "<X> passport" article), whose dominant colour becomes the cover colour.
import fs from 'node:fs'; import crypto from 'node:crypto'; import sharp from 'sharp';
const UA = { 'User-Agent': 'StopoverGeographyGame/2.0 (personal non-commercial geography game; contact: luka.beradze.mail@gmail.com)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const md5 = s => crypto.createHash('md5').update(s).digest('hex');
fs.mkdirSync('cache/covers', { recursive: true });
const json = async url => { for (let i = 0; i < 5; i++) { try { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(60000) }); if (r.status === 429) { await sleep(60000); continue; } if (r.ok) return await r.json(); } catch {} await sleep(5000); } return null; };
const commonsFile = async (name, width) => {
  const n = name.replace(/ /g, '_'), h = md5(n), dir = `${h[0]}/${h.slice(0, 2)}/${encodeURIComponent(n)}`;
  const out = `cache/covers/${md5(name + width)}${/\.svg$/i.test(n) ? '.svg' : '.png'}`;
  if (fs.existsSync(out)) return out;
  const url = /\.svg$/i.test(n) ? `https://upload.wikimedia.org/wikipedia/commons/${dir}` : `https://upload.wikimedia.org/wikipedia/commons/thumb/${dir}/${width}px-${encodeURIComponent(n)}`;
  for (let i = 0; i < 5; i++) {
    await sleep(1500);
    try { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(60000) }); if (r.status === 429) { await sleep(60000); continue; } if (!r.ok) return null; fs.writeFileSync(out, Buffer.from(await r.arrayBuffer())); return out; } catch { await sleep(5000); }
  }
  return null;
};
// 1. countries with ISO codes, English names, arms image
const q = `SELECT ?iso ?name (SAMPLE(?img) AS ?arms) WHERE { ?c wdt:P297 ?iso ; rdfs:label ?name FILTER(lang(?name)="en") .
  OPTIONAL { ?c wdt:P237 ?coa . ?coa wdt:P18 ?img1 } OPTIONAL { ?c wdt:P94 ?img2 } BIND(COALESCE(?img1, ?img2) AS ?img) } GROUP BY ?iso ?name`;
const wd = await json('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q));
const countries = {};
for (const b of wd.results.bindings) countries[b.iso.value] = { name: b.name.value, arms: b.arms ? decodeURIComponent(b.arms.value.split('/Special:FilePath/').pop()).replace(/_/g, ' ') : null };
console.log('countries', Object.keys(countries).length, 'with arms', Object.values(countries).filter(c => c.arms).length);
// 2. passport article lead images
const results = fs.existsSync('cache/covers/data.json') ? JSON.parse(fs.readFileSync('cache/covers/data.json', 'utf8')) : {};
for (const [iso, c] of Object.entries(countries)) {
  if (results[iso] && results[iso].done) continue;
  const r = { iso, name: c.name, arms: c.arms, passportTitle: null, passportImage: null };
  const s = await json(`https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=5&srsearch=${encodeURIComponent('intitle:passport ' + c.name)}`);
  const hit = s && s.query.search.find(x => /passport$/i.test(x.title) && !/^(list|visa|passports)/i.test(x.title));
  if (hit) {
    r.passportTitle = hit.title;
    const p = await json(`https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=name&titles=${encodeURIComponent(hit.title)}`);
    const page = p && Object.values(p.query.pages)[0];
    if (page && page.pageimage) r.passportImage = page.pageimage.replace(/_/g, ' ');
  }
  r.done = true; results[iso] = r;
  fs.writeFileSync('cache/covers/data.json', JSON.stringify(results, null, 1));
  await sleep(800);
}
// 3. download images; measure cover colour from saturated, non-white pixels
for (const r of Object.values(results)) {
  if (r.armsFile === undefined) r.armsFile = r.arms ? await commonsFile(r.arms, 330) : null;
  if (r.photoFile === undefined) r.photoFile = r.passportImage ? await commonsFile(r.passportImage, 330) : null;
  if (r.photoFile && !r.rgb) {
    try {
      const { data, info } = await sharp(r.photoFile).resize(48, 48, { fit: 'cover' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const px = []; for (let i = 0; i < data.length; i += 3) { const [R, G2, B] = [data[i], data[i + 1], data[i + 2]], mx = Math.max(R, G2, B), mn = Math.min(R, G2, B); if (mx < 235 && !(mx - mn < 18 && mx > 90)) px.push([R, G2, B]); }
      // the cover is the biggest cluster of similar colours: bucket by hue/value and take the fullest bucket
      const buckets = new Map(); for (const p of px) { const k = p.map(v => v >> 5).join(','); (buckets.get(k) || buckets.set(k, []).get(k)).push(p); }
      const top = [...buckets.values()].sort((a, b) => b.length - a.length)[0] || [];
      if (top.length) r.rgb = [0, 1, 2].map(i => Math.round(top.reduce((s, p) => s + p[i], 0) / top.length));
    } catch {}
  }
  fs.writeFileSync('cache/covers/data.json', JSON.stringify(results, null, 1));
}
console.log('passport articles', Object.values(results).filter(r => r.passportTitle).length, 'photos', Object.values(results).filter(r => r.photoFile).length, 'colours', Object.values(results).filter(r => r.rgb).length, 'arms files', Object.values(results).filter(r => r.armsFile).length);
