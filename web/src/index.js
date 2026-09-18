// Stopover online: accounts, cloud saves, the leaderboard and race lobbies.
// Static files (the game itself) are served from ./public; only /api/* reaches this code.
import { DurableObject } from 'cloudflare:workers';
import { parseName } from './names.js';

const SESSION_DAYS = 60, MAX_PLAYERS = 8, CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const fail = (status, error) => json({ error }, status);
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha256 = async text => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
const randomHex = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const randomToken = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const cookieToken = req => (/(?:^|;\s*)sid=([A-Za-z0-9_-]{30,60})/.exec(req.headers.get('cookie') || '') || [])[1] || null;
const sidCookie = (token, days) => `sid=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.round(days * 86400)}`;
const accounts = env => env.ACCOUNTS.get(env.ACCOUNTS.idFromName('main'));
const lobby = (env, code) => env.LOBBY.get(env.LOBBY.idFromName('lobby:' + code));
// the browser never sends the password: it sends a key stretched from it (PBKDF2, 200k rounds), always 64 hex digits
const validKey = k => typeof k === 'string' && /^[0-9a-f]{64}$/.test(k);
const int = (v, max) => Math.max(0, Math.min(max, Math.round(+v || 0)));

async function readJson(req, limit) {
  const text = await req.text();
  if (text.length > limit) throw new HttpError(413, 'Too much data');
  try { return JSON.parse(text); } catch { throw new HttpError(400, 'Bad request'); }
}
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try { return await api(req, env, url); }
    catch (e) { if (e instanceof HttpError) return fail(e.status, e.message); console.error(e); return fail(500, 'Something went wrong on the server'); }
  },
};

