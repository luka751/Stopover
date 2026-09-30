"""Writes assets/icons8/index.html: every concept in a row, the pick and alternates for each pack side by side."""
import json, os, html
root = os.path.join(os.path.dirname(__file__), '..', 'assets', 'icons8')
m = json.load(open(os.path.join(root, 'manifest.json')))
packs = list(m['packs'])
by = {}
for r in m['icons']: by.setdefault((r['group'], r['concept']), {}).setdefault(r['pack'], []).append(r)
thumbs = os.path.join(root, 'illustrations', '3d-fluency', 'thumbs')
ills = ''.join(f'<figure style="width:140px"><img style="width:128px;height:128px" loading="lazy" src="illustrations/3d-fluency/thumbs/{f}">'
               f'<figcaption>{f[:-4]}</figcaption></figure>' for f in sorted(os.listdir(thumbs)) if f.endswith('.png')) if os.path.isdir(thumbs) else ''
rows, group = [], None
for (g, c), per in by.items():
    if g != group: rows.append(f'<tr><th colspan="{len(packs)+1}" class="g">{g}</th></tr>'); group = g
    cells = []
    for p in packs:
        imgs = ''.join(f'<figure class="{r["role"]}"><img loading="lazy" src="{html.escape(next(f for f in r["files"] if "/png/" in f))}" '
                       f'title="{html.escape(r["commonName"])} · id {r["id"]}"><figcaption>{html.escape(r["commonName"])}</figcaption></figure>'
                       for r in per.get(p, []))
        cells.append(f'<td>{imgs or "<span class=miss>none</span>"}</td>')
    rows.append(f'<tr><th>{c}</th>{"".join(cells)}</tr>')
open(os.path.join(root, 'index.html'), 'w').write(f'''<!doctype html><meta charset="utf-8"><title>Stopover icon library</title>
<style>body{{font:13px system-ui;margin:16px;background:#f6f7f4;color:#1d1606}}table{{border-collapse:collapse}}td,th{{border-bottom:1px solid #ddd;padding:6px;vertical-align:top;text-align:left}}
th.g{{background:#0B6B3A;color:#fff;font-size:15px;position:sticky;top:0}}figure{{display:inline-block;margin:0 6px 0 0;width:84px;text-align:center}}
img{{width:56px;height:56px;object-fit:contain}}figure.pick img{{outline:2px solid #E9A21B;outline-offset:3px;border-radius:6px}}
figcaption{{font-size:10px;color:#666;word-break:break-all}}.miss{{color:#b33}}</style>
<h1>Stopover icon library</h1><p>{len(m["icons"])} icons from Icons8. The gold outline marks each pack's pick; the others are alternates. Hover for id.</p>
<h2>Illustrations · 3D Fluency</h2><div>{ills}</div><h2>Icons</h2><table><tr><th>concept</th>{"".join(f"<th>{p}</th>" for p in packs)}</tr>{"".join(rows)}</table>''')
