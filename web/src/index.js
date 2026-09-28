// Stopover online: accounts, cloud saves, the leaderboard and race lobbies.
// Static files (the game itself) are served from ./public; only /api/* reaches this code.
import { DurableObject } from 'cloudflare:workers';
import { parseName, nickProblem, randomName } from './names.js';

const SESSION_DAYS = 60, MAX_PLAYERS = 8, CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
// Guests play without an account under a random fruit name. Their key lives only in the browser tab (sessionStorage),
// so closing the tab loses it; the tab pings while it is open, and a guest nobody has heard from in GUEST_IDLE_HOURS
// is deleted with everything they saved.
const GUEST_IDLE_HOURS = 6, GUEST_SESSION_DAYS = 7;

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const fail = (status, error) => json({ error }, status);
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha256 = async text => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
const randomHex = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const randomToken = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const TOKEN_RE = /^[A-Za-z0-9_-]{30,60}$/;
const cookieToken = req => (/(?:^|;\s*)sid=([A-Za-z0-9_-]{30,60})/.exec(req.headers.get('cookie') || '') || [])[1] || null;
// a guest's tab sends its key in a header; a WebSocket can't carry headers, so the lobby socket sends it in the address
const guestToken = (req, url) => { const t = req.headers.get('x-guest') || (url.pathname.endsWith('/ws') ? url.searchParams.get('gt') : null); return t && TOKEN_RE.test(t) ? t : null; };
const sidCookie = (token, days) => `sid=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.round(days * 86400)}`;
const accounts = env => env.ACCOUNTS.get(env.ACCOUNTS.idFromName('main'));
const lobby = (env, code) => env.LOBBY.get(env.LOBBY.idFromName('lobby:' + code));
// the browser never sends the password: it sends a key stretched from it (PBKDF2, 200k rounds), always 64 hex digits
const validKey = k => typeof k === 'string' && /^[0-9a-f]{64}$/.test(k);
const int = (v, max) => Math.max(0, Math.min(max, Math.round(+v || 0)));
// periods a score may be posted for: today or yesterday (UTC), this ISO week or last, so a trip finished just
// after midnight still lands on the board it was started on
const dayId = t => new Date(t).toISOString().slice(0, 10);
function weekId(t) { const d = new Date(t), day = d.getUTCDay() || 7; d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() + 4 - day); const y = d.getUTCFullYear(); return `${y}-W${String(Math.ceil(((d - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7)).padStart(2, '0')}`; }
const recentPeriod = (kind, p) => typeof p === 'string' && (kind === 'daily' ? [dayId(Date.now()), dayId(Date.now() - 864e5)] : [weekId(Date.now()), weekId(Date.now() - 7 * 864e5)]).includes(p);
// places known per country (ISO code → count), sent with each save; it is what crowns are decided by
const cleanKnown = v => { if (!v || typeof v !== 'object') return null; const out = {}; for (const [cc, n] of Object.entries(v).slice(0, 300)) if (/^[A-Z]{2}$/.test(cc) && Number.isFinite(n) && n > 0) out[cc] = Math.min(100000, Math.round(n)); return JSON.stringify(out); };
// A nickname is what other players see. It isn't unique and isn't used to log in, so it can be anything
// readable: letters in any script, digits, spaces and a little punctuation. The one thing it may not be is
// someone else's fruit username, or a player could pass themselves off as them.
function cleanNick(raw, ownName) {
  const nick = String(raw ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!nick) return { nick: null };
  const len = [...nick].length;
  if (len < 2 || len > 24) return { error: 'A nickname is 2 to 24 characters.' };
  if (!/^[\p{L}\p{N}][\p{L}\p{M}\p{N} ._'’-]*$/u.test(nick)) return { error: 'Use letters, numbers, spaces and . _ \' - only.' };
  const p = parseName(nick.replace(/\s+/g, ''));
  if (p && p.name.toLowerCase() !== String(ownName).toLowerCase()) return { error: 'That looks like someone’s username. Pick something else.' };
  const bad = nickProblem(nick); if (bad) return { error: bad };
  return { nick };
}

// What a player shows beside their name: the flag they represent, the passport cover they carry, their league and
// a title. The browser sends them with each save; the server only checks their shape, since the game that earns
// them runs in the browser anyway.
const CONTINENTS = ['EU', 'AS', 'AF', 'NA', 'SA', 'OC'];
const cc2 = v => typeof v === 'string' && /^[A-Z]{2}$/.test(v) ? v : null;
const cleanTitle = v => typeof v === 'string' && /^[a-z0-9-]{1,24}(:[A-Z]{2})?$/.test(v) ? v : null;
const cleanWord = v => typeof v === 'string' && /^[a-z0-9-]{1,24}$/.test(v) ? v : null;
// the drawn vehicle a player drives, per vehicle kind: what rivals see of them in a race
const cleanRide = v => { if (!v || typeof v !== 'object') return null; const out = {}; for (const k of ['car', 'bike', 'boat', 'train', 'plane']) { const m = cleanWord(v[k]); if (m) out[k] = m; } return out; };
// a player's full look in a lobby, from their saved stats or a message they sent
const cleanLook = v => ({ flair: cc2(v.flair), cover: cc2(v.cover), league: typeof v.league === 'string' && /^[a-z-]{1,20}$/.test(v.league) ? v.league : null, title: cleanTitle(v.title), motto: cleanWord(v.motto), ride: cleanRide(v.ride), fx: cleanWord(v.fx) });
const cleanCont = v => { if (!v || typeof v !== 'object') return null; const out = {}; for (const c of CONTINENTS) if (v[c] > 0) out[c] = int(v[c], 1e6); return JSON.stringify(out); };
// the public parts of a profile save that aren't stats: pinned showcase items and the recent-expeditions feed
const cleanShowcase = v => Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.length <= 100 && /^(ach|flag|stamp|cover|crown):/.test(x)).slice(0, 3) : [];
const cleanFeed = v => Array.isArray(v) ? v.slice(0, 30).filter(e => e && typeof e === 'object' && typeof e.k === 'string').map(e => {
  const out = {}; for (const [k, x] of Object.entries(e).slice(0, 14)) if (/^[a-z]{1,8}$/i.test(k) && ((typeof x === 'string' && x.length <= 80) || Number.isFinite(x) || typeof x === 'boolean')) out[k] = x;
  return out; }) : [];
