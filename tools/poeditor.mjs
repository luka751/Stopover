// Keeps the game's translations in POEditor (GitHub Student Pack), so Georgian and Russian can be corrected there by
// people who speak them, without touching code.
//
//   node tools/poeditor.mjs push   upload every English line (dictionary keys + src2/i18n/catalog.json) and the
//                                  current Georgian and Russian translations; creates the project the first time
//   node tools/poeditor.mjs pull   download Georgian and Russian from POEditor into src2/i18n/<lang>.json
//
// Needs POEDITOR_TOKEN (POEditor → Account settings → API access) in web/.dev.vars or the environment, and
// POEDITOR_PROJECT once the project exists (push prints it the first time).
import fs from 'node:fs';

const vars = {};
try { for (const l of fs.readFileSync('web/.dev.vars', 'utf8').split('\n')) { const m = /^([A-Z_]+)=(.*)$/.exec(l.trim()); if (m) vars[m[1]] = m[2].trim(); } } catch {}
const env = k => process.env[k] || vars[k];
const TOKEN = env('POEDITOR_TOKEN'); let PROJECT = env('POEDITOR_PROJECT');
if (!TOKEN) { console.error('Put POEDITOR_TOKEN=... in web/.dev.vars (POEditor → Account settings → API access).'); process.exit(1); }
const LANGS = ['ka', 'ru'], dictFile = l => `src2/i18n/${l}.json`;
const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));

async function call(path, fields, file) {
  const form = new FormData(); form.set('api_token', TOKEN);
  for (const [k, v] of Object.entries(fields)) form.set(k, String(v));
  if (file) form.set('file', new Blob([JSON.stringify(file.data)], { type: 'application/json' }), file.name);
  const res = await (await fetch('https://api.poeditor.com/v2/' + path, { method: 'POST', body: form })).json();
  if (res.response.status !== 'success') throw new Error(`${path}: ${res.response.message}`);
  return res.result;
}
const wait = s => new Promise(r => setTimeout(r, s * 1000));

async function push() {
  if (!PROJECT) {
    PROJECT = String((await call('projects/add', { name: 'Stopover', description: 'The Stopover geography game (playstopover.me)' })).project.id);
    console.log(`Created the POEditor project. Add this line to web/.dev.vars:\nPOEDITOR_PROJECT=${PROJECT}`);
    for (const l of ['en', ...LANGS]) await call('languages/add', { id: PROJECT, language: l }).catch(e => console.log(' ', e.message));
    await call('projects/update', { id: PROJECT, reference_language: 'en' }).catch(() => {});
  }
  const dicts = Object.fromEntries(LANGS.map(l => [l, readJson(dictFile(l))]));
  const terms = [...new Set([...LANGS.flatMap(l => Object.keys(dicts[l])), ...readJson('src2/i18n/catalog.json')])].sort();
  // POEditor allows one upload every 20 seconds, so the three files go up slowly
  const uploads = [['en', Object.fromEntries(terms.map(t => [t, t]))], ...LANGS.map(l => [l, Object.fromEntries(Object.entries(dicts[l]).filter(([, v]) => v))])];
  for (const [i, [lang, data]] of uploads.entries()) {
    if (i) await wait(22);
    const r = await call('projects/upload', { id: PROJECT, updating: 'terms_translations', language: lang, overwrite: 0, sync_terms: 0 }, { name: lang + '.json', data });
    console.log(`${lang}: ${r.terms ? r.terms.added : 0} new terms, ${r.translations ? r.translations.added + r.translations.updated : 0} translations`);
  }
  console.log(`${terms.length} English lines are in POEditor project ${PROJECT}.`);
}

async function pull() {
  if (!PROJECT) { console.error('Set POEDITOR_PROJECT in web/.dev.vars first (run push once).'); process.exit(1); }
  for (const l of LANGS) {
    const { url } = await call('projects/export', { id: PROJECT, language: l, type: 'key_value_json' });
    const remote = await (await fetch(url)).json(), local = readJson(dictFile(l));
    // POEditor wins where it has a translation; lines it has none for keep the one in the repo
    const merged = { ...local }; let changed = 0;
    for (const [k, v] of Object.entries(remote)) if (v && merged[k] !== v) { merged[k] = v; changed++; }
    fs.writeFileSync(dictFile(l), JSON.stringify(Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b))), null, 1) + '\n');
    console.log(`${l}: ${changed} lines updated from POEditor, ${Object.values(merged).filter(Boolean).length} translated`);
  }
}

const cmd = process.argv[2];
if (cmd === 'push') await push(); else if (cmd === 'pull') await pull(); else console.log('Usage: node tools/poeditor.mjs push|pull');
