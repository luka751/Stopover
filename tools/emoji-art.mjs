// Emoji themes for the web build: packs each theme in assets/icons8/themes (Icons8 art, gitignored, made by
// tools/icons8-themes.py) into one sprite sheet, web/public/emoji/<set>.<hash>.webp, and returns what the game needs
// to draw from it (window.EMOJI_ART). Every sheet has the same layout, so a cell index means the same emoji in all
// of them; a cell a theme has no drawing for stays empty and the game shows the standard emoji there.
// Without the art on disk (a fresh clone, CI) this returns no sets and the shop simply doesn't offer any.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const ART = 'assets/icons8/themes', CELL = 64, COLS = 12;
// symbols that sit inside running text (★★★☆ ratings, the ☰ menu mark, the ✦ holo mark) keep their font glyph
const TEXT_ONLY = new Set(['★', '☰', '✦']);

export async function buildEmojiArt(out, sets) {
  const concepts = JSON.parse(fs.readFileSync('tools/icons8-theme-concepts.json', 'utf8'));
  const list = Object.keys(concepts).filter(e => !e.startsWith('_') && !TEXT_ONLY.has(e));
  const rows = Math.ceil(list.length / COLS), art = { list, cols: COLS, rows, sets: {} };
  fs.mkdirSync(out + '/emoji', { recursive: true });
  for (const id of Object.keys(sets)) {
    const meta = `${ART}/${id}/theme.json`;
    if (!fs.existsSync(meta)) continue;
    const theme = JSON.parse(fs.readFileSync(meta, 'utf8')), comps = [], missing = [];
    for (const [i, e] of list.entries()) {
      const ic = theme.icons[e];
      if (!ic) { missing.push(i); continue; }
      const input = await sharp(`${ART}/${id}/${ic.file}`).resize(CELL, CELL, { fit: 'contain', background: '#0000' }).toBuffer();
      comps.push({ input, left: (i % COLS) * CELL, top: Math.floor(i / COLS) * CELL });
    }
    const sheet = await sharp({ create: { width: COLS * CELL, height: rows * CELL, channels: 4, background: '#0000' } })
      .composite(comps).webp({ quality: 90, alphaQuality: 100 }).toBuffer();
    const file = `emoji/${id}.${createHash('sha256').update(sheet).digest('hex').slice(0, 10)}.webp`;
    fs.writeFileSync(`${out}/${file}`, sheet);
    art.sets[id] = { file, missing };
  }
  return art;
}