const IDENT = 's.flair, s.cover, s.league, s.title, s.motto';
// leaderboard categories: the column each one ranks by
const WINS = '(SELECT COUNT(*) FROM race_players p JOIN races r ON r.id = p.race_id WHERE p.user_id = u.id AND p.place = 1 AND r.players > 1)';
const BOARD_BY = { flags: 's.flags', rating: 's.rating', places: 's.places', countries: 's.countries', wins: WINS,
  ...Object.fromEntries(CONTINENTS.map(c => [c, `CAST(COALESCE(json_extract(s.cont, '$.${c}'), 0) AS INTEGER)`])) };

// a bounty's route: fixed start and destination, the vehicle, length and rules it was driven under
const BOUNTY_REWARDS = [100, 250, 500, 1000, 2000], BOUNTY_DAYS = 7;
function cleanBountySpec(v) {
  if (!v || typeof v !== 'object') return null;
  const from = gidOrNull(v.from), to = gidOrNull(v.to);
  if (!from || !to || from === to || !['car', 'bike', 'boat', 'train'].includes(v.vehicle) || !['short', 'medium', 'long', 'epic'].includes(v.length)) return null;
  const t = cleanTripSettings({ rules: v.rules || {}, assist: v.assist });
  return JSON.stringify({ from, to, vehicle: v.vehicle, length: v.length, rules: t.rules || {}, assist: t.assist || 'explorer' });
}

