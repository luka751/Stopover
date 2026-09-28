// End-to-end test of accounts by email, with real emails delivered to a Testmail inbox (GitHub Student Pack):
// create an account, add an email, click the confirmation link, ask for a reset, pick a new password from the
// emailed link, log in with it, then delete the account so no test players are left on the leaderboard.
//
//   node web/test/email-flow.mjs                        against https://playstopover.me
//   BASE=https://stopover.<you>.workers.dev node web/test/email-flow.mjs
//
// Needs TESTMAIL_NAMESPACE and TESTMAIL_KEY, from the environment or web/.dev.vars. It can't run against
// `wrangler dev`, which prints emails instead of sending them.
import fs from 'node:fs';
import { randomName } from '../src/names.js';

const vars = {};
try { for (const l of fs.readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split('\n')) { const m = /^([A-Z_]+)=(.*)$/.exec(l.trim()); if (m) vars[m[1]] = m[2]; } } catch {}
const env = k => process.env[k] || vars[k];
const BASE = env('BASE') || 'https://playstopover.me', NS = env('TESTMAIL_NAMESPACE'), KEY = env('TESTMAIL_KEY');
if (!NS || !KEY) { console.error('Set TESTMAIL_NAMESPACE and TESTMAIL_KEY (or put them in web/.dev.vars).'); process.exit(1); }

// the same stretched key the browser sends (src2/auth.js)
async function passwordKey(name, password) {
  const enc = new TextEncoder(), base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('stopover-v1:' + name.toLowerCase()), iterations: 200000 }, base, 256);
  return Buffer.from(bits).toString('hex');
}
let cookie = '';
async function api(path, body, method = body ? 'POST' : 'GET') {
  const res = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', cookie }, body: body && JSON.stringify(body) });
  const sid = /sid=([^;]*)/.exec(res.headers.get('set-cookie') || ''); if (sid) cookie = sid[1] ? 'sid=' + sid[1] : '';
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
// waits for the next email to this tag that arrived after `since`, and returns its link
async function mailLink(tag, since, param) {
  const q = new URLSearchParams({ apikey: KEY, namespace: NS, tag, livequery: 'true', timestamp_from: String(since) });
  const res = await fetch('https://api.testmail.app/api/json?' + q);
  const j = await res.json();
  if (j.result !== 'success' || !j.emails.length) throw new Error('No email arrived: ' + (j.message || JSON.stringify(j).slice(0, 200)));
  const m = new RegExp(`https?://[^\\s"<]+[?&]${param}=([A-Za-z0-9_-]+)`).exec(j.emails[0].text || '');
  if (!m) throw new Error(`The ${param} email has no link:\n${j.emails[0].text}`);
  return { subject: j.emails[0].subject, token: m[1] };
}
let step = 0;
const ok = (cond, what, detail) => { step++; if (!cond) { console.error(`✗ ${step}. ${what}`, detail ?? ''); throw new Error(what); } console.log(`✓ ${step}. ${what}`); };

// a name no real player has, so the test never collides with one
let name = randomName(); for (let i = 0; i < 20; i++) { const r = await (await fetch(`${BASE}/api/name/${name}`)).json(); if (r.available) break; name = randomName(); }
const tag = 'e2e' + Date.now().toString(36), email = `${NS}.${tag}@inbox.testmail.app`;
let pass = 'first-' + Math.random().toString(36).slice(2), deleted = false;
console.log(`${BASE} · account ${name} · ${email}`);
try {
  let r = await api('/api/register', { name, key: await passwordKey(name, pass) });
  ok(r.status === 200 && cookie, 'create account', r.body);

  let t = Date.now();
  r = await api('/api/email', { email, key: await passwordKey(name, 'wrong-password') });
  ok(r.status === 401, 'adding an email needs the right password', r.body);
  r = await api('/api/email', { email, key: await passwordKey(name, pass) });
  ok(r.status === 200 && r.body.pending === email, 'add email', r.body);
  const verify = await mailLink(tag, t, 'verify');
  ok(/confirm/i.test(verify.subject), `confirmation email arrived ("${verify.subject}")`);
  r = await api('/api/email/verify', { token: verify.token });
  ok(r.status === 200 && r.body.name === name, 'confirmation link works', r.body);
  r = await api('/api/email/verify', { token: verify.token });
  ok(r.status === 400, 'confirmation link works only once', r.body);
  r = await api('/api/me');
  ok(r.body.user && r.body.user.email === email && !r.body.user.emailPending, 'account shows the confirmed email', r.body.user);

  r = await api('/api/forgot', { who: 'nobody-' + tag + '@example.com' });
  ok(r.status === 200 && r.body.ok, 'unknown email gets the same answer as a real one', r.body);
  t = Date.now();
  r = await api('/api/forgot', { who: name });
  ok(r.status === 200 && r.body.ok, 'ask for a reset by username', r.body);
  const reset = await mailLink(tag, t, 'reset');
  ok(/reset/i.test(reset.subject), `reset email arrived ("${reset.subject}")`);
  r = await api('/api/reset/info', { token: reset.token });
  ok(r.status === 200 && r.body.name === name, 'reset link names the account', r.body);

  const oldPass = pass; pass = 'second-' + Math.random().toString(36).slice(2);
  r = await api('/api/reset', { token: reset.token, key: await passwordKey(name, pass) });
  ok(r.status === 200 && cookie, 'new password saved and logged in', r.body);
  r = await api('/api/reset/info', { token: reset.token });
  ok(r.status === 404, 'reset link works only once', r.body);
  cookie = '';
  r = await api('/api/login', { name, key: await passwordKey(name, oldPass) });
  ok(r.status === 401, 'old password no longer works', r.body);
  r = await api('/api/login', { name, key: await passwordKey(name, pass) });
  ok(r.status === 200, 'new password logs in', r.body);

  r = await api('/api/account/delete', { key: await passwordKey(name, pass) });
  ok(r.status === 200, 'delete the account', r.body); deleted = true;
  r = await api('/api/login', { name, key: await passwordKey(name, pass) });
  ok(r.status === 401, 'deleted account can\'t log in', r.body);
  console.log('\nAll email checks passed.');
} catch (e) {
  if (!deleted && cookie) await api('/api/account/delete', { key: await passwordKey(name, pass) }).catch(() => {});
  console.error('\nFailed:', e.message); process.exit(1);
}
