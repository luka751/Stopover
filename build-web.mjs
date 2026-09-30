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
// The gazetteer is its own file on the website: the raw gzip bytes rather than the base64 text the single-file
// build embeds (a quarter smaller), named after its contents so browsers keep it for a year and a changed
// gazetteer gets a new name.
const geoBytes = Buffer.from(fs.readFileSync('data.b64', 'utf8').trim(), 'base64');
const geoFile = `geo.${createHash('sha256').update(geoBytes).digest('hex').slice(0, 10)}.bin`;
const inlineGeo = /const b64 = \$\('geo'\)\.textContent\.trim\(\), bin = atob\(b64\), bytes = new Uint8Array\(bin\.length\);\n\s*for \(let i = 0; i < bin\.length; i\+\+\) bytes\[i\] = bin\.charCodeAt\(i\);/;
if (!inlineGeo.test(js)) throw new Error('loadData changed: update build-web.mjs');
const game = js.replace(inlineGeo, `const bytes = new Uint8Array(await (await fetch('${geoFile}')).arrayBuffer());`);
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
<script>
window.__I18N_DICTS = ${JSON.stringify(Object.fromEntries(['ka', 'de', 'uk', 'ru'].map(l => [l, JSON.parse(fs.readFileSync(`src2/i18n/${l}.json`, 'utf8'))])))};
${part('i18n.js')}
</script>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="Name places, cross the map, collect flags and race your friends.">
<!-- installable on a phone's home screen, and a proper card when a link is pasted into a chat (icons: build-icons.mjs) -->
<link rel="manifest" href="manifest.webmanifest">
<meta name="theme-color" content="#0B6B3A">
<link rel="icon" type="image/png" href="icon-192.png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Stopover">
<meta property="og:title" content="Stopover: name places, cross the map, race your friends">
<meta property="og:description" content="A free geography game in your browser. Plan a route across the world one town at a time, collect flags and race your friends.">
<meta property="og:url" content="https://playstopover.me/">
<meta property="og:image" content="https://playstopover.me/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Stopover: a green road sign reading Name places. Cross the map. Race your friends.">
<meta name="twitter:card" content="summary_large_image">
<link rel="preload" href="${geoFile}" as="fetch" crossorigin="anonymous">
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

# the gazetteer's name changes with its contents, so it never needs checking again
/geo.*.bin
  Cache-Control: public, max-age=31536000, immutable

# flags, maps and covers change rarely: reuse for a day, refresh in the background after that
/flags/*
  Cache-Control: public, max-age=86400, stale-while-revalidate=604800
/maps/*
  Cache-Control: public, max-age=86400, stale-while-revalidate=604800
/covers.json
  Cache-Control: public, max-age=86400, stale-while-revalidate=604800
/rail.json
  Cache-Control: public, max-age=86400, stale-while-revalidate=604800
`);
fs.writeFileSync(`${out}/${geoFile}`, geoBytes);
for (const f of ['rail.json', 'covers.json']) fs.copyFileSync('dist/' + f, `${out}/${f}`);
for (const dir of ['flags', 'maps']) fs.cpSync('dist/' + dir, `${out}/${dir}`, { recursive: true });
fs.cpSync('web/static', out, { recursive: true });
console.log(`${out}/index.html ${(html.length / 1e3).toFixed(0)} kB, plus ${geoFile} (${(geoBytes.length / 1e6).toFixed(1)} MB), rail.json, covers.json, flags/, maps/`);