async function readJson(req, limit) {
  const text = await req.text();
  if (text.length > limit) throw new HttpError(413, 'Too much data');
  try { return JSON.parse(text); } catch { throw new HttpError(400, 'Bad request'); }
}
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    // one address for the game: www goes to the bare domain, so a log-in made on one isn't missing on the other
    if (url.hostname.startsWith('www.')) { url.hostname = url.hostname.slice(4); return Response.redirect(url.toString(), 301); }
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
  const token = guestToken(req, url) || cookieToken(req), th = token ? await sha256(token) : null;
  const who = async () => { const u = th && await acct.userBySession(th); if (!u) throw new HttpError(401, 'Log in first'); return u; };
  // the things other players see or that move coins between players need a real account
  const member = async what => { const u = await who(); if (u.guest) throw new HttpError(403, `Create an account to ${what}.`); return u; };
  const startSession = async userId => { const t = randomToken(); await acct.createSession(await sha256(t), userId, SESSION_DAYS); return sidCookie(t, SESSION_DAYS); };

  let m;
  if (method === 'GET' && (m = /^\/api\/name\/([A-Za-z]{4,30})$/.exec(path))) {
    const p = parseName(m[1]); if (!p) return json({ valid: false, available: false });
    return json({ valid: true, name: p.name, available: !(await acct.nameTaken(p.name)) });
  }
  // a new guest: a random fruit name and a key for this browser tab only
  if (method === 'POST' && path === '/api/guest') {
    const t = randomToken(), res = await acct.createGuest(await sha256(t), GUEST_SESSION_DAYS);
    return json({ token: t, name: res.name });
  }
  if (method === 'POST' && path === '/api/register') {
    const body = await readJson(req, 2000), p = parseName(body.name);
    if (!p) return fail(400, 'Usernames are a colour and a fruit. Spin for one.');
    if (!validKey(body.key)) return fail(400, 'Bad password data');
    // a guest who signs up keeps everything they played so far: their guest row becomes the account
    const cur = th && await acct.userBySession(th);
    const res = cur && cur.guest ? await acct.claimGuest(cur.id, p.name, body.key) : await acct.register(p.name, body.key);
    if (res.error) return fail(409, res.error);
    return json({ ok: true }, 200, { 'set-cookie': await startSession(res.id) });
  }
  if (method === 'POST' && path === '/api/login') {
    const body = await readJson(req, 2000), p = parseName(body.name);
    if (!p || !validKey(body.key)) return fail(401, 'Wrong username or password');
    const res = await acct.login(p.name, body.key);
    if (res.error) return fail(res.status || 401, res.error);
    // logging in from a guest tab leaves the guest behind, so it goes now rather than when it idles out
    const cur = th && await acct.userBySession(th);
    if (cur && cur.guest) await acct.deleteGuest(cur.id);
    return json({ ok: true }, 200, { 'set-cookie': await startSession(res.id) });
  }
  if (method === 'POST' && path === '/api/logout') {
    if (th) await acct.endSession(th);
    return json({ ok: true }, 200, { 'set-cookie': sidCookie('', 0) });
  }
  // an open guest tab says it's still there, so the guest isn't cleared while someone is playing
  if (method === 'POST' && path === '/api/ping') { await who(); return json({ ok: true }); }
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
          rating: int(s.rating, 1e5), league: /^[a-z-]{1,20}$/.test(s.league) ? s.league : 'travel-doc', places: int(s.places, 1e7), countries: int(s.countries, 400),
          known: cleanKnown(s.known), flair: cc2(s.flair), cover: cc2(s.cover), title: cleanTitle(s.title), motto: cleanWord(s.motto), cont: cleanCont(s.cont) };
      } else changes[k] = v;
    }
    const res = await acct.save(u.id, int(body.rev, 1e12), changes, stats);
    if (res.error) return fail(res.status, res.error);
    return json({ rev: res.rev });
  }
  if (method === 'POST' && path === '/api/password') {
    const u = await member('set a password'), body = await readJson(req, 2000);
    if (!validKey(body.old) || !validKey(body.key)) return fail(400, 'Bad password data');
    const res = await acct.changePassword(u.id, body.old, body.key, th);
    return res.error ? fail(401, res.error) : json({ ok: true });
  }
  if (method === 'POST' && path === '/api/nick') {
    const u = await member('pick a nickname'), body = await readJson(req, 1000), c = cleanNick(body.nick, u.name);
    if (c.error) return fail(400, c.error);
    await acct.setNick(u.id, c.nick);
    return json({ ok: true, nick: c.nick });
  }
  // a nickname anyone finds abusive can be reported; three different players reporting the same one takes it down
  if (method === 'POST' && path === '/api/report') {
    const u = await member('report nicknames'), body = await readJson(req, 1000), p = parseName(body.name);
    if (!p) return fail(404, 'No such player');
    const res = await acct.reportNick(u.id, p.name);
    return res.error ? fail(res.status || 400, res.error) : json(res);
  }
  // ?by= picks the category, ?also= names players to rank even outside the top 200 (the ones you follow)
  if (method === 'GET' && path === '/api/leaderboard') {
    const u = await who(), by = BOARD_BY[url.searchParams.get('by')] ? url.searchParams.get('by') : 'flags';
    const also = (url.searchParams.get('also') || '').split(',').map(n => parseName(n)).filter(Boolean).map(p => p.name).slice(0, 30);
    return json(await acct.leaderboard(by, also, u.id));
  }
  if (method === 'GET' && path === '/api/crowns') { await who(); return json({ crowns: await acct.crowns() }); }
  // daily trip and weekly challenge: a finished run posts its score; the first finish in each period is the one that counts
  if (method === 'POST' && path === '/api/score') {
    const u = await member('get on the daily and weekly boards'), b = await readJson(req, 4000);
    if (!['daily', 'weekly'].includes(b.kind) || !recentPeriod(b.kind, b.period)) return fail(400, 'That trip is not on the board any more');
    const r = { total: int(b.total, 60000), km: int(b.km, 60000), stops: int(b.stops, 500), squares: typeof b.squares === 'string' ? b.squares.slice(0, 400) : '' };
    return json(await acct.postScore(u.id, b.kind, b.period, r));
  }
  // bounties: a player stakes coins on a route they finished; the first to beat their score on it takes them
  if (method === 'POST' && path === '/api/bounty') {
    const u = await member('post bounties'), b = await readJson(req, 6000), spec = cleanBountySpec(b.spec), target = b.target ? parseName(b.target) : null;
    if (!spec) return fail(400, 'That route can\'t carry a bounty.');
    if (!BOUNTY_REWARDS.includes(b.reward)) return fail(400, 'Pick one of the reward sizes.');
    return json(await acct.postBounty(u.id, spec, int(b.beat, 60000), b.reward, target && target.name));
  }
  if (method === 'GET' && path === '/api/bounties') { const u = await who(); return json(await acct.bounties(u.id)); }
  if (method === 'POST' && (m = /^\/api\/bounty\/(\d{1,9})\/(claim|refund)$/.exec(path))) {
    const u = await member('claim bounties'), b = await readJson(req, 1000);
    const res = m[2] === 'claim' ? await acct.claimBounty(u.id, +m[1], int(b.total, 60000)) : await acct.refundBounty(u.id, +m[1]);
    return res.error ? fail(res.status || 400, res.error) : json(res);
  }
  if (method === 'GET' && (m = /^\/api\/board\/(daily|weekly)\/([0-9W-]{7,10})$/.exec(path))) { const u = await who(); return json(await acct.board(m[1], m[2], u.id)); }
  if (method === 'GET' && (m = /^\/api\/profile\/([A-Za-z]{4,30})$/.exec(path))) {
    const u = await who(), p = parseName(m[1]);
    // guests aren't listed by name, but can open their own profile
    const data = p && (u.guest && p.name === u.name ? await acct.profile(null, u.id) : await acct.profile(p.name));
    if (!data) return fail(404, 'No such player');
    let prof = {}; try { prof = JSON.parse(data.profile || '{}') || {}; } catch {}
    // only what a profile page shows: no study decks, blind spots or trip in progress
    const visits = {}; for (const [k, v] of Object.entries(prof.visits || {})) if (v && typeof v === 'object') visits[k] = { n: int(v.n, 1e6), first: int(v.first, 1e13) };
    const study = {}; for (const [cc, v] of Object.entries(prof.study || {})) if (v && typeof v === 'object') study[cc] = { known: Array.isArray(v.known) ? v.known : [], bestPct: v.bestPct ?? null, correct: int(v.correct, 1e7), answered: int(v.answered, 1e7) };
    const pick = { flagsSeen: prof.flagsSeen || {}, stamps: prof.stamps || {}, history: (prof.history || []).slice(0, 30), best: prof.best || {},
      achievements: prof.achievements || {}, trips: prof.trips || 0, km: prof.km || 0, ferries: prof.ferries || 0, cover: prof.cover || null, feats: prof.feats || {},
      visits, study, holo: prof.holo || {}, flagSets: prof.flagSets || {}, flagStreak: prof.flagStreak || null, equip: { ink: ((prof.equip || {}).ink) || null, finish: cleanWord((prof.equip || {}).finish) },
      showcase: cleanShowcase(prof.showcase), feed: cleanFeed(prof.feed) };
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
    headers.set('x-uid', String(u.id)); headers.set('x-name', u.name); headers.set('x-nick', encodeURIComponent(u.nick || '')); headers.set('x-guest', u.guest ? '1' : '');
    headers.set('x-ident', encodeURIComponent(JSON.stringify({ flair: u.flair, cover: u.cover, league: u.league, title: u.title, motto: u.motto })));
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
    // added after launch: databases from before nicknames get the column on their next start
    try { this.sql.exec('ALTER TABLE users ADD COLUMN nick TEXT'); } catch { /* already there */ }
    try { this.sql.exec('ALTER TABLE stats ADD COLUMN known TEXT'); } catch { /* already there */ }
    try { this.sql.exec('ALTER TABLE users ADD COLUMN guest INTEGER NOT NULL DEFAULT 0'); } catch { /* already there */ }
    for (const col of ['flair', 'cover', 'title', 'cont', 'motto']) try { this.sql.exec(`ALTER TABLE stats ADD COLUMN ${col} TEXT`); } catch { /* already there */ }
    this.sql.exec('CREATE TABLE IF NOT EXISTS bounties (id INTEGER PRIMARY KEY AUTOINCREMENT, poster INTEGER NOT NULL, target INTEGER, spec TEXT NOT NULL, beat INTEGER NOT NULL, reward INTEGER NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL, claimed_by INTEGER, claimed_at INTEGER, claim_total INTEGER, refunded INTEGER NOT NULL DEFAULT 0)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS reports (target INTEGER NOT NULL, reporter INTEGER NOT NULL, nick TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (target, reporter, nick))');
    this.sql.exec('CREATE TABLE IF NOT EXISTS scores (kind TEXT NOT NULL, period TEXT NOT NULL, user_id INTEGER NOT NULL, total INTEGER NOT NULL, km INTEGER NOT NULL, stops INTEGER NOT NULL, squares TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (kind, period, user_id))');
    this.crownCache = null;
  }
  row(query, ...args) { return this.sql.exec(query, ...args).toArray()[0] || null; }

  nameTaken(name) { return !!this.row('SELECT 1 AS x FROM users WHERE name_lc = ?', name.toLowerCase()); }
  // Guests don't hold their fruit name: name_lc is a private placeholder, so the name stays free for anyone to sign
  // up with. Guests are handed a name nobody (account or guest) is using right now, when one can be found quickly.
  createGuest(tokenHash, days) {
    this.purgeGuests();
    let name = randomName();
    for (let i = 0; i < 30 && this.row('SELECT 1 AS x FROM users WHERE name = ?', name); i++) name = randomName();
    const now = Date.now();
    this.sql.exec('INSERT INTO users (name, name_lc, salt, hash, created, last_seen, guest) VALUES (?, ?, \'\', \'\', ?, ?, 1)', name, 'guest:' + randomHex(12), now, now);
    const id = this.row('SELECT last_insert_rowid() AS id').id;
    this.sql.exec('INSERT INTO stats (user_id, updated) VALUES (?, ?)', id, now);
    this.createSession(tokenHash, id, days);
    return { id, name };
  }
  async claimGuest(id, name, key) {
    if (this.nameTaken(name)) return { error: `${name} is taken. Spin again.` };
    const salt = randomHex(16), now = Date.now();
    this.sql.exec('UPDATE users SET name = ?, name_lc = ?, salt = ?, hash = ?, created = ?, last_seen = ?, guest = 0 WHERE id = ? AND guest = 1', name, name.toLowerCase(), salt, await sha256(salt + key), now, now, id);
    // the tab's guest key stops working; the account gets a normal cookie session instead
    this.sql.exec('DELETE FROM sessions WHERE user_id = ?', id);
    return { id };
  }
  deleteGuest(id) {
    if (!this.row('SELECT 1 AS x FROM users WHERE id = ? AND guest = 1', id)) return;
    for (const q of ['DELETE FROM sessions WHERE user_id = ?', 'DELETE FROM save_keys WHERE user_id = ?', 'DELETE FROM stats WHERE user_id = ?', 'DELETE FROM race_players WHERE user_id = ?',
      'DELETE FROM scores WHERE user_id = ?', 'DELETE FROM bounties WHERE poster = ?1 OR target = ?1', 'DELETE FROM reports WHERE reporter = ?1 OR target = ?1', 'DELETE FROM users WHERE id = ?']) this.sql.exec(q, id);
  }
  purgeGuests() {
    const old = this.sql.exec('SELECT id FROM users WHERE guest = 1 AND last_seen < ? LIMIT 200', Date.now() - GUEST_IDLE_HOURS * 3600000).toArray();
    for (const { id } of old) this.deleteGuest(id);
  }
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
    const now = Date.now(), r = this.row(`SELECT u.id, u.name, u.nick, u.last_seen, u.guest, ${IDENT} FROM sessions x JOIN users u ON u.id = x.user_id LEFT JOIN stats s ON s.user_id = u.id WHERE x.token = ? AND x.expires > ?`, tokenHash, now);
    if (!r) return null;
    if (now - r.last_seen > 60000) this.sql.exec('UPDATE users SET last_seen = ? WHERE id = ?', now, r.id);
    return { id: r.id, name: r.name, guest: !!r.guest, nick: r.nick || null, flair: r.flair || null, cover: r.cover || null, league: r.league || null, title: r.title || null, motto: r.motto || null };
  }
  setNick(userId, nick) { this.sql.exec('UPDATE users SET nick = ? WHERE id = ?', nick, userId); }
  // ---- bounties. The coins move in the players' saves; the server keeps who posted, who beat it and when.
  postBounty(userId, spec, beat, reward, targetName) {
    const now = Date.now();
    if (this.row('SELECT COUNT(*) AS n FROM bounties WHERE poster = ? AND claimed_by IS NULL AND refunded = 0 AND expires > ?', userId, now).n >= 3) return { error: 'You have 3 bounties out already. Wait for one to be claimed or run out.' };
    let target = null;
    if (targetName) { const t = this.row('SELECT id FROM users WHERE name_lc = ?', targetName.toLowerCase()); if (!t || t.id === userId) return { error: 'No such player to challenge.' }; target = t.id; }
    this.sql.exec('INSERT INTO bounties (poster, target, spec, beat, reward, created, expires) VALUES (?, ?, ?, ?, ?, ?, ?)', userId, target, spec, beat, reward, now, now + BOUNTY_DAYS * 864e5);
    return { ok: true, id: this.row('SELECT last_insert_rowid() AS id').id };
  }
  bounties(userId) {
    const now = Date.now(), who = p => `${p}.name AS ${p}_name, ${p}.nick AS ${p}_nick`;
    const q = where => this.sql.exec(`SELECT b.*, ${who('up')}, ${who('ut')}, ${who('uc')}, sp.flair AS up_flair FROM bounties b JOIN users up ON up.id = b.poster LEFT JOIN stats sp ON sp.user_id = b.poster
      LEFT JOIN users ut ON ut.id = b.target LEFT JOIN users uc ON uc.id = b.claimed_by WHERE ${where} ORDER BY b.reward DESC, b.id DESC LIMIT 60`, userId, now).toArray()
      .map(b => ({ id: b.id, spec: JSON.parse(b.spec), beat: b.beat, reward: b.reward, created: b.created, expires: b.expires, refunded: !!b.refunded, claimTotal: b.claim_total, claimedAt: b.claimed_at,
        poster: { name: b.up_name, nick: b.up_nick, flair: b.up_flair }, target: b.ut_name ? { name: b.ut_name, nick: b.ut_nick } : null, claimer: b.uc_name ? { name: b.uc_name, nick: b.uc_nick } : null }));
    return { open: q('b.poster != ?1 AND b.claimed_by IS NULL AND b.refunded = 0 AND b.expires > ?2 AND (b.target IS NULL OR b.target = ?1)'),
      mine: q('b.poster = ?1 AND b.created > ?2 - 30 * 864e5') };
  }
  claimBounty(userId, id, total) {
    const b = this.row('SELECT * FROM bounties WHERE id = ?', id), now = Date.now();
    if (!b || b.refunded || b.expires < now) return { status: 404, error: 'That bounty has run out.' };
    if (b.claimed_by) return { status: 409, error: 'Someone beat it first.' };
    if (b.poster === userId) return { error: 'You can\'t claim your own bounty.' };
    if (b.target && b.target !== userId) return { status: 403, error: 'That bounty is for someone else.' };
    if (total <= b.beat) return { ok: false, beat: b.beat };
    this.sql.exec('UPDATE bounties SET claimed_by = ?, claimed_at = ?, claim_total = ? WHERE id = ? AND claimed_by IS NULL', userId, now, total, id);
    return { ok: true, reward: b.reward };
  }
  // an unclaimed bounty that ran out goes back to whoever posted it, once
  refundBounty(userId, id) {
    const b = this.row('SELECT * FROM bounties WHERE id = ?', id);
    if (!b || b.poster !== userId || b.claimed_by || b.refunded || b.expires > Date.now()) return { error: 'Nothing to refund.' };
    this.sql.exec('UPDATE bounties SET refunded = 1 WHERE id = ?', id);
    return { ok: true, reward: b.reward };
  }
  reportNick(reporterId, name) {
    const t = this.row('SELECT id, nick FROM users WHERE name_lc = ?', name.toLowerCase()), now = Date.now();
    if (!t) return { status: 404, error: 'No such player' };
    if (t.id === reporterId) return { error: 'That is your own nickname.' };
    if (!t.nick) return { error: 'That player has no nickname to report.' };
    if (this.row('SELECT COUNT(*) AS n FROM reports WHERE reporter = ? AND at > ?', reporterId, now - 864e5).n >= 20) return { status: 429, error: 'You have reported a lot today. Try again tomorrow.' };
    this.sql.exec('INSERT OR IGNORE INTO reports (target, reporter, nick, at) VALUES (?, ?, ?, ?)', t.id, reporterId, t.nick, now);
    // reports count against the nickname they were made about, so a new nickname starts clean
    const n = this.row('SELECT COUNT(*) AS n FROM reports WHERE target = ? AND nick = ?', t.id, t.nick).n;
    if (n >= 3) { this.sql.exec('UPDATE users SET nick = NULL WHERE id = ?', t.id); this.sql.exec('DELETE FROM reports WHERE target = ?', t.id); return { ok: true, removed: true }; }
    return { ok: true, removed: false };
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
      // coins allow for the biggest single payouts: a won race pot (8 × 500), a bounty (2,000) or a doubled wager (2,000)
      if (stats.flags > cur.flags + 60 + 2 * secs || stats.coins > cur.coins + 6000 + 15 * secs)
        return { status: 422, error: 'That progress jumped too fast to be real, so it was not saved. Reload to go back to your last save.' };
    }
    for (const [k, v] of Object.entries(changes)) this.sql.exec('INSERT INTO save_keys (user_id, k, v) VALUES (?, ?, ?) ON CONFLICT (user_id, k) DO UPDATE SET v = excluded.v', userId, k, v);
    if (stats) {
      this.sql.exec('UPDATE stats SET rev = rev + 1, updated = ?, flags = ?, coins = ?, trips = ?, km = ?, rating = ?, league = ?, places = ?, countries = ? WHERE user_id = ?',
        now, stats.flags, stats.coins, stats.trips, stats.km, stats.rating, stats.league, stats.places, stats.countries, userId);
      if (stats.known) { this.sql.exec('UPDATE stats SET known = ? WHERE user_id = ?', stats.known, userId); this.crownCache = null; }
      this.sql.exec('UPDATE stats SET flair = ?, cover = ?, title = ?, motto = ? WHERE user_id = ?', stats.flair, stats.cover, stats.title, stats.motto, userId);
      if (stats.cont) this.sql.exec('UPDATE stats SET cont = ? WHERE user_id = ?', stats.cont, userId);
    }
    else this.sql.exec('UPDATE stats SET rev = rev + 1 WHERE user_id = ?', userId);
    return { rev: cur.rev + 1 };
  }

  // Crowns: for each country, the player who knows the most of its places holds it (10 at least, so an early
  // visit isn't a crown). Ties go to whoever got there first, which here is the older account.
  crowns() {
    if (this.crownCache && Date.now() - this.crownCache.at < 30000) return this.crownCache.data;
    const best = {};
    for (const r of this.sql.exec('SELECT u.id, u.name, u.nick, s.flair, s.known FROM users u JOIN stats s ON s.user_id = u.id WHERE s.known IS NOT NULL AND u.guest = 0 ORDER BY u.id')) {
      let k; try { k = JSON.parse(r.known); } catch { continue; }
      for (const [cc, n] of Object.entries(k)) {
        if (n < 10) continue;
        const b = best[cc];
        if (!b) best[cc] = { name: r.name, nick: r.nick || null, flair: r.flair || null, n, next: 0 };
        else if (n > b.n) best[cc] = { name: r.name, nick: r.nick || null, flair: r.flair || null, n, next: b.n };
        else if (n > b.next) b.next = n;
      }
    }
    this.crownCache = { at: Date.now(), data: best };
    return best;
  }
  postScore(userId, kind, period, r) {
    this.sql.exec('INSERT OR IGNORE INTO scores (kind, period, user_id, total, km, stops, squares, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', kind, period, userId, r.total, r.km, r.stops, r.squares, Date.now());
    return this.board(kind, period, userId);
  }
  board(kind, period, userId) {
    const rows = this.sql.exec(`SELECT u.name, u.nick, st.flair, st.cover, st.league, st.title, s.total, s.km, s.stops, s.squares, s.user_id = ? AS me FROM scores s JOIN users u ON u.id = s.user_id
      LEFT JOIN stats st ON st.user_id = u.id WHERE s.kind = ? AND s.period = ? ORDER BY s.total DESC, s.at ASC LIMIT 100`, userId, kind, period).toArray();
    const mine = this.row('SELECT total, at FROM scores WHERE kind = ? AND period = ? AND user_id = ?', kind, period, userId);
    const rank = mine ? this.row('SELECT COUNT(*) + 1 AS r FROM scores WHERE kind = ? AND period = ? AND (total > ? OR (total = ? AND at < ?))', kind, period, mine.total, mine.total, mine.at).r : null;
    const players = this.row('SELECT COUNT(*) AS n FROM scores WHERE kind = ? AND period = ?', kind, period).n;
    return { kind, period, rows: rows.map(x => ({ ...x, me: !!x.me })), rank, players, mine: mine ? mine.total : null };
  }
  // the top 200 in one category, plus where you and the players you follow stand in it
  leaderboard(by, also, userId) {
    const score = BOARD_BY[by], cols = `u.name, u.nick, ${IDENT}, s.flags, s.rating, s.trips, s.places, s.countries, s.km, u.last_seen AS seen,
        (SELECT COUNT(*) FROM race_players p WHERE p.user_id = u.id) AS races, ${WINS} AS wins, ${score} AS score`;
    // a continent board lists only players who know somewhere on it
    // guests play but aren't ranked: they'd crowd the board with names that vanish when their tab closes
    const floor = CONTINENTS.includes(by) || by === 'wins' ? `WHERE u.guest = 0 AND ${score} > 0` : 'WHERE u.guest = 0';
    const rows = this.sql.exec(`SELECT ${cols} FROM users u JOIN stats s ON s.user_id = u.id ${floor} ORDER BY score DESC, s.flags DESC, s.rating DESC, u.id ASC LIMIT 200`).toArray();
    const rankOf = n => this.row(`SELECT COUNT(*) + 1 AS r FROM users u JOIN stats s ON s.user_id = u.id WHERE u.guest = 0 AND ${score} > ?`, n).r;
    const me = this.row(`SELECT ${cols} FROM users u JOIN stats s ON s.user_id = u.id WHERE u.id = ?`, userId);
    const pinned = also.length ? this.sql.exec(`SELECT ${cols} FROM users u JOIN stats s ON s.user_id = u.id WHERE u.name_lc IN (${also.map(() => '?').join(',')})`, ...also.map(n => n.toLowerCase())).toArray() : [];
    return { by, rows, me: me && { ...me, rank: rankOf(me.score) }, pinned: pinned.map(x => ({ ...x, rank: rankOf(x.score) })), players: this.row('SELECT COUNT(*) AS n FROM users WHERE guest = 0').n };
  }
  profile(name, byId) {
    const u = this.row(`SELECT u.id, u.name, u.nick, u.created, u.last_seen AS seen, s.flags, s.rating, s.league, s.trips, s.places, s.countries, s.km, s.flair, s.cover, s.title, s.motto FROM users u JOIN stats s ON s.user_id = u.id WHERE ${byId ? 'u.id = ?' : 'u.name_lc = ?'}`, byId || name.toLowerCase());
    if (!u) return null;
    const rank = this.row('SELECT COUNT(*) + 1 AS rank FROM stats s JOIN users u ON u.id = s.user_id WHERE u.guest = 0 AND s.flags > ?', u.flags).rank;
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
  preset: ['beginner', 'standard', 'expert', 'purist'], show: ['live', 'hidden'], stake: [0, 50, 100, 250, 500],
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
const DEFAULT_SETTINGS = { mode: 'time', limit: 15, vehicle: 'car', regions: ['EU'], length: 'short', preset: 'standard', show: 'live', stake: 0 };

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
    const uid = +req.headers.get('x-uid'), name = req.headers.get('x-name') || '?', guest = req.headers.get('x-guest') === '1';
    let nick = null; try { nick = decodeURIComponent(req.headers.get('x-nick') || '') || null; } catch {}
    let ident = {}; try { ident = JSON.parse(decodeURIComponent(req.headers.get('x-ident') || '{}')) || {}; } catch {}
    const look = cleanLook(ident);
    if (!this.st) return new Response('No lobby with that code', { status: 404 });
    const st = this.st;
    if (!st.players[uid] && st.order.length >= MAX_PLAYERS) return new Response('That lobby is full', { status: 403 });
    if (!st.players[uid]) { st.players[uid] = { id: uid, name, guest, nick, ...look, ready: false }; st.order.push(uid); }
    else Object.assign(st.players[uid], { name, guest, nick, ...look });
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
      race = { n: r.n, trip: r.trip, mode: r.mode, stake: r.stake || 0, pot: r.pot || 0, startAt: r.startAt, endAt: r.endAt, entrants: r.entrants, names: r.names || {}, progress };
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
      // pay: whether this player has the coins for the entry fee
      case 'ready': me.ready = !!msg.on; me.canPay = !!msg.pay; break;
      // your flag, cover, league or title changed since you joined
      case 'ident': Object.assign(me, cleanLook(msg)); break;
      case 'start': {
        if (!isHost || st.phase === 'racing') return;
        const trip = msg.trip, size = JSON.stringify(trip || null).length;
        if (!trip || size > 40000 || !Number.isInteger(trip.start) || !Number.isInteger(trip.dest)) return this.sendError(ws, 'The trip could not be sent.');
        // with an entry fee, only players who said they're ready and can pay are in; the host pays by starting
        const online = this.online(), stake = st.settings.stake || 0;
        const entrants = st.order.filter(id => online.has(id) && (!stake || (id === uid ? !!msg.pay : st.players[id].ready && st.players[id].canPay)));
        if (!entrants.length) return this.sendError(ws, 'You need the coins for the entry fee to start this race.');
        const startAt = now + 6000, limit = st.settings.limit;
        st.raceN = (st.raceN || 0) + 1;
        st.race = { n: st.raceN, trip, mode: st.settings.mode, stake, pot: stake * entrants.length, startAt, endAt: limit ? startAt + limit * 60000 : null, entrants, names: Object.fromEntries(entrants.map(id => [id, st.players[id].name])),
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
