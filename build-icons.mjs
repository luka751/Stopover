// Draws the app icons and the link-preview card into web/static (committed; build-web.mjs copies them into the
// site). Run again only when the look changes: node build-icons.mjs
// The look is the game's road sign: sign green, with the yellow route shield from the top bar.
import fs from 'node:fs';
import sharp from 'sharp';

const GREEN = '#0B6B3A', EDGE = '#E9F3EC', YELLOW = '#E9A21B', INK = '#1d1606';
const FONT = "'Avenir Next Condensed', 'Arial Narrow', sans-serif";
fs.mkdirSync('web/static', { recursive: true });

// the route shield: flat top, rounded bottom, like the E2 badge in the game's top bar
const shield = (x, y, w, h, text, size) => `
  <path d="M${x} ${y + 0.06 * h} q0 ${-0.06 * h} ${0.06 * h} ${-0.06 * h} h${w - 0.12 * h} q${0.06 * h} 0 ${0.06 * h} ${0.06 * h}
    v${0.52 * h} q0 ${0.42 * h} ${-w / 2} ${0.48 * h} q${-w / 2} ${-0.06 * h} ${-w / 2} ${-0.48 * h} z" fill="${YELLOW}"/>
  <text x="${x + w / 2}" y="${y + 0.62 * h}" font-family="${FONT}" font-weight="800" font-size="${size}" fill="${INK}" text-anchor="middle">${text}</text>`;

// square icon; `pad` shrinks the art so a maskable icon survives being cut to a circle
const icon = (px, pad = 0) => {
  const s = 512, inner = s * (1 - 2 * pad), o = s * pad;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${s} ${s}">
  <rect width="${s}" height="${s}" rx="${pad ? 0 : 96}" fill="${GREEN}"/>
  <rect x="${o + inner * 0.06}" y="${o + inner * 0.06}" width="${inner * 0.88}" height="${inner * 0.88}" rx="${inner * 0.14}" fill="none" stroke="${EDGE}" stroke-width="${inner * 0.035}"/>
  ${shield(o + inner * 0.24, o + inner * 0.2, inner * 0.52, inner * 0.6, 'S', inner * 0.42)}
</svg>`;
};

// the card a chat app shows when someone pastes a link to the game
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${GREEN}"/>
  <rect x="36" y="36" width="1128" height="558" rx="40" fill="none" stroke="${EDGE}" stroke-width="10"/>
  ${shield(96, 150, 190, 220, 'E2', 120)}
  <text x="338" y="296" font-family="${FONT}" font-weight="800" font-size="146" fill="#fff" letter-spacing="2">STOPOVER</text>
  <text x="344" y="372" font-family="${FONT}" font-weight="600" font-size="37" fill="${EDGE}">Name places. Cross the map. Race your friends.</text>
  <text x="96" y="530" font-family="${FONT}" font-weight="700" font-size="40" fill="${YELLOW}">playstopover.me</text>
  <text x="1104" y="530" font-family="${FONT}" font-weight="600" font-size="34" fill="${EDGE}" text-anchor="end">Free · in your browser</text>
</svg>`;

const out = [['icon-192.png', icon(192)], ['icon-512.png', icon(512)], ['icon-maskable-512.png', icon(512, 0.1)], ['apple-touch-icon.png', icon(180, 0.06)], ['og.png', og]];
for (const [name, svg] of out) await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile('web/static/' + name);
fs.writeFileSync('web/static/manifest.webmanifest', JSON.stringify({
  name: 'Stopover', short_name: 'Stopover', description: 'Name places, cross the map, collect flags and race your friends.',
  start_url: '/', scope: '/', display: 'standalone', background_color: '#EDF0EA', theme_color: GREEN,
  icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }],
}, null, 2) + '\n');
console.log('web/static:', fs.readdirSync('web/static').join(', '));
