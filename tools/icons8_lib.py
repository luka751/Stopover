"""Search and scoring shared by icons8-harvest.py (the icon library) and icons8-themes.py (shop themes)."""
import json, re, time, urllib.parse, urllib.request


def get(url, tries=4):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'stopover-icons'}), timeout=30) as r:
                return r.read()
        except Exception:
            if i == tries - 1: raise
            time.sleep(1.5 * (i + 1))


def score(icon, query, rank, group='', strict=False):
    cn, cats = icon['commonName'].lower(), set(icon.get('category', '').split(','))
    slug = re.sub(r'[^a-z0-9]+', '-', query.lower()).strip('-')
    words = slug.split('-')
    if icon.get('isExplicit') or icon.get('isAnimated'): return None
    if cats == {'Logos'} or 'logo' in cn: return None
    # licensed characters hide behind ordinary words ("van" is a BT21 mascot, "hello" is Hello Kitty)
    if re.search(r'bt21|hello-kitty|pokemon|disney|marvel|simpson|van-houten|beethoven|van-gogh', cn): return None
    base = re.sub(r'--v\d+$', '', cn)
    # search matched a tag, not the idea; strict wants every word to start a word of the name
    # ("red flag" is not a red panda, "van" is not inside "savanna")
    if strict:
        # "island" must not be the Christmas Island flag or a map of Rhode Island (a plain globe in Maps is fine)
        tokens = base.split('-')
        if not {'flag', 'flags', 'map'} & set(words):
            if 'Flags' in cats or ('Maps' in cats and len(tokens) > len(words)): return None
        if not all(any(t.startswith(w[:4]) for t in tokens) for w in words): return None
    elif not any(w[:4] in base for w in words): return None
    # every extra word is another object in the drawing: plain "fire" beats "fire-exit", "house" beats "dog-house"
    extra = max(0, len(base.split('-')) - len(words)) * (15 if strict else 0)
    s = 50 - rank * 2
    if base == slug: s += 100
    elif base.endswith('-' + slug) or base.startswith(slug + '-'): s += 40
    elif all(w in base for w in words): s += 25
    if re.search(r'--v\d+$', cn): s -= 15
    if cats & {'Popular', 'User Interface'}: s += 10
    if group == 'ui' and cats & {'Industry', 'Household'} and not cats & {'User Interface'}: s -= 20
    s -= len(base) * 0.3 + extra
    return s


def best(pack, queries, group='', keep=3, strict=False):
    """Top candidates for a concept in one pack: the first wording (of a synonym list) that finds anything wins."""
    for query in ([queries] if isinstance(queries, str) else queries):
        q = urllib.parse.urlencode({'term': query, 'amount': 20, 'platform': pack})
        icons = json.loads(get('https://search.icons8.com/api/iconsets/v5/search?' + q)).get('icons', [])
        scored = [(score(ic, query, i, group, strict), ic) for i, ic in enumerate(icons) if ic['platform'] == pack]
        scored = sorted([x for x in scored if x[0] is not None], key=lambda x: -x[0])[:keep]
        if scored: return query, scored
    return None, []
