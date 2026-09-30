'use strict';
// ================= layout: click anything in the game, then move, resize and restyle it =================
// Tweaks are CSS rules in tune.json → layout.{all, phone, desktop}: { selector: { property: value } }. core.js lays them
// over the game's own styles when it boots; here they're also pushed into the running preview as they change, so a
// drag shows at once. Shares index.html's globals (TUNE, el, $, edit helpers).
const SCOPES = [['all', 'Every screen'], ['phone', 'Phones'], ['desktop', 'Wider screens']];
const SCOPE_HELP = { all: 'Applies everywhere.', phone: 'Only on screens 760 px wide or narrower.', desktop: 'Only on screens wider than 760 px.' };
const SEL = { on: false, el: null, selector: null, scope: 'all', cands: [] };
// what the panel offers, in order
const PROPS = [
  { k: 'translate', label: 'Move', kind: 'move', help: 'Shift it from where it sits, in pixels (right and down are positive). Or drag it in the preview.' },
  { k: 'width', label: 'Width', kind: 'px', help: 'Empty = its normal width. Or drag the corner handle in the preview.' },
  { k: 'height', label: 'Height', kind: 'px' },
  { k: 'scale', label: 'Scale', kind: 'pct', help: '100 = normal size, 150 = half as big again. Grows from its centre without moving what is around it.' },
  { k: 'order', label: 'Order in its row', kind: 'num', help: 'Lower comes first. Works for things sitting side by side (a toolbar, a row of buttons).' },
  { k: 'font-size', label: 'Text size', kind: 'px' },
  { k: 'font-weight', label: 'Text weight', kind: 'select', options: ['', '400', '500', '600', '700', '800', '900'] },
  { k: 'color', label: 'Text colour', kind: 'color' },
  { k: 'background', label: 'Background', kind: 'color' },
  { k: 'border-radius', label: 'Corner rounding', kind: 'px' },
  { k: 'padding', label: 'Space inside', kind: 'px' },
  { k: 'margin', label: 'Space outside', kind: 'px' },
  { k: 'gap', label: 'Space between items', kind: 'px', help: 'For rows and grids of things.' },
  { k: 'opacity', label: 'Opacity', kind: 'pct', help: '100 = solid, 0 = invisible (but still clickable).' },
  { k: 'display', label: 'Hide it', kind: 'hide', help: 'Removes it from the game completely.' },
];

const layoutCss = L => {
  const rules = o => Object.entries(o || {}).map(([sel, props]) => `${sel} { ${Object.entries(props).map(([k, v]) => `${k}: ${v} !important`).join('; ')} }`).join('\n');
  return `${rules(L.all)}\n@media (max-width: 760px) {\n${rules(L.phone)}\n}\n@media (min-width: 761px) {\n${rules(L.desktop)}\n}`;
};
const layoutOf = () => TUNE.layout || (TUNE.layout = { all: {}, phone: {}, desktop: {} });
const ruleOf = () => (layoutOf()[SEL.scope] || {})[SEL.selector] || {};
const fdoc = () => { try { return $('game').contentDocument; } catch { return null; } };
function applyLayout() {
  const d = fdoc(); if (!d || !d.head) return;
  let st = d.getElementById('tune-layout');
  if (!st) { st = d.createElement('style'); st.id = 'tune-layout'; d.head.append(st); }
  st.textContent = layoutCss(layoutOf());
}
// change one property of the selected rule ('' removes it); a whole drag counts as one undo step
function writeLayout(prop, value) {
  const L = layoutOf(), bucket = L[SEL.scope] || (L[SEL.scope] = {}), rule = bucket[SEL.selector] || {};
  if (value === '' || value == null) delete rule[prop]; else rule[prop] = String(value).replace(/[{};<>]/g, '');
  if (Object.keys(rule).length) bucket[SEL.selector] = rule; else delete bucket[SEL.selector];
}
function setLayout(prop, value, { redraw } = {}) {
  const before = JSON.stringify(TUNE);
  writeLayout(prop, value);
  pushUndo(before); applyLayout(); refreshStatus(); renderNav();
  if (redraw) renderEditor();
}

