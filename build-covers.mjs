// dist/covers.json: for each country, the passport cover colour (measured from a photo of its passport, snapped to
// the handful of colours passports actually come in) and its coat of arms rendered as a gold emblem.
import fs from 'node:fs'; import { spawnSync } from 'node:child_process';
const data = JSON.parse(fs.readFileSync('cache/covers/data.json', 'utf8'));
const OVERRIDES = JSON.parse(fs.existsSync('cover-overrides.json') ? fs.readFileSync('cover-overrides.json', 'utf8') : '{}');
const PALETTE = { burgundy: [94, 26, 42], red: [150, 30, 38], navy: [22, 34, 64], blue: [31, 78, 140], green: [30, 77, 43], black: [26, 26, 28], brown: [74, 47, 34] };
const snap = rgb => { let best = null, bd = Infinity; for (const [name, p] of Object.entries(PALETTE)) { const d = (rgb[0] - p[0]) ** 2 * 0.3 + (rgb[1] - p[1]) ** 2 * 0.59 + (rgb[2] - p[2]) ** 2 * 0.11 + ((Math.max(...rgb) - Math.min(...rgb)) - (Math.max(...p) - Math.min(...p))) ** 2 * 0.2; if (d < bd) { bd = d; best = name; } } return best; };
const out = {}, report = [];
for (const [iso, r] of Object.entries(data)) {
  // measured browns and blacks are nearly always a photo of a data page or an old design, so only trust them when checked
  const measured = r.rgb ? snap(r.rgb) : null;
  const colour = OVERRIDES[iso] || (measured && measured !== 'brown' && measured !== 'black' ? measured : null);
  let arms = null;
  if (r.armsFile && fs.existsSync(r.armsFile)) {
    const outFile = r.armsFile + '.gold.webp';
    if (!fs.existsSync(outFile)) spawnSync(process.execPath, ['render-arms.mjs', r.armsFile, outFile], { timeout: 60000 });
    if (fs.existsSync(outFile)) arms = fs.readFileSync(outFile).toString('base64'); else console.log('skipped arms', iso);
  }
  if (colour || arms) out[iso] = { colour, arms, name: r.name, measured: !OVERRIDES[iso] && !!r.rgb };
  report.push(`${iso} ${colour || '-'}${OVERRIDES[iso] ? ' (checked)' : ''} ${r.rgb ? 'rgb(' + r.rgb + ')' : ''} ${arms ? 'arms' : 'no-arms'} ${r.passportImage || ''}`);
}
fs.writeFileSync('dist/covers.json', JSON.stringify({ palette: Object.fromEntries(Object.entries(PALETTE).map(([k, v]) => [k, `rgb(${v})`])), countries: out }));
fs.writeFileSync('cache/covers/report.txt', report.join('\n'));
console.log('covers', Object.keys(out).length, 'with colour', Object.values(out).filter(c => c.colour).length, 'with arms', Object.values(out).filter(c => c.arms).length, (JSON.stringify(out).length / 1e6).toFixed(2) + 'MB');
