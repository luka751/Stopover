// src2/tune.json holds the game's numbers, prices, names and colours: everything Stopover Studio and
// `node tools/tune.mjs` edit. The game reads it as TUNE (the builds put `const TUNE = {...}` in front of the game
// scripts) and the Worker imports it for the few lists the server checks (race stakes, bounty sizes, slider tops).
import fs from 'node:fs';

export const TUNE_PATH = new URL('../src2/tune.json', import.meta.url);
export const readTune = () => JSON.parse(fs.readFileSync(TUNE_PATH, 'utf8'));
export const writeTune = t => fs.writeFileSync(TUNE_PATH, formatTune(t));
// what the builds put in front of the game scripts
export const tunePrelude = () => `const TUNE = ${JSON.stringify(readTune())};\n`;

// JSON laid out for reading and for small git diffs: anything that fits on a line stays on one line
export function formatTune(v) {
  const line = x => x === null || typeof x !== 'object' ? JSON.stringify(x)
    : Array.isArray(x) ? `[${x.map(line).join(', ')}]`
    : Object.keys(x).length ? `{ ${Object.entries(x).map(([k, y]) => `${JSON.stringify(k)}: ${line(y)}`).join(', ')} }` : '{}';
  const out = (x, pad) => {
    const flat = line(x);
    if (x === null || typeof x !== 'object' || pad.length + flat.length <= 170) return flat;
    const inner = pad + '  ';
    if (Array.isArray(x)) return `[\n${x.map(y => inner + out(y, inner)).join(',\n')}\n${pad}]`;
    return `{\n${Object.entries(x).map(([k, y]) => `${inner}${JSON.stringify(k)}: ${out(y, inner)}`).join(',\n')}\n${pad}}`;
  };
  return out(v, '') + '\n';
}
