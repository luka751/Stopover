# Stopover

A browser geography game, live at https://playstopover.me (also https://stopover.stopover-web.workers.dev).
Repo: https://github.com/luka751/Stopover (branch `main`; the local branch is `master`, push with `git push origin HEAD:main`).

## How it's built

- Two games on one engine. `build-web.mjs` makes two pages from `src2/`:
  - `web/public/index.html` at `/`: the **daily game**, the main product (a Wordle/GeoGuessr-style quick game).
    Daily trip, weekly trip, free play (length + continents), hard mode, stats, streaks and a share line. No account,
    server, coins, flags or boards; everything is saved in localStorage under `stopover-mini:`. Adds `src2/mini.js`,
    `mini.html`, `mini.css`; no `auth.js` or `online.js`.
  - `web/public/world.html` at `/world`: **Stopover World**, the full game (accounts, passport, shop, races, boards).
    Adds `online.js`, `online.css` and `auth.js`.
  - The game scripts share one closure. `MINI` (core.js) is true on the daily page; features the daily game lacks
    return early on it, and daily-game trips carry `S.mini` ('daily' | 'weekly' | 'free') and score without
    familiarity, perks or discovery, so everyone's daily is comparable. `src2/i18n.js` (languages) runs apart.
  - The daily game's daily trip is the same route as the full game's daily trip (same seed and route rules).
- `web/src/index.js`: the Cloudflare Worker. Durable Objects `Accounts` (SQLite: users, sessions, saves, boards,
  bounties, email tokens, rate limits) and `Lobby` (race lobbies over WebSocket). Config in `web/wrangler.jsonc`.
- `build-page.mjs` makes the older single-file build (`dist/stopover.html`); keep it working.
- Big data files are not in git: `data.b64` (the gazetteer), `dist/` (flags, maps, rail, covers), `cache/`.
- `web/static/`: icons, manifest and the link-preview card (`build-icons.mjs` draws them).

## Tuning: numbers, prices, names and colours

`src2/tune.json` holds every tunable value: scoring (stop sizes, repeat visits, short hops), hint costs, flight
prices, trip lengths, vehicles, difficulty rules, the whole shop (styles, markers, supplies, perks, themes, decks,
garage models, finishes, mottos), mastery, flag rarity, leagues, streaks, race stakes and bounties. The game reads it as
`TUNE` (the builds put `const TUNE = {...}` before the game scripts, see `tools/tune-file.mjs`); the Worker imports it
for race stakes, time limits, bounty sizes and slider tops. Tables that also hold code (garage drawings, study-deck
tests, cover-finish artwork) keep that code in their .js file and take their shop fields from tune.json via `tuned()`.

- For a value change, don't open the .js files: `node tools/tune.mjs find <word>`, `get <path>`, `set <path> <value>`
  (paths like `vehicles.car.tank`, `lengths.short.bonus`, `shop.styles.night.price`), `diff` for what changed.
- A new tunable goes into tune.json and is read as `TUNE.x`; the Studio shows new keys by themselves (under "Other"
  until `studio/guide.json` gives them a title and help text).
