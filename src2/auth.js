// ================= sign-in and cloud saves (website build only) =================
// Runs before the game: shows the log-in screen, loads this account's save from the server, then starts the game.
// The game reads and writes its save through window.__stopoverCloud instead of localStorage, and changes are
// sent to the server a few seconds after they happen.
const $a = id => document.getElementById(id);
const escA = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const hexA = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
// the password never leaves the browser: the server gets a key stretched from it, salted with the username
async function passwordKey(name, password) {
  const enc = new TextEncoder(), base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hexA(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('stopover-v1:' + name.toLowerCase()), iterations: 200000 }, base, 256));
}
async function apiA(path, opts = {}) {
  const res = await fetch(path, { credentials: 'same-origin', ...opts, headers: { 'content-type': 'application/json', ...(opts.headers || {}) } });
  let body = null; try { body = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, body: body || {} };
}

// ---- the cloud store
const cloud = {
  user: null, rev: 0, data: {}, sent: {}, dirty: new Set(), timer: 0, busy: false, blocked: false, summary: null, names: { parse: parseName }, passwordKey, api: apiA,
  get(k) { return Object.prototype.hasOwnProperty.call(this.data, k) ? this.data[k] : null; },
  set(k, v) { this.data[k] = v === undefined ? null : v; this.dirty.add(k); this.soon(); },
  soon(ms = 4000) { if (!this.timer && !this.blocked) this.timer = setTimeout(() => { this.timer = 0; this.flush(); }, ms); },
  async flush(final) {
    if (this.busy || this.blocked || !this.dirty.size) return;
    const changes = {};
    for (const k of this.dirty) { const text = JSON.stringify(this.data[k] ?? null); if (text !== this.sent[k]) changes[k] = text; }
    this.dirty.clear();
    if (!Object.keys(changes).length) return;
    let summary; if (changes['stopover-profile'] && this.summary) { try { summary = this.summary(); } catch {} }
    const body = JSON.stringify({ rev: this.rev, changes, summary });
    this.busy = true;
    try {
      const res = await fetch('/api/save', { method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body, keepalive: !!final && body.length < 60000 });
      const j = await res.json().catch(() => ({}));
      if (res.ok) { this.rev = j.rev; Object.assign(this.sent, changes); }
      else if ([401, 409, 422].includes(res.status)) { this.blocked = true; cloudProblem(res.status === 401 ? 'You were logged out, so progress is not being saved. Reload to log in again.' : j.error || 'Progress could not be saved.'); }
      else { for (const k of Object.keys(changes)) this.dirty.add(k); this.soon(15000); }
    } catch { for (const k of Object.keys(changes)) this.dirty.add(k); this.soon(15000); }
    finally { this.busy = false; if (this.dirty.size) this.soon(); }
  },
  async logout() { await this.flush(); await apiA('/api/logout', { method: 'POST', body: '{}' }); location.reload(); },
};
function cloudProblem(text) {
  let el = $a('cloud-problem');
  if (!el) { el = document.createElement('div'); el.id = 'cloud-problem'; el.className = 'cloudproblem'; el.setAttribute('role', 'alert'); document.body.appendChild(el); }
  el.innerHTML = `<span>${escA(text)}</span><button class="btn small" type="button">Reload</button>`;
  el.querySelector('button').onclick = () => location.reload();
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') cloud.flush(true); });
setInterval(() => cloud.flush(), 20000);

// ---- the log-in screen
const nameHtml = n => { const p = parseName(n); return p ? `<span class="uname" style="--uc:${p.color}"><i aria-hidden="true">${p.emoji}</i>${escA(p.name)}</span>` : escA(n); };
function authScreen(note) {
  const el = document.createElement('div'); el.id = 'auth'; el.className = 'auth';
  el.innerHTML = `<div class="authcard" role="dialog" aria-labelledby="auth-title">
    <div class="authbrand"><span class="shield" aria-hidden="true">E2</span><span class="wordmark" id="auth-title">Stopover</span></div>
    <p class="authlead">Name places, cross the map, collect flags and race your friends.</p>
    <div class="seg authtabs" role="tablist"><button type="button" role="tab" data-atab="login" aria-selected="true" aria-pressed="true">Log in</button><button type="button" role="tab" data-atab="new" aria-selected="false" aria-pressed="false">Create account</button></div>
    <form id="auth-login" class="authform" autocomplete="on">
      <label><span class="label">Username</span><input class="field" id="al-name" name="username" autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="e.g. PinkApple" required></label>
      <label><span class="label">Password</span><input class="field" id="al-pass" name="password" type="password" autocomplete="current-password" required></label>
      <button class="btn go big" type="submit">Log in</button>
    </form>
    <form id="auth-new" class="authform" hidden autocomplete="on">
      <div><span class="label">Your username</span>
        <div class="spinrow"><div class="spinname" id="an-show" aria-live="polite"></div><button class="btn" type="button" id="an-spin">🎲 Spin</button></div>
        <div class="hint" id="an-avail">&nbsp;</div>
        <input type="text" name="username" id="an-name" autocomplete="username" hidden>
      </div>
      <label><span class="label">Password</span><input class="field" id="an-pass" type="password" autocomplete="new-password" minlength="6" required></label>
      <label><span class="label">Password again</span><input class="field" id="an-pass2" type="password" autocomplete="new-password" minlength="6" required></label>
      <p class="hint" style="margin:0">There's no email, so write your username and password down. A forgotten password can't be reset.</p>
      <button class="btn go big" type="submit">Create account</button>
    </form>
    <div class="msg" id="auth-msg" aria-live="polite">${note ? escA(note) : ''}</div>
  </div>`;
  document.body.appendChild(el);
  return el;
}
function waitForLogin() {
  return new Promise(resolve => {
    const el = authScreen(), msg = t => { $a('auth-msg').textContent = t; $a('auth-msg').className = 'msg bad'; };
    el.querySelectorAll('[data-atab]').forEach(b => b.onclick = () => {
      const newAcc = b.dataset.atab === 'new';
      el.querySelectorAll('[data-atab]').forEach(x => { x.setAttribute('aria-selected', String(x === b)); x.setAttribute('aria-pressed', String(x === b)); });
      $a('auth-login').hidden = newAcc; $a('auth-new').hidden = !newAcc; $a('auth-msg').textContent = '';
      if (newAcc && !$a('an-name').value) spin();
    });
    let checkN = 0;
    const spin = async () => {
      const name = randomName(), n = ++checkN;
      $a('an-name').value = name; $a('an-show').innerHTML = nameHtml(name); $a('an-avail').textContent = 'Checking…';
      const r = await apiA('/api/name/' + name);
      if (n !== checkN) return;
      $a('an-avail').textContent = r.ok ? (r.body.available ? '✓ Free. Keep it, or spin again.' : '✗ Someone has this one. Spin again.') : 'Could not check right now.';
      $a('an-avail').dataset.taken = r.ok && !r.body.available ? '1' : '';
    };
    $a('an-spin').onclick = () => { $a('an-show').classList.remove('spun'); void $a('an-show').offsetWidth; $a('an-show').classList.add('spun'); spin(); };
    const busy = (form, on, label) => { const b = form.querySelector('[type=submit]'); b.disabled = on; if (label) b.textContent = label; };
    $a('auth-login').onsubmit = async e => {
      e.preventDefault(); const form = e.currentTarget, p = parseName($a('al-name').value.replace(/\s+/g, ''));
      if (!p) { msg('Usernames are a colour and a fruit, like PinkApple.'); return; }
      busy(form, true, 'Checking…');
      const r = await apiA('/api/login', { method: 'POST', body: JSON.stringify({ name: p.name, key: await passwordKey(p.name, $a('al-pass').value) }) });
      busy(form, false, 'Log in');
      if (r.ok) { el.remove(); resolve(); } else msg(r.body.error || 'Could not log in.');
    };
    $a('auth-new').onsubmit = async e => {
      e.preventDefault(); const form = e.currentTarget, name = $a('an-name').value, pass = $a('an-pass').value;
      if (pass.length < 6) { msg('Use at least 6 characters.'); return; }
      if (pass !== $a('an-pass2').value) { msg('The two passwords are different.'); return; }
      if ($a('an-avail').dataset.taken) { msg('That username is taken. Spin again.'); return; }
      busy(form, true, 'Creating…');
      const r = await apiA('/api/register', { method: 'POST', body: JSON.stringify({ name, key: await passwordKey(name, pass) }) });
      busy(form, false, 'Create account');
      if (r.ok) { el.remove(); resolve(); } else { msg(r.body.error || 'Could not create the account.'); if (r.status === 409) spin(); }
    };
    $a('al-name').focus();
  });
}

(async () => {
  let me = await apiA('/api/me');
  if (me.status === 401) { await waitForLogin(); me = await apiA('/api/me'); }
  if (!me.ok) { const el = authScreen('The server could not be reached. Check your connection and reload.'); el.querySelectorAll('form, .authtabs').forEach(x => x.hidden = true); return; }
  cloud.user = me.body.user; cloud.rev = me.body.rev; cloud.data = me.body.save || {};
  for (const [k, v] of Object.entries(cloud.data)) cloud.sent[k] = JSON.stringify(v);
  window.__stopoverCloud = cloud;
  const start = window.__stopoverStart; delete window.__stopoverStart; start();
})();