// ---- picking things in the preview
function candidates(elm) {
  const d = elm.ownerDocument, tag = elm.tagName.toLowerCase(), out = [];
  // classes that only mark a passing state would stop the tweak from sticking
  const cls = [...elm.classList].filter(c => !/^(on|off|active|open|sel|selected|done|hidden|show|shown|changed|equipped|locked|busy|now|is-.*)$/.test(c)).map(c => '.' + CSS.escape(c)).join('');
  const data = [...elm.attributes].find(a => a.name.startsWith('data-') && a.value && a.value.length < 40);
  const attr = data ? `[${data.name}="${data.value.replace(/["\\]/g, '\\$&')}"]` : '';
  const anc = elm.parentElement && elm.parentElement.closest('[id]'), in_ = anc ? `#${CSS.escape(anc.id)} ` : '';
  if (elm.id) out.push('#' + CSS.escape(elm.id));
  if (!elm.id && attr) out.push(in_ + tag + attr);
  if (!elm.id && anc) out.push(in_ + tag + cls);
  if (cls) out.push(tag + cls);
  if (attr) out.push(tag + attr);
  return [...new Set(out)].map(s => { let n = 0; try { n = d.querySelectorAll(s).length; } catch {} return { s, n }; }).filter(c => c.n > 0);
}
const label = e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + [...e.classList].slice(0, 2).map(c => '.' + c).join('');
function select(elm, selector) {
  SEL.el = elm; SEL.cands = candidates(elm);
  SEL.selector = selector || (SEL.cands[0] || { s: label(elm) }).s;
  // a rule that already exists for one of these wins, so reopening a tweak lands on it
  for (const [sc] of SCOPES) { const hit = SEL.cands.find(c => (layoutOf()[sc] || {})[c.s]); if (hit && !selector) { SEL.selector = hit.s; SEL.scope = sc; break; } }
  const s = SECTIONS.find(x => x.custom === 'layout'); if (s && current !== s) openSection(s); else renderEditor();
}
function setPicking(on) {
  SEL.on = on; $('pick').classList.toggle('primary', on); $('pick').textContent = on ? '🎯 Selecting… (Esc)' : '🎯 Select';
  const d = fdoc(); if (d) { frameTools(d); d.documentElement.classList.toggle('studio-picking', on); d.getElementById('studio-hover').style.display = 'none'; }
  if (on) toast('Click anything in the game to select it. Drag to move, pull the corner to resize.');
}
// the overlay lives inside the game's page, so its coordinates are the game's own
function frameTools(d) {
  if (d.__studio || !d.body) return; d.__studio = true;
  const w = d.defaultView;
  d.head.append(Object.assign(d.createElement('style'), { textContent: `
    .studio-ui { position: fixed; z-index: 2147483647; box-sizing: border-box; font: 11px/1.2 system-ui, sans-serif; }
    #studio-hover { pointer-events: none; outline: 2px dashed #2F6FDB; background: rgba(47,111,219,.08); display: none; }
    #studio-hover span, #studio-sel span { position: absolute; left: -2px; top: -18px; background: #2F6FDB; color: #fff; padding: 2px 5px; border-radius: 3px; white-space: nowrap; }
    #studio-sel { outline: 2px solid #E0A100; cursor: move; display: none; touch-action: none; }
    #studio-sel span { background: #E0A100; color: #111; }
    #studio-sel i { position: absolute; right: -7px; bottom: -7px; width: 14px; height: 14px; background: #E0A100; border: 2px solid #fff; border-radius: 3px; cursor: nwse-resize; }
    html.studio-picking, html.studio-picking * { cursor: crosshair !important; }
    html.studio-picking #studio-sel { cursor: move !important; } html.studio-picking #studio-sel i { cursor: nwse-resize !important; }` }));
  const hover = Object.assign(d.createElement('div'), { id: 'studio-hover', className: 'studio-ui' }); hover.append(d.createElement('span'));
  const box = Object.assign(d.createElement('div'), { id: 'studio-sel', className: 'studio-ui' }); box.append(d.createElement('span'), d.createElement('i'));
  d.body.append(hover, box);
  const ours = t => t && t.closest && t.closest('.studio-ui');
  const place = (div, r, text) => { Object.assign(div.style, { display: 'block', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' }); div.firstChild.textContent = text; };
  w.addEventListener('mousemove', e => { if (!SEL.on || ours(e.target)) { hover.style.display = 'none'; return; } const r = e.target.getBoundingClientRect(); place(hover, r, `${label(e.target)} · ${Math.round(r.width)}×${Math.round(r.height)}`); }, true);
  // while picking, the game doesn't see clicks at all
  for (const type of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'dblclick', 'contextmenu', 'submit'])
    w.addEventListener(type, e => { if (!SEL.on || ours(e.target)) return; e.preventDefault(); e.stopImmediatePropagation(); if (type === 'click') select(e.target); }, true);
  w.addEventListener('keydown', e => { if (e.key === 'Escape' && SEL.on) setPicking(false); }, true);
  // dragging the selection moves it; the corner resizes it
  let drag = null;
  box.addEventListener('pointerdown', e => {
    if (!SEL.el) return; e.preventDefault(); box.setPointerCapture(e.pointerId);
    const cs = w.getComputedStyle(SEL.el), [tx = 0, ty = 0] = (ruleOf().translate || '').split(/\s+/).map(parseFloat).map(x => x || 0);
    drag = { resize: e.target.tagName === 'I', x: e.clientX, y: e.clientY, tx, ty, w: parseFloat(cs.width), h: parseFloat(cs.height), before: JSON.stringify(TUNE) };
  });
  box.addEventListener('pointermove', e => {
    if (!drag) return; const dx = Math.round(e.clientX - drag.x), dy = Math.round(e.clientY - drag.y);
    if (drag.resize) { writeLayout('width', Math.max(4, Math.round(drag.w + dx)) + 'px'); writeLayout('height', Math.max(4, Math.round(drag.h + dy)) + 'px'); }
    else writeLayout('translate', `${drag.tx + dx}px ${drag.ty + dy}px`);
    applyLayout();
  });
  box.addEventListener('pointerup', e => {
    if (!drag) return;
    const moved = Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 2;
    if (JSON.stringify(TUNE) !== drag.before) { pushUndo(drag.before); refreshStatus(); renderNav(); renderEditor(); }
    // a plain click inside the selection picks whatever is under it (a button inside a panel, say)
    else if (!moved && !drag.resize) { const under = d.elementsFromPoint(e.clientX, e.clientY).find(x => !ours(x) && x !== SEL.el && SEL.el.contains(x)); if (under) select(under); }
    drag = null;
  });
  // follow the selection as the game redraws and scrolls
  const follow = () => {
    if (!d.defaultView) return;
    if (SEL.el && !SEL.el.isConnected) { try { SEL.el = d.querySelector(SEL.selector); } catch { SEL.el = null; } }
    if (SEL.on && SEL.el) { const r = SEL.el.getBoundingClientRect(); place(box, r, `${SEL.selector} · ${Math.round(r.width)}×${Math.round(r.height)}`); } else box.style.display = 'none';
    w.requestAnimationFrame(follow);
  };
  follow();
}
// a reloaded game is a new page: tools back in, the same thing selected again
$('game').addEventListener('load', () => {
  const d = fdoc(); if (!d || !d.body || location.origin !== d.location.origin) return;
  frameTools(d); applyLayout();
  d.documentElement.classList.toggle('studio-picking', SEL.on);
  if (SEL.selector) { try { SEL.el = d.querySelector(SEL.selector); } catch { SEL.el = null; } }
});
$('pick').onclick = () => setPicking(!SEL.on);

// ---- the panel
// the preview is a real browser window: at 760 px or narrower it shows the phone layout
function previewNote() {
  const w = $('game').clientWidth; if (!w) return null;
  const phone = w <= 760;
  return el('div', { class: 'status', style: 'margin-top:6px;font-size:12px' }, `The preview is ${w} px wide, so it's showing the ${phone ? 'phone' : 'wider-screen'} layout.`,
    phone ? ' Press 🖥 Desktop above the game to see the wider one.' : '');
}
const toHex = c => { const m = String(c).match(/\d+(\.\d+)?/g); if (!m || m.length < 3 || (m[3] !== undefined && +m[3] === 0)) return null; return '#' + m.slice(0, 3).map(x => (+x).toString(16).padStart(2, '0')).join('').toUpperCase(); };
function propControl(p) {
  const rule = ruleOf(), v = rule[p.k], cs = SEL.el && SEL.el.isConnected ? SEL.el.ownerDocument.defaultView.getComputedStyle(SEL.el) : null;
  const reset = el('button', { class: 'iconbtn', title: 'Back to normal', onclick: () => setLayout(p.k, '', { redraw: true }) }, '↺');
  const num = (val, ph, on) => { const n = el('input', { type: 'number', step: 'any', value: val ?? '', placeholder: ph ?? '' }); n.oninput = () => on(n.value === '' ? '' : n.valueAsNumber); return n; };
  let ctl;
  if (p.kind === 'move') {
    const [x = '', y = ''] = (v || '').split(/\s+/).map(parseFloat);
    const set = (nx, ny) => setLayout('translate', nx === '' && ny === '' || (!nx && !ny) ? '' : `${nx || 0}px ${ny || 0}px`);
    const xi = num(x, '0', a => set(a, yi.value === '' ? '' : +yi.value)), yi = num(y, '0', b => set(xi.value === '' ? '' : +xi.value, b));
    ctl = el('span', { class: 'chips' }, el('span', { class: 'lbl' }, 'X'), xi, el('span', { class: 'lbl' }, 'Y'), yi);
  } else if (p.kind === 'px') {
    const now = cs ? (p.k === 'width' || p.k === 'height' ? Math.round(SEL.el.getBoundingClientRect()[p.k]) : Math.round(parseFloat(cs.getPropertyValue(p.k)) || 0)) : '';
    ctl = el('span', { class: 'chips' }, num(v ? parseFloat(v) : '', now, a => setLayout(p.k, a === '' ? '' : a + 'px')), el('span', { class: 'lbl' }, 'px'));
  } else if (p.kind === 'pct') {
    const cur = v !== undefined ? Math.round(parseFloat(v) * 100) : '';
    ctl = el('span', { class: 'chips' }, num(cur, 100, a => setLayout(p.k, a === '' ? '' : String(a / 100))), el('span', { class: 'lbl' }, '%'));
  } else if (p.kind === 'num') {
    ctl = num(v ?? '', cs ? cs.order : 0, a => setLayout(p.k, a === '' ? '' : String(Math.round(a))));
  } else if (p.kind === 'select') {
    ctl = el('select', { onchange: e => setLayout(p.k, e.target.value) }, p.options.map(o => el('option', { value: o, selected: (v || '') === o }, o || `normal (${cs ? cs.fontWeight : '…'})`)));
  } else if (p.kind === 'color') {
    const start = v || (cs && toHex(p.k === 'background' ? cs.backgroundColor : cs.color)) || '#FFFFFF';
    const pick = el('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(start) ? start.toLowerCase() : '#ffffff' });
    const hex = el('input', { class: 'hex', value: v || '', placeholder: v ? '' : start, spellcheck: 'false' });
    pick.oninput = () => { hex.value = pick.value.toUpperCase(); setLayout(p.k, hex.value); };
    hex.onchange = () => setLayout(p.k, hex.value.trim(), { redraw: true });
    ctl = el('span', { class: 'color' }, pick, hex);
  } else if (p.kind === 'hide') {
    const c = el('input', { type: 'checkbox' }); c.checked = v === 'none'; c.onchange = () => setLayout('display', c.checked ? 'none' : '', { redraw: true }); ctl = c;
  }
  const lab = el('div', { class: 'lab' }, p.label, p.help ? el('small', {}, p.help) : null);
  const row = el('div', { class: 'ctl' }, ctl, v !== undefined ? reset : null);
  if (v !== undefined) lab.classList.add('changed');
  return [lab, row];
}

function renderLayout() {
  const ed = $('editor');
  ed.append(el('h1', {}, current.title),
    el('p', { class: 'help' }, 'Move, resize and restyle anything in the game. Press ', el('b', {}, '🎯 Select'), ' above the game preview, click the thing you want to change, then drag it, pull its corner, or use the settings here. Tweaks show in the game straight away; Save & test keeps them.'));
  if (SEL.selector) {
    const card = el('div', { class: 'card' });
    // where it sits: click a parent to select the whole group around it
    if (SEL.el && SEL.el.isConnected) {
      const chain = []; for (let e = SEL.el; e && e.tagName !== 'HTML' && chain.length < 5; e = e.parentElement) chain.unshift(e);
      card.append(el('div', { class: 'chips', style: 'margin-bottom:10px' }, el('span', { class: 'lbl' }, 'Selected:'),
        chain.map((e, i) => el('button', { class: 'btn small' + (e === SEL.el ? ' primary' : ''), title: i < chain.length - 1 ? 'Select this bigger box instead' : '', onclick: () => select(e) }, label(e)))));
    }
    const scope = el('div', { class: 'chips' }, SCOPES.map(([id, name]) => el('button', { class: 'btn small' + (SEL.scope === id ? ' primary' : ''), title: SCOPE_HELP[id], onclick: () => { SEL.scope = id; renderEditor(); } }, name)));
    const cands = SEL.cands.length ? el('div', { class: 'chips' }, SEL.cands.map(c => el('button', { class: 'btn small' + (SEL.selector === c.s ? ' primary' : ''), title: c.s, onclick: () => { SEL.selector = c.s; renderEditor(); } },
      c.n === 1 ? 'Just this one' : `All ${c.n} like it`, el('code', { style: 'margin-left:6px;opacity:.7' }, c.s.length > 34 ? c.s.slice(0, 33) + '…' : c.s)))) : el('code', {}, SEL.selector);
    const f = el('div', { class: 'fields' }, el('div', { class: 'lab' }, 'Change', el('small', {}, 'Just the one you clicked, or every one like it.')), cands,
      el('div', { class: 'lab' }, 'On', el('small', {}, SCOPE_HELP[SEL.scope])), el('div', {}, scope, previewNote()));
    for (const p of PROPS) f.append(...propControl(p));
    card.append(f);
    if (Object.keys(ruleOf()).length) card.append(el('button', { class: 'btn small', style: 'margin-top:12px', onclick: () => { const before = JSON.stringify(TUNE); delete layoutOf()[SEL.scope][SEL.selector]; pushUndo(before); applyLayout(); refreshStatus(); renderNav(); renderEditor(); } }, '↺ Put this back to normal'));
    ed.append(card);
  } else ed.append(el('div', { class: 'card empty' }, 'Nothing selected yet. Press ', el('button', { class: 'btn small primary', onclick: () => setPicking(true) }, '🎯 Select'), ' and click something in the game.'));

  // every tweak so far
  const all = el('div', { class: 'card' }, el('b', {}, 'All layout tweaks'));
  let any = false;
  for (const [sc, name] of SCOPES) for (const [sel, props] of Object.entries(layoutOf()[sc] || {})) {
    any = true;
    all.append(el('div', { class: 'tweak' }, el('div', {}, el('code', {}, sel), el('span', { class: 'status' }, ` · ${name}`),
      el('div', { class: 'status' }, Object.entries(props).map(([k, v]) => `${k}: ${v}`).join(' · '))),
      el('span', {}, el('button', { class: 'btn small', onclick: () => { const d = fdoc(); let e = null; try { e = d && d.querySelector(sel); } catch {} SEL.scope = sc; if (e) { select(e, sel); if (!SEL.on) setPicking(true); } else { SEL.el = null; SEL.selector = sel; SEL.cands = []; renderEditor(); toast('Not on screen right now; you can still edit it here.'); } } }, 'Edit'),
        el('button', { class: 'iconbtn', title: 'Remove this tweak', onclick: () => { const before = JSON.stringify(TUNE); delete layoutOf()[sc][sel]; pushUndo(before); applyLayout(); refreshStatus(); renderNav(); renderEditor(); } }, '🗑'))));
  }
  if (!any) all.append(el('p', { class: 'status', style: 'margin:6px 0 0' }, 'None yet.'));
  ed.append(all);
}
