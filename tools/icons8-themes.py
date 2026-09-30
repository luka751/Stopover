"""Emoji themes for the shop: every emoji the game shows (tools/icons8-theme-concepts.json), drawn in one Icons8 pack.

python3 tools/icons8-themes.py survey [pack ...]  coverage (every candidate by default) -> assets/icons8/themes/survey.json
python3 tools/icons8-themes.py build [pack ...]   download themes (the shop THEMES by default) -> assets/icons8/themes/<pack>/
A theme folder holds one 256 px PNG per emoji, named by code point (1f30d.png), plus theme.json with the Icons8 id
behind each file and the emoji the pack has no drawing for (the gaps to fill by hand or with generated art).
"""
import json, os, sys
from concurrent.futures import ThreadPoolExecutor
from icons8_lib import best, get

HERE = os.path.dirname(__file__)
ROOT = os.path.join(HERE, '..', 'assets', 'icons8', 'themes')
CONCEPTS = {k: v for k, v in json.load(open(os.path.join(HERE, 'icons8-theme-concepts.json'))).items() if not k.startswith('_')}
# colour and characterful packs worth selling; plain monochrome UI sets make dull themes
CANDIDATES = ['color', 'fluent', 'plumpy', 'emoji', 'dusk', 'cotton', 'plasticine', 'doodle', 'arcade', 'color-pixels', 'retro',
              'neon', 'stickers', 'mini-stickers', 'clr-gls', 'liquid-glass', 'liquid-glass-color', 'pulsar-color', 'pulsar-gradient',
              'papercut', 'stitch', 'matisse', 'water-color', 'bubbles', 'clouds', 'keek', 'parakeet', 'scribby', 'sci-fi',
              'deco-color', 'deco', 'stencil', 'avantgarde', 'softteal-color', 'softteal-gradient', 'nolan', 'office80', 'office40',
              'cool', 'badges', 'lollipop', 'pin', 'pieces', 'hands', 'skeuomorphism', 'glassmorphism', 'blueprint',
              'claude-hand-drawn', 'm_two_tone', 'ultraviolet', 'tiny-color', 'connect-color', 'isometric', 'flat_round',
              'comic', 'hatch', 'dotty', 'ink', 'quill', 'laces', 'carbon_copy', 'Dusk_Wired', 'pixels', 'led', 'hieroglyphs',
              'stamp', 'puffy-filled', 'parakeet-filled', 'ios_filled', 'glyph-neue']
# the ones good enough to sell, with their shop names (picked by eye from survey sheets, 2026-09-30)
THEMES = {
    'color': 'Classic', 'emoji': 'Emoji Deluxe', 'fluent': 'Fluent', 'clr-gls': 'Glass', 'doodle': 'Doodle',
    'stickers': 'Stickers', 'arcade': 'Cartoon', 'plasticine': 'Plasticine', 'color-pixels': 'Pixel Art',
    'dusk': 'Cute', 'keek': 'Kawaii', 'papercut': 'Papercut', 'pulsar-gradient': 'Rainbow', 'scribby': 'Scribble',
    'ink': 'Engraving', 'comic': 'Comic', 'liquid-glass-color': 'Liquid Glass',
    'liquid-glass': 'Frosted', 'neon': 'Neon', 'softteal-color': 'Soft', 'mini-stickers': 'Mini Stickers', 'stencil': 'Poster',
    'carbon_copy': 'Sketch', 'glyph-neue': 'Silhouette', 'nolan': 'Gradient Line',
}
# per-theme fixes for picks that match by name but show the wrong thing:
# {pack: {emoji: [queries] | {"id": icons8 id} | null (leave it a gap)}}
OVERRIDES = json.load(open(os.path.join(HERE, 'icons8-theme-overrides.json')))
SIZE = 256


def code(emoji): return '-'.join(f'{ord(c):x}' for c in emoji if ord(c) != 0xfe0f)


def pick(job):
    pack, emoji = job
    fix = OVERRIDES.get(pack, {}).get(emoji, CONCEPTS[emoji])
    if fix is None: return pack, emoji, None, None
    if isinstance(fix, dict): return pack, emoji, 'override', {'id': fix['id'], 'commonName': fix.get('name', 'override')}
    query, scored = best(pack, fix, keep=1, strict=True)
    return pack, emoji, query, scored[0][1] if scored else None


def survey(packs):
    """Search every emoji in each pack; results merge into survey.json, so a few packs can be re-surveyed alone."""
    path = os.path.join(ROOT, 'survey.json')
    cover = json.load(open(path)) if os.path.exists(path) else {}
    jobs = [(p, e) for p in packs for e in CONCEPTS]
    for p in packs: cover[p] = {}
    with ThreadPoolExecutor(10) as ex:
        for i, (pack, emoji, query, ic) in enumerate(ex.map(pick, jobs)):
            if ic: cover[pack][emoji] = {'id': ic['id'], 'commonName': ic['commonName'], 'query': query}
            if i % 500 == 0: print(i, '/', len(jobs), file=sys.stderr)
    os.makedirs(ROOT, exist_ok=True)
    json.dump(cover, open(path, 'w'), indent=1, ensure_ascii=False)
    for p in sorted(packs, key=lambda p: -len(cover[p])): print(f'{p:22} {len(cover[p]):3}/{len(CONCEPTS)}')


def build(packs):
    cover = json.load(open(os.path.join(ROOT, 'survey.json')))
    for pack in packs:
        d = os.path.join(ROOT, pack); os.makedirs(d, exist_ok=True)
        have, meta_path = cover[pack], os.path.join(d, 'theme.json')
        # drop files whose pick changed since the last build, or that lost their pick
        old = json.load(open(meta_path))['icons'] if os.path.exists(meta_path) else {}
        for e, m in old.items():
            f = os.path.join(d, m['file'])
            if have.get(e, {}).get('id') != m['id'] and os.path.exists(f): os.remove(f)

        def fetch(item):
            emoji, meta = item
            f = os.path.join(d, code(emoji) + '.png')
            if not os.path.exists(f):
                try: data = get(f'https://img.icons8.com/?id={meta["id"]}&format=png&size={SIZE}')
                except Exception: return  # a search hit the CDN no longer serves: counts as missing
                if data.startswith(b'\x89PNG'): open(f, 'wb').write(data)
        with ThreadPoolExecutor(8) as ex: list(ex.map(fetch, have.items()))
        have = {e: m for e, m in have.items() if os.path.exists(os.path.join(d, code(e) + '.png'))}
        json.dump({'pack': pack, 'name': THEMES.get(pack, pack), 'size': SIZE,
                   'icons': {e: {**m, 'file': code(e) + '.png'} for e, m in have.items()},
                   'missing': [e for e in CONCEPTS if e not in have]}, open(meta_path, 'w'), indent=1, ensure_ascii=False)
        print(f'{pack} ({THEMES.get(pack, pack)}): {len(have)} icons, {len(CONCEPTS) - len(have)} missing')


if __name__ == '__main__':
    cmd = sys.argv[1]
    packs = sys.argv[2:] or list(THEMES) if cmd == 'build' else sys.argv[2:] or CANDIDATES
    survey(packs) if cmd == 'survey' else build(packs)
