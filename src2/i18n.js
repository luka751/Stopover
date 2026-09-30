// ================= languages: English, Georgian, German, Ukrainian, Russian =================
// The game is written in English. Rather than route every string through a function, this watches the page and
// replaces English text as it appears, wherever it came from: a text node, or a placeholder / title / aria-label /
// alt attribute. Dictionaries (src2/i18n/<lang>.json, managed in POEditor) map English to the translation, either
// exactly ("Log in") or as a pattern with named gaps ("Welcome to {place}: +{pts} pts"). Canvas text (map labels)
// and place names are never touched: they aren't dictionary keys.
// ?lang=en|ka|de|uk|ru picks a language and remembers it; otherwise the browser's language decides.
// ?i18n=collect (and localhost) records every English line not yet translated: __i18n.missing, __i18n.copyMissing().
(() => {
  'use strict';
  const DICTS = window.__I18N_DICTS || {}, LANGS = { en: 'English', ka: 'ქართული', de: 'Deutsch', uk: 'Українська', ru: 'Русский' };
  const store = { get() { try { return localStorage.getItem('stopover-lang'); } catch { return null; } }, set(v) { try { localStorage.setItem('stopover-lang', v); } catch {} } };
  function pick() {
    const q = new URLSearchParams(location.search).get('lang');
    if (q && LANGS[q]) { store.set(q); return q; }
    const saved = store.get(); if (saved && LANGS[saved]) return saved;
    for (const l of navigator.languages || [navigator.language || '']) { const b = String(l).slice(0, 2).toLowerCase(); if (b === 'en') return 'en'; if (LANGS[b]) return b; }
    return 'en';
  }
  const lang = pick(), collect = /[?&]i18n=collect/.test(location.search) || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  document.documentElement.lang = lang;
  const missing = new Set();
  const api = window.__i18n = { lang, LANGS, missing,
    set(l) { store.set(l); location.reload(); },
    copyMissing() { const text = JSON.stringify(Object.fromEntries([...missing].sort().map(s => [s, ''])), null, 1); navigator.clipboard && navigator.clipboard.writeText(text); return text; },
    t: s => s };
  // Georgian needs a font with Georgian letters; Cyrillic falls back to the system fonts after Barlow
  if (lang === 'ka') { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+Georgian:wght@400;600;800&display=swap'; document.head.appendChild(l); document.documentElement.classList.add('lang-ka'); }
  // English players get only the picker; translating (and collecting) runs for the other languages and in development
  const active = lang !== 'en' || collect;

  const exact = new Map(), patterns = [];
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const [en, to] of Object.entries(DICTS[lang] || {})) {
    if (!to) continue;
    if (!/\{\w+\}/.test(en)) { exact.set(en, to); continue; }
    const names = [], re = new RegExp('^' + en.split(/(\{\w+\})/).map(p => /^\{\w+\}$/.test(p) ? (names.push(p.slice(1, -1)), '(.+?)') : escRe(p)).join('') + '$', 's');
    patterns.push({ re, names, to, head: en.split('{')[0].slice(0, 3) });
  }
  // Country and territory names come from the browser's own translations (Intl.DisplayNames), keyed by the
  // English name the browser gives; a dictionary entry still wins where the game's English name differs.
  if (lang !== 'en' && typeof Intl.DisplayNames === 'function') {
    try {
      const en = new Intl.DisplayNames(['en'], { type: 'region' }), to = new Intl.DisplayNames([lang], { type: 'region' }), L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      for (const a of L) for (const b of L) { const cc = a + b, e = en.of(cc), t = to.of(cc); if (e && t && e !== cc && t !== cc && !exact.has(e)) exact.set(e, t); }
    } catch {}
  }
  // what a stretch of English becomes, or null to leave it
  function tr(s) {
    if (!active) return null;
    const t = s.trim(); if (!t || !/[A-Za-z]{2}/.test(t)) return null;
    const hit = exact.get(t); if (hit != null) return hit === t ? null : s.replace(t, hit);
    for (const p of patterns) {
      if (p.head && !t.startsWith(p.head)) continue;
      const m = p.re.exec(t); if (!m) continue;
      let out = p.to; p.names.forEach((n, i) => { out = out.split('{' + n + '}').join(m[i + 1]); });
      return s.replace(t, out);
    }
    if (collect && t.length < 400) missing.add(t);
    return null;
  }
  api.t = s => { const r = tr(String(s)); return r == null ? s : r; };
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'NOSCRIPT']), ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  function textNode(n) { const p = n.parentNode; if (!p || SKIP.has(p.nodeName) || (p.closest && p.closest('[data-no-i18n]'))) return; const r = tr(n.data); if (r != null && r !== n.data) n.data = r; }
  function attrs(el) { for (const a of ATTRS) { const v = el.getAttribute(a); if (v) { const r = tr(v); if (r != null && r !== v) el.setAttribute(a, r); } } if (el.nodeName === 'INPUT' && /^(submit|button)$/.test(el.type) && el.value) { const r = tr(el.value); if (r != null) el.value = r; } }
  function walk(root) {
    if (root.nodeType === 3) { textNode(root); return; }
    if (root.nodeType !== 1 || SKIP.has(root.nodeName)) return;
    attrs(root); picker(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = w.nextNode(); n; n = w.nextNode()) { if (n.nodeType === 3) textNode(n); else if (!SKIP.has(n.nodeName)) attrs(n); }
  }
  // the language picker goes into the log-in card and the Settings dialogs (both games), wherever they appear
  function picker(root) {
    const spots = [...(root.matches && root.matches('.authcard, #dlg-settings header, #dlg-mini-settings header') ? [root] : []), ...root.querySelectorAll('.authcard, #dlg-settings header, #dlg-mini-settings header')];
    for (const spot of spots) {
      if (spot.querySelector('.langpick')) continue;
      const s = document.createElement('select'); s.className = 'field langpick'; s.setAttribute('aria-label', 'Language'); s.dataset.noI18n = '';
      s.innerHTML = Object.entries(LANGS).map(([k, v]) => `<option value="${k}" ${k === lang ? 'selected' : ''}>${v}</option>`).join('');
      s.onchange = () => api.set(s.value);
      spot.appendChild(s);
    }
  }
  new MutationObserver(list => {
    for (const m of list) {
      if (m.type === 'childList') m.addedNodes.forEach(walk);
      else if (m.type === 'characterData') textNode(m.target);
      else if (m.type === 'attributes') attrs(m.target);
    }
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  const all = () => { walk(document.body); const r = tr(document.title); if (r) document.title = r; };
  if (document.body) all(); else document.addEventListener('DOMContentLoaded', all);
})();
