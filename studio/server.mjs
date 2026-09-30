// Stopover Studio: a local editor for src2/tune.json with the game running beside it.
//   node studio/server.mjs        (or the `studio` launch config)  →  http://localhost:4180
// The preview is the single-file game (build-page.mjs) built fresh on every load, so a saved change shows on reload.
// It keeps its save in this browser's localStorage, apart from the website's cloud saves.
import http from 'node:http';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { readTune, writeTune } from '../tools/tune-file.mjs';
import { pageHtml } from '../build-page.mjs';

const root = new URL('../', import.meta.url);
const here = f => new URL(f, import.meta.url);
const PORT = +process.env.PORT || 4180;

const run = (cmd, args, opts = {}) => new Promise(res => execFile(cmd, args, { cwd: root, maxBuffer: 1e8, timeout: opts.timeout || 60e3 },
  (err, stdout, stderr) => res({ ok: !err, out: (stdout + stderr).trim(), code: err ? err.code : 0 })));
const git = (...a) => run('git', a);

// the tune file as it was at the last commit: the Studio shows everything since as "changes"
async function committedTune() {
  const r = await git('show', 'HEAD:src2/tune.json');
  try { return r.ok ? JSON.parse(r.out) : null; } catch { return null; }
}

// a saved file has to keep the shape the game expects: same kinds of values in the same places
function shapeProblems(next, prev, path = '') {
  const kind = v => v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
  // an empty value (null) can become text and back, e.g. a colour that is switched off
  if (kind(prev) !== kind(next) && !(kind(prev) === 'null' || kind(next) === 'null')) return [`${path || 'the file'} should be ${kind(prev) === 'object' ? 'a group' : kind(prev)}, not ${kind(next)}`];
  if (kind(next) === 'number' && !Number.isFinite(next)) return [`${path} is not a number`];
  if (kind(next) === 'array' && next.length && prev.length) return next.flatMap((x, i) => shapeProblems(x, prev[Math.min(i, prev.length - 1)], `${path}[${i}]`));
  if (kind(next) === 'object') return Object.keys(next).flatMap(k => k in prev ? shapeProblems(next[k], prev[k], path ? `${path}.${k}` : k) : []);
  return [];
}

const readBody = req => new Promise((res, rej) => { let b = ''; req.on('data', c => b += c); req.on('end', () => res(b)); req.on('error', rej); });
const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' }); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const typeOf = f => TYPES[f.slice(f.lastIndexOf('.'))] || 'application/octet-stream';

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x'), p = url.pathname;
    if (p === '/' || p === '/index.html') return send(res, 200, fs.readFileSync(here('index.html')), TYPES['.html']);
    if (p === '/guide.json') return send(res, 200, fs.readFileSync(here('guide.json')));

    // ---- the game preview: built from the current files on every load
    if (p === '/play') {
      // errors are passed up to the Studio, which shows them over the preview
      const report = `<script>addEventListener('error', e => parent.postMessage({ studioError: e.message }, '*')); addEventListener('unhandledrejection', e => parent.postMessage({ studioError: String(e.reason && e.reason.message || e.reason) }, '*'));</script>`;
      const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">${report}</head><body>${pageHtml()}</body></html>`;
      return send(res, 200, page, TYPES['.html']);
    }
    if (/^\/(flags|maps)\//.test(p) || p === '/rail.json' || p === '/covers.json') {
      const f = new URL('dist' + decodeURIComponent(p), root);
      if (!f.pathname.startsWith(new URL('dist/', root).pathname) || !fs.existsSync(f)) return send(res, 404, 'not found', 'text/plain');
      return send(res, 200, fs.readFileSync(f), typeOf(p));
    }

    // ---- the tuning file
    if (p === '/api/tune' && req.method === 'GET') return send(res, 200, { tune: readTune(), committed: await committedTune() });
    if (p === '/api/tune' && req.method === 'PUT') {
      let next; try { next = JSON.parse(await readBody(req)); } catch { return send(res, 400, { error: 'That was not valid JSON.' }); }
      const problems = shapeProblems(next, readTune());
      if (problems.length) return send(res, 400, { error: problems.slice(0, 5).join('\n') });
      writeTune(next);
      return send(res, 200, { ok: true });
    }

    // ---- checks, status and publishing
    if (p === '/api/check' && req.method === 'POST') return send(res, 200, await run('node', ['check.mjs']));
    if (p === '/api/status') {
      const [branch, status, ahead] = await Promise.all([git('rev-parse', '--abbrev-ref', 'HEAD'), git('status', '--porcelain', '--', 'src2', 'web/src', 'build-web.mjs'), git('rev-list', '--count', '@{u}..HEAD')]);
      const other = status.out.split('\n').filter(l => l && !l.endsWith('src2/tune.json'));
      return send(res, 200, { branch: branch.out, otherChanges: other, unpushed: ahead.ok ? +ahead.out : null });
    }
    if (p === '/api/publish' && req.method === 'POST') {
      const { message, push } = JSON.parse(await readBody(req) || '{}');
      const log = [];
      const step = async (label, r) => { log.push(`$ ${label}\n${r.out}`); return r.ok; };
      const done = ok => send(res, 200, { ok, log: log.join('\n\n') });
      if (!await step('node check.mjs', await run('node', ['check.mjs']))) return done(false);
      const changed = (await git('status', '--porcelain', '--', 'src2/tune.json')).out;
      if (changed) {
        if (!await step('git add src2/tune.json', await git('add', 'src2/tune.json'))) return done(false);
        if (!await step('git commit', await git('commit', '-m', message || 'Tuning from Stopover Studio', '--', 'src2/tune.json'))) return done(false);
      } else log.push('(no tuning changes to commit)');
      if (!await step('node build-web.mjs', await run('node', ['build-web.mjs'], { timeout: 180e3 }))) return done(false);
      // deploys sometimes time out: one retry
      let ok = await step('npm --prefix web run deploy', await run('npm', ['--prefix', 'web', 'run', 'deploy'], { timeout: 300e3 }));
      if (!ok) ok = await step('npm --prefix web run deploy (retry)', await run('npm', ['--prefix', 'web', 'run', 'deploy'], { timeout: 300e3 }));
      if (ok && push) await step('git push origin HEAD:main', await git('push', 'origin', 'HEAD:main'));
      return done(ok);
    }
    send(res, 404, 'not found', 'text/plain');
  } catch (e) { send(res, 500, { error: String(e && e.stack || e) }); }
}).listen(PORT, '127.0.0.1', () => console.log(`Stopover Studio → http://localhost:${PORT}`));