async function api(req, env, url) {
  const path = url.pathname, method = req.method, acct = accounts(env);
  // requests that change something must come from this site
  const origin = req.headers.get('origin');
  if (origin && new URL(origin).host !== url.host) return fail(403, 'Wrong origin');
  const token = cookieToken(req), th = token ? await sha256(token) : null;
  const who = async () => { const u = th && await acct.userBySession(th); if (!u) throw new HttpError(401, 'Log in first'); return u; };
  const startSession = async userId => { const t = randomToken(); await acct.createSession(await sha256(t), userId, SESSION_DAYS); return sidCookie(t, SESSION_DAYS); };

  let m;
  if (method === 'GET' && (m = /^\/api\/name\/([A-Za-z]{4,30})$/.exec(path))) {
    const p = parseName(m[1]); if (!p) return json({ valid: false, available: false });
    return json({ valid: true, name: p.name, available: !(await acct.nameTaken(p.name)) });
  }
  if (method === 'POST' && path === '/api/register') {
    const body = await readJson(req, 2000), p = parseName(body.name);
    if (!p) return fail(400, 'Usernames are a colour and a fruit. Spin for one.');
    if (!validKey(body.key)) return fail(400, 'Bad password data');
    const res = await acct.register(p.name, body.key);
    if (res.error) return fail(409, res.error);
    return json({ ok: true }, 200, { 'set-cookie': await startSession(res.id) });
  }
  if (method === 'POST' && path === '/api/login') {
    const body = await readJson(req, 2000), p = parseName(body.name);
    if (!p || !validKey(body.key)) return fail(401, 'Wrong username or password');
    const res = await acct.login(p.name, body.key);
    if (res.error) return fail(res.status || 401, res.error);
    return json({ ok: true }, 200, { 'set-cookie': await startSession(res.id) });
  }
  if (method === 'POST' && path === '/api/logout') {
    if (th) await acct.endSession(th);
    return json({ ok: true }, 200, { 'set-cookie': sidCookie('', 0) });
  }
  if (method === 'GET' && path === '/api/me') {
    const u = await who(), data = await acct.load(u.id);
    // saved values are JSON text already: splice them in rather than parsing megabytes on the server
    const save = Object.entries(data.save).map(([k, v]) => JSON.stringify(k) + ':' + v).join(',');
    return new Response(`{"user":${JSON.stringify(u)},"rev":${data.rev},"save":{${save}}}`, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  }
  if (method === 'PUT' && path === '/api/save') {
    const u = await who(), body = await readJson(req, 4_000_000);
    if (!body.changes || typeof body.changes !== 'object') return fail(400, 'Bad save');
    const changes = {}; let stats = null;
    for (const [k, v] of Object.entries(body.changes)) {
      if (!/^stopover-[a-z-]{1,30}$/.test(k) || typeof v !== 'string' || v.length > 1_800_000) return fail(400, 'Bad save');
      let val; try { val = JSON.parse(v); } catch { return fail(400, 'Bad save'); }
      if (k === 'stopover-profile' && val && typeof val === 'object') {
        let text = v;
        if ('debug' in val) { delete val.debug; text = JSON.stringify(val); }
        changes[k] = text;
        const s = body.summary || {};
        stats = { flags: Object.keys(val.flagsSeen || {}).length, coins: int(val.coins, 1e9), trips: int(val.trips, 1e6), km: int(val.km, 1e9),
          rating: int(s.rating, 1e5), league: /^[a-z-]{1,20}$/.test(s.league) ? s.league : 'travel-doc', places: int(s.places, 1e7), countries: int(s.countries, 400) };
      } else changes[k] = v;
    }
    const res = await acct.save(u.id, int(body.rev, 1e12), changes, stats);
    if (res.error) return fail(res.status, res.error);
    return json({ rev: res.rev });
  }
  if (method === 'POST' && path === '/api/password') {
    const u = await who(), body = await readJson(req, 2000);
    if (!validKey(body.old) || !validKey(body.key)) return fail(400, 'Bad password data');
    const res = await acct.changePassword(u.id, body.old, body.key, th);
    return res.error ? fail(401, res.error) : json({ ok: true });
  }
  if (method === 'GET' && path === '/api/leaderboard') { await who(); return json({ rows: await acct.leaderboard() }); }
  if (method === 'GET' && (m = /^\/api\/profile\/([A-Za-z]{4,30})$/.exec(path))) {
    await who();
    const p = parseName(m[1]), data = p && await acct.profile(p.name);
    if (!data) return fail(404, 'No such player');
    let prof = {}; try { prof = JSON.parse(data.profile || '{}') || {}; } catch {}
    // only what a profile page shows: no study decks, blind spots or trip in progress
    const pick = { flagsSeen: prof.flagsSeen || {}, stamps: prof.stamps || {}, history: (prof.history || []).slice(0, 10), best: prof.best || {},
      achievements: Object.keys(prof.achievements || {}), trips: prof.trips || 0, km: prof.km || 0, ferries: prof.ferries || 0, cover: prof.cover || null, feats: { isles: ((prof.feats || {}).isles || []).length } };
    return json({ ...data, profile: pick });
  }
  if (method === 'POST' && path === '/api/lobby') {
    const u = await who();
    for (let i = 0; i < 8; i++) {
      const code = Array.from(crypto.getRandomValues(new Uint8Array(4)), b => CODE_LETTERS[b % CODE_LETTERS.length]).join('');
      if (await lobby(env, code).create(code, u)) return json({ code });
    }
    return fail(503, 'Could not make a lobby, try again');
  }
  if (method === 'GET' && (m = /^\/api\/lobby\/([A-Za-z]{4})$/.exec(path))) { await who(); return json(await lobby(env, m[1].toUpperCase()).info()); }
  if (method === 'GET' && (m = /^\/api\/lobby\/([A-Za-z]{4})\/ws$/.exec(path))) {
    if (req.headers.get('upgrade') !== 'websocket') return fail(426, 'WebSocket only');
    const u = await who(), headers = new Headers(req.headers);
    headers.set('x-uid', String(u.id)); headers.set('x-name', u.name);
    return lobby(env, m[1].toUpperCase()).fetch(new Request(req.url, { headers }));
  }
  return fail(404, 'Not found');
}

// ================= accounts, saves, leaderboard =================
export class Accounts extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    for (const stmt of [
      `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, name_lc TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, hash TEXT NOT NULL, created INTEGER NOT NULL, last_seen INTEGER NOT NULL, fails INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0)`,
      `CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS save_keys (user_id INTEGER NOT NULL, k TEXT NOT NULL, v TEXT NOT NULL, PRIMARY KEY (user_id, k))`,
      `CREATE TABLE IF NOT EXISTS stats (user_id INTEGER PRIMARY KEY, rev INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL DEFAULT 0, flags INTEGER NOT NULL DEFAULT 0, coins INTEGER NOT NULL DEFAULT 0, trips INTEGER NOT NULL DEFAULT 0, km INTEGER NOT NULL DEFAULT 0, rating INTEGER NOT NULL DEFAULT 0, league TEXT NOT NULL DEFAULT 'travel-doc', places INTEGER NOT NULL DEFAULT 0, countries INTEGER NOT NULL DEFAULT 0)`,
      `CREATE TABLE IF NOT EXISTS races (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL, mode TEXT NOT NULL, players INTEGER NOT NULL, finished INTEGER NOT NULL, detail TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS race_players (race_id INTEGER NOT NULL, user_id INTEGER NOT NULL, place INTEGER, PRIMARY KEY (race_id, user_id))`,
    ]) this.sql.exec(stmt);
  }
  row(query, ...args) { return this.sql.exec(query, ...args).toArray()[0] || null; }

  nameTaken(name) { return !!this.row('SELECT 1 AS x FROM users WHERE name_lc = ?', name.toLowerCase()); }
  async register(name, key) {
    if (this.nameTaken(name)) return { error: `${name} is taken. Spin again.` };
    const salt = randomHex(16), now = Date.now();
    this.sql.exec('INSERT INTO users (name, name_lc, salt, hash, created, last_seen) VALUES (?, ?, ?, ?, ?, ?)', name, name.toLowerCase(), salt, await sha256(salt + key), now, now);
    const u = this.row('SELECT id FROM users WHERE name_lc = ?', name.toLowerCase());
    this.sql.exec('INSERT INTO stats (user_id, updated) VALUES (?, ?)', u.id, now);
    return { id: u.id };
  }
  async login(name, key) {
    const u = this.row('SELECT * FROM users WHERE name_lc = ?', name.toLowerCase()), now = Date.now();
    if (!u) return { error: 'Wrong username or password' };
    if (u.locked_until > now) return { status: 429, error: `Too many wrong passwords. Try again in ${Math.ceil((u.locked_until - now) / 60000)} min.` };
    if (await sha256(u.salt + key) !== u.hash) {
      const fails = u.fails + 1;
      this.sql.exec('UPDATE users SET fails = ?, locked_until = ? WHERE id = ?', fails >= 8 ? 0 : fails, fails >= 8 ? now + 5 * 60000 : 0, u.id);
      return { error: 'Wrong username or password' };
    }
    this.sql.exec('UPDATE users SET fails = 0, locked_until = 0, last_seen = ? WHERE id = ?', now, u.id);
    return { id: u.id };
  }
  async changePassword(userId, oldKey, newKey, keepToken) {
    const u = this.row('SELECT salt, hash FROM users WHERE id = ?', userId);
    if (!u || await sha256(u.salt + oldKey) !== u.hash) return { error: 'Your current password is wrong' };
    const salt = randomHex(16);
    this.sql.exec('UPDATE users SET salt = ?, hash = ? WHERE id = ?', salt, await sha256(salt + newKey), userId);
    // sign out every other device
    this.sql.exec('DELETE FROM sessions WHERE user_id = ? AND token != ?', userId, keepToken);
    return { ok: true };
  }
  createSession(tokenHash, userId, days) {
    const now = Date.now();
    this.sql.exec('DELETE FROM sessions WHERE expires < ?', now);
    this.sql.exec('INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)', tokenHash, userId, now + days * 864e5);
  }
  endSession(tokenHash) { this.sql.exec('DELETE FROM sessions WHERE token = ?', tokenHash); }
  userBySession(tokenHash) {
    const now = Date.now(), r = this.row('SELECT u.id, u.name, u.last_seen FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires > ?', tokenHash, now);
    if (!r) return null;
    if (now - r.last_seen > 60000) this.sql.exec('UPDATE users SET last_seen = ? WHERE id = ?', now, r.id);
    return { id: r.id, name: r.name };
  }

  load(userId) {
    const save = {};
    for (const r of this.sql.exec('SELECT k, v FROM save_keys WHERE user_id = ?', userId)) save[r.k] = r.v;
    return { save, rev: (this.row('SELECT rev FROM stats WHERE user_id = ?', userId) || { rev: 0 }).rev };
  }
  save(userId, rev, changes, stats) {
    const cur = this.row('SELECT * FROM stats WHERE user_id = ?', userId), now = Date.now();
    if (!cur) return { status: 404, error: 'No such account' };
    // two tabs or devices playing at once would overwrite each other's progress
    if (rev !== cur.rev) return { status: 409, error: 'This account was used in another tab or device. Reload to continue from the newest save.' };
    if (stats) {
      // a browser game can be edited from the developer console, so progress that jumps faster than play allows is refused
      const secs = Math.min(300, Math.max(0, (now - cur.updated) / 1000));
      if (stats.flags > cur.flags + 60 + 2 * secs || stats.coins > cur.coins + 1500 + 15 * secs)
        return { status: 422, error: 'That progress jumped too fast to be real, so it was not saved. Reload to go back to your last save.' };
    }
    for (const [k, v] of Object.entries(changes)) this.sql.exec('INSERT INTO save_keys (user_id, k, v) VALUES (?, ?, ?) ON CONFLICT (user_id, k) DO UPDATE SET v = excluded.v', userId, k, v);
    if (stats) this.sql.exec('UPDATE stats SET rev = rev + 1, updated = ?, flags = ?, coins = ?, trips = ?, km = ?, rating = ?, league = ?, places = ?, countries = ? WHERE user_id = ?',
      now, stats.flags, stats.coins, stats.trips, stats.km, stats.rating, stats.league, stats.places, stats.countries, userId);
    else this.sql.exec('UPDATE stats SET rev = rev + 1 WHERE user_id = ?', userId);
    return { rev: cur.rev + 1 };
  }

  leaderboard() {
    return this.sql.exec(`SELECT u.name, s.flags, s.rating, s.league, s.trips, s.places, s.countries, s.km, u.last_seen AS seen,
        (SELECT COUNT(*) FROM race_players p WHERE p.user_id = u.id) AS races,
        (SELECT COUNT(*) FROM race_players p JOIN races r ON r.id = p.race_id WHERE p.user_id = u.id AND p.place = 1 AND r.players > 1) AS wins
      FROM users u JOIN stats s ON s.user_id = u.id ORDER BY s.flags DESC, s.rating DESC, u.id ASC LIMIT 200`).toArray();
  }
  profile(name) {
    const u = this.row(`SELECT u.id, u.name, u.created, u.last_seen AS seen, s.flags, s.rating, s.league, s.trips, s.places, s.countries, s.km FROM users u JOIN stats s ON s.user_id = u.id WHERE u.name_lc = ?`, name.toLowerCase());
    if (!u) return null;
    const rank = this.row('SELECT COUNT(*) + 1 AS rank FROM stats WHERE flags > ?', u.flags).rank;
    const races = this.sql.exec(`SELECT r.mode, r.players, r.finished, p.place FROM race_players p JOIN races r ON r.id = p.race_id WHERE p.user_id = ? ORDER BY r.id DESC LIMIT 10`, u.id).toArray();
    const totals = this.row(`SELECT COUNT(*) AS races, SUM(CASE WHEN p.place = 1 AND r.players > 1 THEN 1 ELSE 0 END) AS wins FROM race_players p JOIN races r ON r.id = p.race_id WHERE p.user_id = ?`, u.id);
    const prof = this.row(`SELECT v FROM save_keys WHERE user_id = ? AND k = 'stopover-profile'`, u.id);
    const { id, ...pub } = u;
    return { ...pub, rank, races: totals.races || 0, wins: totals.wins || 0, recentRaces: races, profile: prof ? prof.v : null };
  }
  recordRace(code, mode, results) {
    this.sql.exec('INSERT INTO races (code, mode, players, finished, detail) VALUES (?, ?, ?, ?, ?)', code, mode, results.length, Date.now(), JSON.stringify(results));
    const id = this.row('SELECT last_insert_rowid() AS id').id;
    for (const r of results) this.sql.exec('INSERT OR IGNORE INTO race_players (race_id, user_id, place) VALUES (?, ?, ?)', id, r.id, r.place);
  }
}

