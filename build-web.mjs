// Builds the website into web/public: the game page with log-in and online play, plus the data files it loads.
// The single-file artifact (build-page.mjs) is unchanged by this.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
const part = f => fs.readFileSync('src2/' + f, 'utf8');
const out = 'web/public';
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const js = ['core.js', 'extras.js', 'trip.js', 'isles.js', 'map.js', 'ui.js', 'passport.js', 'blind.js', 'flags.js', 'study.js', 'juice.js', 'social.js', 'garage.js', 'sinks.js', 'online.js'].map(part).join('\n');
// the gazetteer is its own file on the website, so the log-in screen doesn't wait for 7 MB and browsers can cache it
const inlineGeo = "const b64 = $('geo').textContent.trim(), bin = atob(b64)";
if (!js.includes(inlineGeo)) throw new Error('loadData changed: update build-web.mjs');
const game = js.replace(inlineGeo, "const b64 = (await (await fetch('geo.txt')).text()).trim(), bin = atob(b64)");
const names = fs.readFileSync('web/src/names.js', 'utf8').replace(/^export /gm, '');

// the commit a build came from, so an error in Sentry says which version of the game it happened in
let release = 'dev'; try { release = execSync('git rev-parse --short HEAD').toString().trim() + (execSync('git status --porcelain src2 web/src').toString().trim() ? '-dirty' : ''); } catch {}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<script>
// one address for the game: static pages are served before the Worker runs, so www is sent to the bare domain here
if (location.hostname.startsWith('www.')) location.replace('https://' + location.hostname.slice(4) + location.pathname + location.search + location.hash);
</script>
<link rel="canonical" href="https://playstopover.me/">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="Name places, cross the map, collect flags and race your friends.">
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🏁</text></svg>">
<link rel="preload" href="geo.txt" as="fetch" crossorigin="anonymous">
<!-- Sentry (GitHub Student Pack): errors from players' browsers -->
<script>
window.sentryOnLoad = () => {
  // reset and confirmation links, and guest keys, never reach Sentry
  const scrub = u => typeof u === 'string' ? u.replace(/([?&](?:gt|reset|verify|token)=)[^&#]*/gi, '$1[removed]') : u;
  Sentry.init({ release: 'stopover@${release}', environment: location.hostname === 'playstopover.me' ? 'production' : 'development', sendDefaultPii: false,
    // page-load timing for 1 visit in 20; a replay only of sessions that hit an error (inputs and text are masked)
    tracesSampleRate: 0.05, replaysSessionSampleRate: 0, replaysOnErrorSampleRate: 1,
    // noise from browser extensions, not from the game
    denyUrls: ['chrome-extension://', 'moz-extension://', 'safari-web-extension://', 'extensions/'],
    beforeSend(e) { if (e.request) e.request.url = scrub(e.request.url); return e; },
    beforeBreadcrumb(b) { if (b.data) for (const k of ['url', 'to', 'from']) if (b.data[k]) b.data[k] = scrub(b.data[k]); return b; } });
};
</script>
<script src="https://js-de.sentry-cdn.com/b9ace36eee047a9fad47f77414a7f8bc.min.js" crossorigin="anonymous"></script>
<!-- SimpleAnalytics (GitHub Student Pack): page views and a few game events, no cookies. Not on password-reset pages. -->
<script>
if (!/[?&]reset=/.test(location.search)) { const s = document.createElement('script'); s.async = true; s.src = 'https://scripts.simpleanalyticscdn.com/latest.js'; document.head.appendChild(s); }
</script>
${part('head.html').replace('</style>', part('online.css') + '\n</style>')}
</head>
<body>
${part('body.html')}
<script>
window.__stopoverStart = () => {
'use strict';
${game}
};
</script>
<script>
(() => {
'use strict';
${names}
${part('auth.js')}
})();
</script>
</body>
</html>
`;
fs.writeFileSync(out + '/index.html', html);

// Security headers for every file (Cloudflare reads web/public/_headers). The Content-Security-Policy lists the
// exact inline scripts by hash and the few outside hosts the page uses. It is report-only for now: violations go
// to Sentry without blocking anything, and once it's quiet the header can be switched to enforcing.
const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
const sentryReport = 'https://o4512164040146944.ingest.de.sentry.io/api/4512164047814736/security/?sentry_key=b9ace36eee047a9fad47f77414a7f8bc';
const csp = [
  "default-src 'self'",
  `script-src 'self' ${hashes.join(' ')} https://js-de.sentry-cdn.com https://browser.sentry-cdn.com https://scripts.simpleanalyticscdn.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://queue.simpleanalyticscdn.com",
  "connect-src 'self' https://*.ingest.de.sentry.io https://*.configcat.com https://queue.simpleanalyticscdn.com",
  "worker-src 'self' blob:",
  "object-src 'none'", "base-uri 'self'", "form-action 'self'",
  `report-uri ${sentryReport}&sentry_release=stopover%40${release}`,
].join('; ');
fs.writeFileSync(out + '/_headers', `/*
  Content-Security-Policy-Report-Only: ${csp}
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
`);
fs.copyFileSync('data.b64', out + '/geo.txt');
for (const f of ['rail.json', 'covers.json']) fs.copyFileSync('dist/' + f, `${out}/${f}`);
for (const dir of ['flags', 'maps']) fs.cpSync('dist/' + dir, `${out}/${dir}`, { recursive: true });
console.log(`${out}/index.html ${(html.length / 1e3).toFixed(0)} kB, plus geo.txt, rail.json, covers.json, flags/, maps/`);
