"""Builds the Icons8 icon library in assets/icons8 from tools/icons8-concepts.json.

For every concept and every pack: search Icons8, drop logos, animated variants and name mismatches, keep the best
three candidates (the pick plus two alternates) and download them as PNG. SVGs for the monochrome picks come
through the Icons8 MCP separately (the public CDN refuses SVG); they land in assets/icons8/<pack>/svg.
Safe to re-run: files already on disk are skipped. python3 tools/icons8-harvest.py
"""
import json, os, sys, time
from concurrent.futures import ThreadPoolExecutor
from icons8_lib import best, get

ROOT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'icons8')
CONCEPTS = json.load(open(os.path.join(os.path.dirname(__file__), 'icons8-concepts.json')))
# Windows 11 family: colour art for the game, outline + filled twins for small interface chrome
PACKS = {
    'fluent': {'color': True, 'sizes': [256, 512]},
    'color': {'color': True, 'sizes': [256, 512]},
    'fluent-systems-regular': {'color': False, 'sizes': [96]},
    'fluent-systems-filled': {'color': False, 'sizes': [96]},
}
KEEP = 3


def harvest(job):
    group, key, queries, pack = job
    query, scored = best(pack, queries, group, KEEP)
    out = []
    for n, (s, ic) in enumerate(scored):
        role = 'pick' if n == 0 else f'alt{n}'
        files = []
        for size in PACKS[pack]['sizes']:
            if role != 'pick' and size > 256: continue  # alternates at 256 only
            path = f'{pack}/png/{size}/{group}/{key}' + ('' if role == 'pick' else f'.{role}') + '.png'
            full = os.path.join(ROOT, path)
            if not os.path.exists(full):
                os.makedirs(os.path.dirname(full), exist_ok=True)
                data = get(f'https://img.icons8.com/?id={ic["id"]}&format=png&size={size}')
                if not data.startswith(b'\x89PNG'): continue
                open(full, 'wb').write(data)
            files.append(path)
        out.append({'group': group, 'concept': key, 'query': query, 'pack': pack, 'role': role, 'id': ic['id'],
                    'commonName': ic['commonName'], 'name': ic['name'], 'category': ic.get('category', ''),
                    'isFree': ic.get('isFree', False), 'score': round(s, 1), 'files': files})
    return out


jobs = [(g, k, q, p) for g, items in CONCEPTS.items() for k, q in items.items() for p in PACKS]
print(f'{len(jobs)} searches', file=sys.stderr)
rows, misses = [], []
with ThreadPoolExecutor(8) as ex:
    for i, res in enumerate(ex.map(harvest, jobs)):
        if not res: misses.append(f'{jobs[i][3]}:{jobs[i][1]}')
        rows += res
        if i % 100 == 0: print(i, file=sys.stderr)

# keep SVGs already fetched through the MCP recorded in the manifest
man_path = os.path.join(ROOT, 'manifest.json')
for r in rows:
    svg = f'{r["pack"]}/svg/{r["group"]}/{r["concept"]}.svg'
    if r['role'] == 'pick' and os.path.exists(os.path.join(ROOT, svg)): r['files'].append(svg)
json.dump({'generated': time.strftime('%Y-%m-%d'), 'packs': PACKS, 'icons': rows, 'misses': misses},
          open(man_path, 'w'), indent=1)
print(f'{len(rows)} icons, {len(misses)} misses: {" ".join(misses)}')