// ================= race lobbies =================
// One object per lobby code. Players connect by WebSocket; the object keeps the lobby, runs the race clock and ranks
// the results. Everyone's browser plays the same trip (the host's browser plans it) and reports each stop.
const MODES = ['time', 'points', 'distance', 'stops'];
const SETTING_CHOICES = {
  mode: MODES, limit: [0, 5, 10, 15, 20, 30], vehicle: ['car', 'bike', 'boat', 'train'],
  length: ['short', 'medium', 'long', 'epic'],
  preset: ['beginner', 'standard', 'expert', 'purist'], show: ['live', 'hidden'],
};
// regions is a set now, so a host can race Europe + Asia. It is the one setting that isn't a single choice.
const REGION_IDS = ['EU', 'AS', 'AF', 'NA', 'SA', 'OC', 'ALL', 'UNCHARTED'];
const cleanRegions = v => {
  if (!Array.isArray(v)) return null;
  const r = [...new Set(v.filter(x => REGION_IDS.includes(x)))];
  if (!r.length) return null;
  return r.includes('UNCHARTED') ? ['UNCHARTED'] : r.includes('ALL') ? ['ALL'] : r;
};
// The rest of a race is everything a solo trip can be. The server doesn't plan routes, it only keeps what the
// host picked in shape: known words, whole-number place ids, kilometres inside their slider's track.
const gidOrNull = v => v === null ? null : Number.isInteger(v) && v > 0 && v < 2e9 ? v : undefined;
const RULE_WORDS = { planes: ['all', 'large', 'capitals'], trains: ['all', 'capitals'], tank: ['big', 'standard', 'small'], hints: ['on', 'off'] };
const RULE_KM = { planeKm: 9000, trainKm: 1500, ferryKm: 1200 };
function cleanTripSettings(m) {
  const out = {};
  if (['coast', 'isles'].includes(m.voyage)) out.voyage = m.voyage;
  if (typeof m.ocean === 'string' && /^[a-z]{1,16}$/.test(m.ocean)) out.ocean = m.ocean;
  for (const k of ['isle', 'from', 'to']) { const g = gidOrNull(m[k]); if (g !== undefined) out[k] = g; }
  if (Array.isArray(m.via) && m.via.length <= 3 && m.via.every(g => gidOrNull(g))) out.via = m.via;
  if (Array.isArray(m.skip) && m.skip.length <= 60 && m.skip.every(x => typeof x === 'string' && /^[A-Z]{2}-[A-Z]{2,10}$/.test(x))) out.skip = [...new Set(m.skip)];
  if (['explorer', 'navigator'].includes(m.assist)) out.assist = m.assist;
  if (Array.isArray(m.avoid) && m.avoid.length <= 40 && m.avoid.every(x => typeof x === 'string' && /^[A-Z]{2}$/.test(x))) out.avoid = [...new Set(m.avoid)];
  if (m.rules && typeof m.rules === 'object') {
    const r = {};
    for (const [k, words] of Object.entries(RULE_WORDS)) if (words.includes(m.rules[k])) r[k] = m.rules[k];
    for (const [k, max] of Object.entries(RULE_KM)) if (Number.isFinite(m.rules[k])) r[k] = Math.max(0, Math.min(max, Math.round(m.rules[k])));
    out.rules = r;
  }
  return out;
}
const DEFAULT_SETTINGS = { mode: 'time', limit: 15, vehicle: 'car', regions: ['EU'], length: 'short', preset: 'standard', show: 'live' };

