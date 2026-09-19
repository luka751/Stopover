// dist/covers.json: for each country, the passport cover colour (measured from a photo of its passport, snapped to
// the handful of colours passports actually come in) and its coat of arms in its own colours.
import fs from 'node:fs'; import { spawnSync } from 'node:child_process';
const data = JSON.parse(fs.readFileSync('cache/covers/data.json', 'utf8'));
const OVERRIDES = JSON.parse(fs.existsSync('cover-overrides.json') ? fs.readFileSync('cover-overrides.json', 'utf8') : '{}');
const PALETTE = { burgundy: [94, 26, 42], red: [150, 30, 38], navy: [22, 34, 64], blue: [31, 78, 140], green: [30, 77, 43], black: [26, 26, 28], brown: [74, 47, 34] };
const snap = rgb => { let best = null, bd = Infinity; for (const [name, p] of Object.entries(PALETTE)) { const d = (rgb[0] - p[0]) ** 2 * 0.3 + (rgb[1] - p[1]) ** 2 * 0.59 + (rgb[2] - p[2]) ** 2 * 0.11 + ((Math.max(...rgb) - Math.min(...rgb)) - (Math.max(...p) - Math.min(...p))) ** 2 * 0.2; if (d < bd) { bd = d; best = name; } } return best; };
// passport-colors.csv: the measured cover colour of about 200 passports (0–1 RGB, by English country name). These
// win over the snapped photo measurements and the checked overrides. The photos behind them are sometimes lit too
// brightly (Tuvalu reads pale cyan, Italy pink), and real covers are dark cloth, so each keeps its hue and
// saturation but its lightness is capped.
const ALIAS = { 'congo (dem. rep.)': 'CD', 'congo': 'CG', "cote d'ivoire (ivory coast)": 'CI', 'czech republic': 'CZ', 'macedonia': 'MK', 'myanmar [burma]': 'MM',
  'palestinian territories': 'PS', 'russian federation': 'RU', 'viet nam': 'VN', 'united states of america': 'US', 'st. vincent and the grenadines': 'VC', 'cape verde': 'CV',
  'vatican city': 'VA', 'north korea': 'KP', 'south korea': 'KR', 'kosovo': 'XK', 'turkey': 'TR', 'eswatini': 'SZ', 'timor-leste': 'TL', 'micronesia': 'FM', 'bahamas': 'BS', 'gambia': 'GM', 'laos': 'LA', 'hong kong': 'HK', 'macao': 'MO', 'netherlands': 'NL' };
const byName = new Map(fs.readFileSync('cache/countryInfo.txt', 'utf8').split('\n').filter(l => l && !l.startsWith('#')).map(l => l.split('\t')).map(c => [c[4].toLowerCase(), c[0]]));
function capLight([r, g, b], max = 0.34) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; if (l <= max) return [r, g, b];
  const d = mx - mn, sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)), h = d === 0 ? 0 : mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const c = (1 - Math.abs(2 * max - 1)) * sat, x = c * (1 - Math.abs(h % 2 - 1)), m = max - c / 2, [a, bb, cc] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  return [a + m, bb + m, cc + m];
}
const HEX = {}, unmatched = [];
for (const line of fs.readFileSync('passport-colors.csv', 'utf8').trim().split('\n').slice(1)) {
  const m = /^(.*),([\d.]+),([\d.]+),([\d.]+)$/.exec(line.trim()); if (!m) continue;
  const iso = ALIAS[m[1].toLowerCase()] || byName.get(m[1].toLowerCase()); if (!iso) { unmatched.push(m[1]); continue; }
  HEX[iso] = '#' + capLight([+m[2], +m[3], +m[4]]).map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
}
if (unmatched.length) console.log('passport-colors.csv names with no country:', unmatched.join(', '));
const out = {}, report = [];
for (const [iso, r] of Object.entries(data)) {
  // measured browns and blacks are nearly always a photo of a data page or an old design, so only trust them when checked
  const measured = r.rgb ? snap(r.rgb) : null;
  const colour = OVERRIDES[iso] || (measured && measured !== 'brown' && measured !== 'black' ? measured : null);
  let arms = null;
  if (r.armsFile && fs.existsSync(r.armsFile)) {
    const outFile = r.armsFile + '.colour.webp';
    if (!fs.existsSync(outFile)) spawnSync(process.execPath, ['render-arms.mjs', r.armsFile, outFile], { timeout: 60000 });
    if (fs.existsSync(outFile)) arms = fs.readFileSync(outFile).toString('base64'); else console.log('skipped arms', iso);
  }
  if (colour || arms || HEX[iso]) out[iso] = { colour, hex: HEX[iso] || null, arms, name: r.name, measured: !OVERRIDES[iso] && !!r.rgb };
  report.push(`${iso} ${colour || '-'}${OVERRIDES[iso] ? ' (checked)' : ''} ${r.rgb ? 'rgb(' + r.rgb + ')' : ''} ${arms ? 'arms' : 'no-arms'} ${r.passportImage || ''}`);
}
fs.writeFileSync('dist/covers.json', JSON.stringify({ palette: Object.fromEntries(Object.entries(PALETTE).map(([k, v]) => [k, `rgb(${v})`])), countries: out }));
fs.writeFileSync('cache/covers/report.txt', report.join('\n'));
console.log('covers', Object.keys(out).length, 'with colour', Object.values(out).filter(c => c.colour || c.hex).length, 'from the colour list', Object.values(out).filter(c => c.hex).length, 'with arms', Object.values(out).filter(c => c.arms).length, (JSON.stringify(out).length / 1e6).toFixed(2) + 'MB');
