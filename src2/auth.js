// ================= sign-in and cloud saves (website build only) =================
// Runs before the game: loads the save from the server, then starts the game. Nobody has to sign up first:
// a visitor without an account plays as a guest under a random fruit name. The guest's key is kept in this tab's
// sessionStorage only, so closing the tab ends the guest and the server deletes what it saved. A banner keeps
// saying so until the player creates an account (which keeps their progress) or logs in.
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
// the guest key for this tab: sessionStorage survives a reload but not closing the tab
const GUEST_KEY = 'stopover-guest';
const guestStore = {
  get() { try { return sessionStorage.getItem(GUEST_KEY); } catch { return null; } },
  set(t) { try { if (t) sessionStorage.setItem(GUEST_KEY, t); else sessionStorage.removeItem(GUEST_KEY); } catch {} },
};
let guestToken = null;
const authHeaders = () => guestToken ? { 'x-guest': guestToken } : {};
async function apiA(path, opts = {}) {
  const res = await fetch(path, { credentials: 'same-origin', ...opts, headers: { 'content-type': 'application/json', ...authHeaders(), ...(opts.headers || {}) } });
  let body = null; try { body = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, body: body || {} };
}

// ---- feature switches (ConfigCat, GitHub Student Pack), flipped in its dashboard without a new deploy.
// The config file is read straight from ConfigCat's CDN rather than through its 127 kB SDK; only each switch's
// default value is used (no per-user targeting). Until it arrives, or if it can't be reached, the code's defaults apply.
const FLAGS_URL = 'https://cdn-global.configcat.com/configuration-files/configcat-sdk-1/Xx3fCDSPwk-M2RkucGzbDQ/WMtrnhXonkCv-Va1Uwxa3w/config_v6.json';
const flags = {
  values: {},
  ready: (async () => {
    try {
      let j = await (await fetch(FLAGS_URL, { cache: 'no-cache' })).json();
      // ConfigCat can point clients in some regions at another CDN
      if (j.p && j.p.r && j.p.u) j = await (await fetch(FLAGS_URL.replace('https://cdn-global.configcat.com', j.p.u), { cache: 'no-cache' })).json();
      for (const [k, x] of Object.entries(j.f || {})) { const v = x.v || {}; flags.values[k] = v.b ?? v.s ?? v.i ?? v.d; }
    } catch {}
  })(),
  get(k, def) { return k in this.values ? this.values[k] : def; },
};