export class Lobby extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    ctx.blockConcurrencyWhile(async () => { this.st = (await ctx.storage.get('st')) || null; });
  }
  async persist() { await this.ctx.storage.put('st', this.st); }
  sockets() { return this.ctx.getWebSockets().filter(ws => ws.readyState === 1); }
  online() { return new Set(this.sockets().map(ws => (ws.deserializeAttachment() || {}).uid)); }

  async create(code, user) {
    if (this.st && this.sockets().length) return false;
    this.st = { code, host: user.id, created: Date.now(), settings: { ...DEFAULT_SETTINGS }, players: {}, order: [], phase: 'lobby', race: null, results: null, raceN: 0 };
    await this.persist();
    await this.ctx.storage.setAlarm(Date.now() + 10 * 60000); // closes if nobody ever joins
    return true;
  }

  info() { const st = this.st; return st ? { exists: true, players: st.order.length, full: st.order.length >= MAX_PLAYERS, phase: st.phase } : { exists: false }; }

  async fetch(req) {
    const uid = +req.headers.get('x-uid'), name = req.headers.get('x-name') || '?';
    if (!this.st) return new Response('No lobby with that code', { status: 404 });
    const st = this.st;
    if (!st.players[uid] && st.order.length >= MAX_PLAYERS) return new Response('That lobby is full', { status: 403 });
    if (!st.players[uid]) { st.players[uid] = { id: uid, name, ready: false }; st.order.push(uid); }
    if (!st.players[st.host]) st.host = uid;
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ uid });
    await this.persist();
    this.broadcast();
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  // each player gets their own view: with hidden positions, rivals' towns stay secret until you finish
  view(uid) {
    const st = this.st, online = this.online(), r = st.race;
    let race = null;
    if (r) {
      const mine = r.progress[uid], reveal = st.phase === 'results' || st.settings.show === 'live' || (mine && (mine.done || mine.gaveUp));
      const progress = {};
      for (const [id, p] of Object.entries(r.progress)) progress[id] = reveal || +id === uid ? p : { ...p, cur: null };
      race = { n: r.n, trip: r.trip, mode: r.mode, startAt: r.startAt, endAt: r.endAt, entrants: r.entrants, names: r.names || {}, progress };
    }
    return { t: 'state', now: Date.now(), me: uid, code: st.code, host: st.host, phase: st.phase, settings: st.settings,
      players: st.order.map(id => ({ ...st.players[id], online: online.has(id) })), race, results: st.results };
  }
  broadcast() {
    for (const ws of this.sockets()) { const a = ws.deserializeAttachment() || {}; try { ws.send(JSON.stringify(this.view(a.uid))); } catch {} }
  }
  sendError(ws, text) { try { ws.send(JSON.stringify({ t: 'error', text })); } catch {} }

  async webSocketMessage(ws, raw) {
    const st = this.st; if (!st || typeof raw !== 'string' || raw.length > 60000) return;
    const { uid } = ws.deserializeAttachment() || {}, me = st.players[uid];
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    if (!me) { if (msg.t !== 'leave') this.sendError(ws, 'You are not in this lobby any more.'); try { ws.close(4001, 'removed'); } catch {} return; }
    const isHost = uid === st.host, r = st.race, now = Date.now(), prog = r && r.progress[uid];
    switch (msg.t) {
      case 'settings': {
        if (!isHost || st.phase === 'racing') return;
        for (const [k, choices] of Object.entries(SETTING_CHOICES)) if (msg.settings && choices.includes(msg.settings[k])) st.settings[k] = msg.settings[k];
        if (msg.settings) { const regions = cleanRegions(msg.settings.regions); if (regions) { st.settings.regions = regions; delete st.settings.region; } Object.assign(st.settings, cleanTripSettings(msg.settings)); }
        for (const p of Object.values(st.players)) p.ready = false;
        break;
      }
      case 'ready': me.ready = !!msg.on; break;
      case 'start': {
        if (!isHost || st.phase === 'racing') return;
        const trip = msg.trip, size = JSON.stringify(trip || null).length;
        if (!trip || size > 40000 || !Number.isInteger(trip.start) || !Number.isInteger(trip.dest)) return this.sendError(ws, 'The trip could not be sent.');
        const online = this.online(), entrants = st.order.filter(id => online.has(id));
        const startAt = now + 6000, limit = st.settings.limit;
        st.raceN = (st.raceN || 0) + 1;
        st.race = { n: st.raceN, trip, mode: st.settings.mode, startAt, endAt: limit ? startAt + limit * 60000 : null, entrants, names: Object.fromEntries(entrants.map(id => [id, st.players[id].name])),
          progress: Object.fromEntries(entrants.map(id => [id, { stops: 0, cur: trip.start, km: 0, pts: 0, done: false, gaveUp: false, finishMs: null, total: null }])) };
        st.phase = 'racing'; st.results = null;
        for (const p of Object.values(st.players)) p.ready = false;
        break;
      }
      case 'progress': case 'finish': {
        if (st.phase !== 'racing' || !prog || prog.done || prog.gaveUp || now < r.startAt - 1500) return;
        if (!Number.isInteger(msg.cur) || !Number.isInteger(msg.stops) || msg.stops < prog.stops) return;
        Object.assign(prog, { stops: msg.stops, cur: msg.cur, km: Math.round(+msg.km || 0), pts: Math.round(+msg.pts || 0) });
        if (msg.t === 'finish') {
          if (msg.cur !== r.trip.dest) return;
          Object.assign(prog, { done: true, finishMs: Math.max(0, now - r.startAt), total: Math.round(+msg.total || 0) });
        }
        break;
      }
      case 'giveup': if (st.phase === 'racing' && prog && !prog.done) prog.gaveUp = true; break;
      case 'end': if (isHost && st.phase === 'racing') await this.finishRace(); break;
      case 'kick': {
        if (!isHost || msg.id === uid || !st.players[msg.id]) return;
        this.removePlayer(msg.id);
        for (const s of this.sockets()) if ((s.deserializeAttachment() || {}).uid === msg.id) { try { s.send(JSON.stringify({ t: 'kicked' })); s.close(4001, 'kicked'); } catch {} }
        break;
      }
      case 'leave': this.removePlayer(uid); try { ws.close(1000, 'left'); } catch {} break;
      default: return;
    }
    if (st.phase === 'racing' && st.race.entrants.every(id => { const p = st.race.progress[id]; return p.done || p.gaveUp || !st.players[id]; })) await this.finishRace();
    await this.persist(); await this.schedule(); this.broadcast();
  }

  removePlayer(uid) {
    const st = this.st; delete st.players[uid]; st.order = st.order.filter(id => id !== uid);
    if (st.race && st.phase === 'racing' && st.race.progress[uid] && !st.race.progress[uid].done) st.race.progress[uid].gaveUp = true;
    if (st.host === uid) { const online = this.online(); st.host = st.order.find(id => online.has(id) && id !== uid) ?? st.order[0] ?? null; }
  }

  async finishRace() {
    const st = this.st, r = st.race; if (!r || st.phase !== 'racing') return;
    const metric = { time: p => p.finishMs, points: p => -p.total, distance: p => p.km, stops: p => p.stops }[r.mode];
    const rows = r.entrants.map(id => ({ id, name: (st.players[id] || {}).name || (r.names || {})[id] || '?', ...r.progress[id] }));
    const done = rows.filter(p => p.done).sort((a, b) => metric(a) - metric(b) || a.finishMs - b.finishMs);
    const out = rows.filter(p => !p.done).sort((a, b) => b.stops - a.stops);
    st.results = [...done.map((p, i) => ({ ...p, place: i + 1 })), ...out.map(p => ({ ...p, place: null }))]
      .map(({ id, name, place, stops, km, total, finishMs, gaveUp }) => ({ id, name, place, stops, km, total, finishMs, dnf: place == null, gaveUp }));
    st.phase = 'results';
    // everyone who started counts as a race played, including players who left
    try { await accounts(this.env).recordRace(st.code, r.mode, st.results.map(x => ({ id: x.id, place: x.place }))); } catch (e) { console.error('recordRace', e); }
  }

  async schedule() {
    const st = this.st; if (!st) return;
    if (st.phase === 'racing' && st.race.endAt) await this.ctx.storage.setAlarm(st.race.endAt + 1000);
    else if (!this.sockets().length) await this.ctx.storage.setAlarm(Date.now() + 15 * 60000);
  }
  async alarm() {
    const st = this.st; if (!st) return;
    if (st.phase === 'racing' && st.race.endAt && Date.now() >= st.race.endAt) { await this.finishRace(); await this.persist(); this.broadcast(); }
    if (!this.sockets().length) { if (st.phase !== 'racing' || !st.race.endAt) { await this.ctx.storage.deleteAll(); this.st = null; } else await this.schedule(); }
    else await this.schedule();
  }
  async webSocketClose(ws) {
    try { ws.close(1000, 'bye'); } catch {}
    const st = this.st; if (!st) return;
    const online = this.online(); online.delete((ws.deserializeAttachment() || {}).uid);
    if (st.host != null && !online.has(st.host) && st.phase !== 'racing') { const next = st.order.find(id => online.has(id)); if (next != null) st.host = next; }
    await this.persist(); await this.schedule(); this.broadcast();
  }
  async webSocketError(ws) { await this.webSocketClose(ws); }
}