- Behaviour tied to a value (a perk's effect, what a supply does) is still code; descriptions that quote a number
  have to be kept in step (the Studio does this for numbers in the same row).

**Stopover Studio** (`node studio/server.mjs`, or the `studio` launch config → http://localhost:4180) is the owner's
editor for tune.json: sections with plain-English help, tables with colour pickers, add/duplicate/delete for lists
that allow it, undo, a change list against the last commit, the offline game running beside it (rebuilt on every load,
with test-save buttons for coins and a fresh player), and Publish (check → commit tune.json → build-web → deploy →
optional push). Its help text lives in `studio/guide.json`.

**Layout tweaks** (Studio → Move & resize, `studio/layout.js`): the owner clicks an element in the preview, drags it
(→ `translate`), pulls its corner (→ `width`/`height`) or sets scale, order, text size and weight, colours, rounding,
spacing, opacity or hides it, for one element or all like it, on every screen / phones (≤760 px) / wider screens.
Saved as CSS rules in `tune.json → layout.{all,phone,desktop}` (`{ selector: { property: value } }`); `core.js`
(`layoutCss`) injects them as `<style id="tune-layout">` with `!important`, so they win over the game's CSS and inline
styles. When renaming an id or class in body.html or the game's HTML, check `layout` for selectors that use it.

## Where things are in src2/

- `core.js`: utilities, rules (vehicles, stop tiers, familiarity), difficulty options, geometry, gazetteer loading,
  the profile (coins, saves)
- `extras.js`: discovery, supplies, perks, cosmetics (signs, trails, arrival effects), interface themes
- `trip.js`: legs and scoring (`travel()`), route finding, trip state, daily/weekly trips
- `ui.js`: trip console, dialogs (new trip, settings, shop), quick menu, night mode, presets, announcements
- `map.js`: map renderer and trip map · `isles.js`: Far-Flung Isles voyages · `blind.js`: blind spots and flashcards
- `passport.js`: explorer rating, leagues, stamps, covers · `social.js`: expeditions feed, titles, showcase, compare
- `flags.js`: flag catalogue, rarity, wanted board, collecting, flag drop, albums
- `study.js`: achievements and stats, passport tab, Study (Seterra-style), boot
- `juice.js`: sounds, ticker, greeting, stop effects, nudges, holo flags, streak milestones, sharing
- `garage.js`: vehicle models, exhaust trails, the glide animation, cover finishes, mottos
- `sinks.js`: study decks, flight classes, wanted-board rerolls, high stakes
- `online.js` (website only): race lobbies, leaderboards, crowns, profiles, bounties
- `auth.js` (website only, own closure): sign-in, guests, cloud saves, ConfigCat · `i18n.js`: languages

## Commands

- `node check.mjs`: every script parses (GitHub Actions runs this plus a Worker dry-run on each push)
- `node build-web.mjs`, then `npm --prefix web run deploy` to put it live (deploys can time out; just retry)
- Local server: the `stopover-web` launch config (wrangler dev on :8787, `MAIL_DEV=1` prints emails instead of sending)
- `node web/test/email-flow.mjs`: full email test against the live site with a Testmail inbox
  (use `BASE=https://stopover.stopover-web.workers.dev` from the owner's Mac: NextDNS there blocks playstopover.me)
- `node tools/poeditor.mjs push|pull`: sync translations with POEditor project 840986

Secrets live in `web/.dev.vars` (gitignored) and as Worker secrets (`wrangler secret put`), never in the repo.

## Services (GitHub Student Pack)

- Sentry: browser loader + `@sentry/cloudflare`; request bodies are never sent and tokens are scrubbed.
- SimpleAnalytics events: `trip_finished_*`, `trip_gave_up_*` (daily game: `*_mini_daily|weekly|free`), `lobby_joined`,
  `shared_*`, `opened_shared_*`.
- ConfigCat switches (read from the CDN JSON, no SDK): `announcement` (text banner), `emailAccounts` (off switch).
- Email through Resend (`RESEND_API_KEY` Worker secret) or Azure (`AZURE_EMAIL`). With neither set, email features
  are off in the server and hidden in the game.
- POEditor: en, ka, de, uk, ru. Honeybadger watches uptime. Testmail namespace `6jmd6`.

## Languages

`src2/i18n.js` translates text as it appears on the page from `src2/i18n/<lang>.json` (exact English lines, or
patterns with `{named}` gaps); country names come from `Intl.DisplayNames`. On localhost, `__i18n.missing` collects
untranslated lines. `src2/i18n/catalog.json` lists lines still to translate.

## Rules the owner set

- Scout ahead's Go button reaches a place without scoring: no points, flags, stamps, visits or crowns. Typing a
  scouted name still scores normally; don't mention that in the game.
- Ask before changing DNS, billing or anything paid. Deploying after changes is fine.
- The daily game is the main drive of Stopover and should stay simple: one screen, no account, no shop. The full game
  lives at /world and should not be neglected. Email links (reset, verify) go to /world.