// ---- the cloud store
const cloud = {
  user: null, rev: 0, data: {}, sent: {}, dirty: new Set(), timer: 0, busy: false, blocked: false, summary: null, names: { parse: parseName, nickProblem }, passwordKey, api: apiA,
  // the lobby socket can't send headers, so a guest's key rides in its address
  wsQuery: () => guestToken ? '?gt=' + encodeURIComponent(guestToken) : '',
  openSignup: tab => openSignup(tab),
  flags,
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
      const res = await fetch('/api/save', { method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json', ...authHeaders() }, body, keepalive: !!final && body.length < 60000 });
      const j = await res.json().catch(() => ({}));
      if (res.ok) { this.rev = j.rev; Object.assign(this.sent, changes); }
      else if ([401, 409, 422].includes(res.status)) { this.blocked = true; cloudProblem(res.status === 401 ? loggedOutText() : j.error || 'Progress could not be saved.'); }
      else { for (const k of Object.keys(changes)) this.dirty.add(k); this.soon(15000); }
    } catch { for (const k of Object.keys(changes)) this.dirty.add(k); this.soon(15000); }
    finally { this.busy = false; if (this.dirty.size) this.soon(); }
  },
  async logout() { await this.flush(); await apiA('/api/logout', { method: 'POST', body: '{}' }); location.reload(); },
};
const loggedOutText = () => cloud.user && cloud.user.guest ? 'Your guest game has ended, so progress is not being saved. Reload to start a new one.' : 'You were logged out, so progress is not being saved. Reload to log in again.';
function cloudProblem(text) {
  let el = $a('cloud-problem');
  if (!el) { el = document.createElement('div'); el.id = 'cloud-problem'; el.className = 'cloudproblem'; el.setAttribute('role', 'alert'); document.body.appendChild(el); }
  el.innerHTML = `<span>${escA(text)}</span><button class="btn small" type="button">Reload</button>`;
  el.querySelector('button').onclick = () => location.reload();
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') cloud.flush(true); });
setInterval(() => cloud.flush(), 20000);
// an open guest tab checks in now and then; a guest the server hasn't heard from in hours is deleted
setInterval(async () => {
  if (!guestToken || cloud.blocked) return;
  const r = await apiA('/api/ping', { method: 'POST', body: '{}' });
  if (r.status === 401) { cloud.blocked = true; cloudProblem(loggedOutText()); }
}, 4 * 60000);

// ---- the log-in screen
const nameHtml = n => { const p = parseName(n); return p ? `<span class="uname" style="--uc:${p.color}"><i aria-hidden="true">${p.emoji}</i>${escA(p.name)}</span>` : escA(n); };
// guest: the card opens over the game with a close button, and says what happens to the guest's progress
function authScreen(note, guest) {
  const el = document.createElement('div'); el.id = 'auth'; el.className = 'auth' + (guest ? ' over' : '');
  el.innerHTML = `<div class="authcard" role="dialog" aria-modal="true" aria-labelledby="auth-title">
    <div class="authbrand"><span class="shield" aria-hidden="true">E2</span><span class="wordmark" id="auth-title">${guest ? 'Save your progress' : 'Stopover'}</span>${guest ? '<button class="x authx" type="button" id="auth-close" aria-label="Keep playing as a guest">×</button>' : ''}</div>
    <p class="authlead">${guest ? `You're playing as the guest ${nameHtml(guest)}. Guest progress is deleted when you close this tab.` : 'Name places, cross the map, collect flags and race your friends.'}</p>
    <div class="seg authtabs" role="tablist"><button type="button" role="tab" data-atab="login" aria-selected="true" aria-pressed="true">Log in</button><button type="button" role="tab" data-atab="new" aria-selected="false" aria-pressed="false">Create account</button></div>
    <form id="auth-login" class="authform" autocomplete="on">
      ${guest ? '<p class="hint" style="margin:0">Logging in switches to that account. What you played as a guest is not added to it.</p>' : ''}
      <label><span class="label">Username</span><input class="field" id="al-name" name="username" autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="e.g. PinkApple" required></label>
      <label><span class="label">Password</span><input class="field" id="al-pass" name="password" type="password" autocomplete="current-password" required></label>
      <button class="btn go big" type="submit">Log in</button>
      <button class="linkbtn" type="button" id="al-forgot">Forgot your password?</button>
    </form>
    <form id="auth-forgot" class="authform" hidden>
      <p class="hint" style="margin:0">Type your username or the email on your account. If the account has a confirmed email, we'll send a link to pick a new password.</p>
      <label><span class="label">Username or email</span><input class="field" id="af-who" autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="PinkApple or you@example.com" required></label>
      <button class="btn go big" type="submit">Send reset link</button>
      <button class="linkbtn" type="button" id="af-back">Back to log in</button>
    </form>
    <form id="auth-new" class="authform" hidden autocomplete="on">
      <div><span class="label">Your username</span>
        <div class="spinrow"><div class="spinname" id="an-show" aria-live="polite"></div><button class="btn" type="button" id="an-spin">🎲 Spin</button></div>
        <div class="hint" id="an-avail">&nbsp;</div>
        <input type="text" name="username" id="an-name" autocomplete="username" hidden>
      </div>
      <label><span class="label">Password</span><input class="field" id="an-pass" type="password" autocomplete="new-password" minlength="6" required></label>
      <label><span class="label">Password again</span><input class="field" id="an-pass2" type="password" autocomplete="new-password" minlength="6" required></label>
      <label><span class="label">Email <span class="opt">optional</span></span><input class="field" id="an-email" type="email" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="you@example.com"></label>
      <p class="hint" style="margin:0">Only used to reset your password if you forget it. Without one, write your username and password down.</p>
      ${guest ? '<p class="hint" style="margin:0"><b>Everything you played as a guest comes with you</b>: flags, coins, stamps and trips.</p>' : ''}
      <button class="btn go big" type="submit">${guest ? 'Create account and keep my progress' : 'Create account'}</button>
    </form>
    <div class="msg" id="auth-msg" aria-live="polite">${note ? escA(note) : ''}</div>
  </div>`;
  document.body.appendChild(el);
  return el;
}
// Log in or create an account from the guest banner. Creating one turns this guest into the account, keeping its
// progress; logging in leaves the guest behind. Either way the page reloads into the account.
function openSignup(tab = 'new') {
  if ($a('auth')) return;
  const guestName = cloud.user && cloud.user.name;
  const el = authScreen('', guestName), msg = t => { $a('auth-msg').textContent = t; $a('auth-msg').className = 'msg bad'; };
  const close = () => { el.remove(); document.removeEventListener('keydown', onKey); if (opener && opener.focus) opener.focus(); };
  const onKey = e => { if (e.key === 'Escape' && !el.dataset.busy) close(); };
  const opener = document.activeElement;
  document.addEventListener('keydown', onKey);
  $a('auth-close').onclick = close;
  el.addEventListener('pointerdown', e => { if (e.target === el && !el.dataset.busy) close(); });
  const showTab = newAcc => {
    el.querySelectorAll('[data-atab]').forEach(x => { const on = (x.dataset.atab === 'new') === newAcc; x.setAttribute('aria-selected', String(on)); x.setAttribute('aria-pressed', String(on)); });
    $a('auth-login').hidden = newAcc; $a('auth-new').hidden = !newAcc; $a('auth-forgot').hidden = true; $a('auth-msg').textContent = '';
    if (newAcc && !$a('an-name').value) offerName(guestName);
    (newAcc ? $a('an-pass') : $a('al-name')).focus();
  };
  el.querySelectorAll('[data-atab]').forEach(b => b.onclick = () => showTab(b.dataset.atab === 'new'));
  let checkN = 0;
  // the guest's own fruit name is offered first, so a player who got attached to it can keep it if it's free
  const offerName = async name => {
    const n = ++checkN;
    $a('an-name').value = name; $a('an-show').innerHTML = nameHtml(name); $a('an-avail').textContent = 'Checking…';
    const r = await apiA('/api/name/' + name);
    if (n !== checkN) return;
    const free = r.ok && r.body.available;
    if (!r.ok) $a('an-avail').textContent = 'Could not check right now.';
    else if (free) $a('an-avail').textContent = name === guestName ? '✓ Your guest name is free. Keep it, or spin again.' : '✓ Free. Keep it, or spin again.';
    else if (name === guestName) { offerName(randomName()); return; }
    else $a('an-avail').textContent = '✗ Someone has this one. Spin again.';
    $a('an-avail').dataset.taken = r.ok && !free ? '1' : '';
  };
  $a('an-spin').onclick = () => { $a('an-show').classList.remove('spun'); void $a('an-show').offsetWidth; $a('an-show').classList.add('spun'); offerName(randomName()); };
  const busy = (form, on, label) => { const b = form.querySelector('[type=submit]'); b.disabled = on; if (label) b.textContent = label; if (on) el.dataset.busy = '1'; else delete el.dataset.busy; };
  // once the server has switched this tab to the account, the guest key is dropped and the page starts over
  const intoAccount = () => { guestToken = null; guestStore.set(null); location.reload(); };
  $a('auth-login').onsubmit = async e => {
    e.preventDefault(); const form = e.currentTarget, p = parseName($a('al-name').value.replace(/\s+/g, ''));
    if (!p) { msg('Usernames are a colour and a fruit, like PinkApple.'); return; }
    busy(form, true, 'Checking…');
    const r = await apiA('/api/login', { method: 'POST', body: JSON.stringify({ name: p.name, key: await passwordKey(p.name, $a('al-pass').value) }) });
    if (r.ok) { cloud.blocked = true; intoAccount(); return; }
    busy(form, false, 'Log in'); msg(r.body.error || 'Could not log in.');
  };
  $a('auth-new').onsubmit = async e => {
    e.preventDefault(); const form = e.currentTarget, name = $a('an-name').value, pass = $a('an-pass').value;
    if (pass.length < 6) { msg('Use at least 6 characters.'); return; }
    if (pass !== $a('an-pass2').value) { msg('The two passwords are different.'); return; }
    if ($a('an-avail').dataset.taken) { msg('That username is taken. Spin again.'); return; }
    const email = $a('an-email').value.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) { msg('That email doesn\'t look right. Fix it, or leave it empty.'); return; }
    const label = form.querySelector('[type=submit]').textContent;
    busy(form, true, 'Saving your progress…');
    // everything played so far goes up first, then saving pauses so nothing is sent under the old guest key
    if (cloud.timer) { clearTimeout(cloud.timer); cloud.timer = 0; }
    await cloud.flush(); cloud.blocked = true;
    busy(form, true, 'Creating…');
    const r = await apiA('/api/register', { method: 'POST', body: JSON.stringify({ name, key: await passwordKey(name, pass) }) });
    if (r.ok) {
      // the account exists now; a failed confirmation email isn't a reason to stop, it can be sent again from Account
      if (email) { busy(form, true, 'Sending confirmation…'); await apiA('/api/email', { method: 'POST', body: JSON.stringify({ email }) }); }
      intoAccount(); return;
    }
    cloud.blocked = false; if (cloud.dirty.size) cloud.soon();
    busy(form, false, label); msg(r.body.error || 'Could not create the account.'); if (r.status === 409) offerName(randomName());
  };
  wireForgot(el, msg, busy);
  // switch 'emailAccounts' off in ConfigCat to hide email sign-up and resets, if sending mail ever breaks
  if (!flags.get('emailAccounts', true)) { $a('an-email').closest('label').hidden = true; $a('al-forgot').hidden = true; }
  showTab(tab === 'new');
}
// "Forgot your password?" swaps the log-in form for a one-field form that asks for a reset email
function wireForgot(el, msg, busy) {
  const show = on => { $a('auth-login').hidden = on; $a('auth-forgot').hidden = !on; $a('auth-msg').textContent = ''; $a(on ? 'af-who' : 'al-name').focus(); };
  $a('al-forgot').onclick = () => { $a('af-who').value = $a('al-name').value; show(true); };
  $a('af-back').onclick = () => show(false);
  $a('auth-forgot').onsubmit = async e => {
    e.preventDefault(); const form = e.currentTarget;
    busy(form, true, 'Sending…');
    const r = await apiA('/api/forgot', { method: 'POST', body: JSON.stringify({ who: $a('af-who').value }) });
    busy(form, false, 'Send reset link');
    if (!r.ok) { msg(r.body.error || 'Could not send it. Try again.'); return; }
    $a('auth-msg').className = 'msg good';
    $a('auth-msg').textContent = 'If that account has a confirmed email, a link is on its way. It works for 30 minutes. Check your spam folder too.';
  };
}

// a password-reset link from an email opens this: pick a new password for the account named in the link
async function resetScreen(token) {
  const info = await apiA('/api/reset/' + encodeURIComponent(token));
  const el = document.createElement('div'); el.id = 'auth'; el.className = 'auth';
  el.innerHTML = `<div class="authcard" role="dialog" aria-modal="true" aria-labelledby="auth-title">
    <div class="authbrand"><span class="shield" aria-hidden="true">E2</span><span class="wordmark" id="auth-title">New password</span></div>
    ${info.ok ? `<p class="authlead">Pick a new password for ${nameHtml(info.body.name)}. Every device logged in to it will be logged out.</p>
    <form id="rs-form" class="authform"><input type="text" autocomplete="username" value="${escA(info.body.name)}" hidden>
      <label><span class="label">New password</span><input class="field" id="rs-pass" type="password" autocomplete="new-password" minlength="6" required></label>
      <label><span class="label">New password again</span><input class="field" id="rs-pass2" type="password" autocomplete="new-password" minlength="6" required></label>
      <button class="btn go big" type="submit">Save and log in</button></form>`
    : `<p class="authlead">${escA(info.body.error || 'This link has expired or was already used.')}</p><a class="btn go big" href="/">Back to the game</a>`}
    <div class="msg" id="auth-msg" aria-live="polite"></div></div>`;
  document.body.appendChild(el);
  if (!info.ok) return;
  $a('rs-pass').focus();
  $a('rs-form').onsubmit = async e => {
    e.preventDefault(); const pass = $a('rs-pass').value, m = $a('auth-msg'), b = e.currentTarget.querySelector('[type=submit]');
    m.className = 'msg bad';
    if (pass.length < 6) { m.textContent = 'Use at least 6 characters.'; return; }
    if (pass !== $a('rs-pass2').value) { m.textContent = 'The two passwords are different.'; return; }
    b.disabled = true; b.textContent = 'Saving…';
    const r = await apiA('/api/reset', { method: 'POST', body: JSON.stringify({ token, key: await passwordKey(info.body.name, pass) }) });
    if (r.ok) { guestToken = null; guestStore.set(null); location.replace('/'); return; }
    b.disabled = false; b.textContent = 'Save and log in'; m.textContent = r.body.error || 'Could not save it.';
  };
}
function announce(text) {
  const key = 'stopover-announce-seen', seen = (() => { try { return localStorage.getItem(key); } catch { return null; } })();
  if (seen === text) return;
  const el = document.createElement('div'); el.className = 'announce'; el.setAttribute('role', 'status');
  el.innerHTML = `<span>📣 ${escA(text)}</span><button class="x" type="button" aria-label="Dismiss">×</button>`;
  el.querySelector('button').onclick = () => { el.remove(); try { localStorage.setItem(key, text); } catch {} };
  document.body.appendChild(el);
}
// a short note at the top of the page that goes away by itself
function flashNote(text, good) {
  const el = document.createElement('div'); el.className = 'flashnote' + (good ? ' good' : ''); el.setAttribute('role', 'status'); el.textContent = text;
  document.body.appendChild(el); setTimeout(() => el.classList.add('out'), 6000); setTimeout(() => el.remove(), 6600);
}

// the strip across the top of the game while playing as a guest
function guestBanner() {
  const bar = document.querySelector('header.bar'); if (!bar || $a('guestbar')) return;
  bar.insertAdjacentHTML('afterbegin', `<div class="guestbar" id="guestbar" role="status">
    <span class="guesttext">Playing as guest ${nameHtml(cloud.user.name)}. Your progress is deleted when you close this tab. <b>Want to save your data? Create an account or log in today.</b></span>
    <span class="guestbtns"><button class="btn small go" type="button" data-signup="new">Create account</button><button class="btn small" type="button" data-signup="login">Log in</button></span></div>`);
  $a('guestbar').querySelectorAll('[data-signup]').forEach(b => b.onclick = () => openSignup(b.dataset.signup));
}

(async () => {
  // links from emails: ?reset= opens the new-password screen instead of the game, ?verify= confirms an email and goes on
  const qs = new URLSearchParams(location.search), resetT = qs.get('reset'), verifyT = qs.get('verify');
  if (resetT || verifyT) history.replaceState(null, '', location.pathname + location.hash);
  if (resetT) { resetScreen(resetT); return; }
  if (verifyT) {
    const v = await apiA('/api/email/verify', { method: 'POST', body: JSON.stringify({ token: verifyT }) });
    flashNote(v.ok ? `✓ Email confirmed for ${v.body.name}. You can now reset your password if you forget it.` : v.body.error || 'That link didn\'t work.', v.ok);
  }
  // an account on this browser comes first; otherwise this tab's guest, or a new guest
  let me = await apiA('/api/me');
  if (me.status === 401) {
    guestToken = guestStore.get();
    if (guestToken) me = await apiA('/api/me');
    if (!guestToken || me.status === 401) {
      guestToken = null;
      const g = await apiA('/api/guest', { method: 'POST', body: '{}' });
      if (g.ok) { guestToken = g.body.token; guestStore.set(guestToken); me = await apiA('/api/me'); } else me = g;
    }
  } else if (me.ok) guestStore.set(null);
  if (!me.ok) { const el = authScreen('The server could not be reached. Check your connection and reload.'); el.querySelectorAll('form, .authtabs').forEach(x => x.hidden = true); return; }
  cloud.user = me.body.user; cloud.rev = me.body.rev; cloud.data = me.body.save || {};
  for (const [k, v] of Object.entries(cloud.data)) cloud.sent[k] = JSON.stringify(v);
  if (cloud.user.guest) guestBanner();
  // errors in Sentry carry the fruit username (not an email or anything personal), so a player's report can be matched to them
  if (window.Sentry && Sentry.onLoad) Sentry.onLoad(() => Sentry.setUser({ username: cloud.user.name, guest: cloud.user.guest }));
  window.__stopoverCloud = cloud;
  const start = window.__stopoverStart; delete window.__stopoverStart; start();
  // text in the 'announcement' switch shows across the top for everyone: maintenance, a new event, a weekend race
  flags.ready.then(() => { const a = flags.get('announcement', ''); if (typeof a === 'string' && a.trim()) announce(a.trim()); });
})();
