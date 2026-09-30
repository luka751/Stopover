# Stopover

A browser geography game, live at https://playstopover.me (also https://stopover.stopover-web.workers.dev).
Repo: https://github.com/luka751/Stopover (branch `main`; the local branch is `master`, push with `git push origin HEAD:main`).

## How it's built

- `src2/*.js`, `src2/head.html`, `src2/body.html`, `src2/online.css`: the game. `build-web.mjs` joins them into one
  page, `web/public/index.html`. The game scripts share one closure; `src2/auth.js` (log-in, guests, cloud save,
  ConfigCat switches) and `src2/i18n.js` (languages) run in their own.
- `web/src/index.js`: the Cloudflare Worker. Durable Objects `Accounts` (SQLite: users, sessions, saves, boards,
  bounties, email tokens, rate limits) and `Lobby` (race lobbies over WebSocket). Config in `web/wrangler.jsonc`.
- `build-page.mjs` makes the older single-file build (`dist/stopover.html`); keep it working.
- Big data files are not in git: `data.b64` (the gazetteer), `dist/` (flags, maps, rail, covers), `cache/`.
- `web/static/`: icons, manifest and the link-preview card (`build-icons.mjs` draws them).

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
- SimpleAnalytics events: `trip_finished_*`, `trip_gave_up_*`, `lobby_joined`, `shared_*`, `opened_shared_*`.
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
