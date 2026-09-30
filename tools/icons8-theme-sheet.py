"""Writes assets/icons8/themes/index.html (every shop theme, every icon, the gaps) and gaps.json (what to generate).
python3 tools/icons8-theme-sheet.py
"""
import html, json, os

HERE = os.path.dirname(__file__)
ROOT = os.path.join(HERE, '..', 'assets', 'icons8', 'themes')
CONCEPTS = {k: v for k, v in json.load(open(os.path.join(HERE, 'icons8-theme-concepts.json'))).items() if not k.startswith('_')}
DARK = {'neon', 'liquid-glass'}  # drawn for dark backgrounds

themes = []
for d in sorted(os.listdir(ROOT)):
    meta = os.path.join(ROOT, d, 'theme.json')
    if os.path.exists(meta): themes.append(json.load(open(meta)))
themes.sort(key=lambda t: -len(t['icons']))

gaps = {t['pack']: {'name': t['name'], 'missing': [{'emoji': e, 'concept': CONCEPTS[e][0]} for e in t['missing']],
                    'style_reference': [f'{t["pack"]}/{t["icons"][e]["file"]}' for e in ['✈', '🌍', '🏆', '🚗'] if e in t['icons']]}
        for t in themes}
json.dump(gaps, open(os.path.join(ROOT, 'gaps.json'), 'w'), indent=1, ensure_ascii=False)

sections = []
for t in themes:
    cells = []
    for e, q in CONCEPTS.items():
        ic = t['icons'].get(e)
        img = f'<img loading="lazy" src="{t["pack"]}/{ic["file"]}" alt="">' if ic else '<span class="gap">?</span>'
        cells.append(f'<figure title="{html.escape(q[0])}{"" if ic else " (missing)"}">{img}<figcaption>{e}</figcaption></figure>')
    missing = ' '.join(t['missing']) or 'none'
    sections.append(f'''<section class="{'dark' if t['pack'] in DARK else ''}">
<h2>{html.escape(t['name'])} <small>{t['pack']} · {len(t['icons'])}/{len(CONCEPTS)}</small></h2>
<p class="miss">Missing: {missing}</p><div class="grid">{''.join(cells)}</div></section>''')

open(os.path.join(ROOT, 'index.html'), 'w').write(f'''<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Stopover emoji themes</title>
<style>
:root{{--bg:#f4f5f0;--card:#fff;--ink:#1d1606;--muted:#6b6b60;--gap:#e8e3ff}}
body{{margin:0;padding:16px;font:14px system-ui;background:var(--bg);color:var(--ink)}}
h1{{margin:0 0 4px}} section{{background:var(--card);border-radius:12px;padding:12px 16px;margin:12px 0}}
section.dark{{background:#1b1f2a;color:#eee}} section.dark .miss,section.dark small{{color:#aab}}
h2{{margin:0;font-size:18px}} small{{color:var(--muted);font-weight:400;font-size:13px}} .miss{{color:var(--muted);margin:4px 0 8px}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(52px,1fr));gap:4px}}
figure{{margin:0;text-align:center}} img,.gap{{width:40px;height:40px;object-fit:contain;display:inline-block}}
.gap{{background:var(--gap);border-radius:8px;line-height:40px;color:#7a6cc4;font-weight:700}}
figcaption{{font-size:12px;line-height:1.2}}
</style>
<h1>Stopover emoji themes</h1>
<p>{len(themes)} themes drawn from Icons8 styles, {len(CONCEPTS)} game emoji each. Purple squares are gaps to generate
(see gaps.json, which also names reference icons for each style). Hover an icon for what it stands for.</p>
{''.join(sections)}''')
print(len(themes), 'themes;', sum(len(t['missing']) for t in themes), 'gaps')
