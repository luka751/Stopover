// ================= map renderer =================
const isDarkUI = () => { const t = document.documentElement.dataset.theme; return t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches); };
const PALETTES = {
  atlas: () => isDarkUI()
    ? { sea: '#0E2530', land: '#1C2924', coast: '#3F564C', border: '#7D6897', text: '#93A39A', halo: 'rgba(20,30,26,.9)', ink: '#E5EDE8', dots: '#56706A', grid: 'rgba(255,255,255,.07)', lines: '#5AAAE8' }
    : { sea: '#A8CBD5', land: '#F4F2E8', coast: '#8FA79B', border: '#9C86B4', text: '#5C6A63', halo: 'rgba(249,248,241,.92)', ink: '#16221D', dots: '#8FA79B', grid: 'rgba(22,34,29,.09)', lines: '#1D6FB8' },
  political: () => ({ sea: '#9FC6DE', land: '#EDE7D5', fills: ['#F6D7A7', '#C9E3B5', '#F2B8B0', '#BFD3EE', '#E6CDE8', '#F7EBA6'], coast: '#6E8792', border: '#FFFFFF', borderW: 1.4, borderDash: [], text: '#3B4A52', halo: 'rgba(255,255,255,.85)', ink: '#1C2A33', dots: '#6E7F88', grid: 'rgba(0,0,0,.08)', lines: '#C0392B' }),
  night: () => ({ sea: '#070D17', land: '#141C2B', coast: '#2B3A55', border: '#3A4A6B', text: '#7F90B3', halo: 'rgba(7,13,23,.9)', ink: '#E6ECFF', dots: '#F5C35B', dotGlow: true, grid: 'rgba(120,150,220,.08)', lines: '#F5C35B', glow: true }),
  antique: () => ({ sea: '#D9C9A3', land: '#EFE3C4', coast: '#7A5A36', border: '#9A6B45', borderDash: [2, 3], text: '#6B4B2B', halo: 'rgba(239,227,196,.9)', ink: '#3F2A14', dots: '#9A6B45', grid: 'rgba(90,60,30,.14)', lines: '#8B2E1E', serif: true, seaTexture: true }),
  blueprint: () => ({ sea: '#0F3D7A', land: '#12498F', coast: '#DDEBFF', border: 'rgba(221,235,255,.55)', borderDash: [4, 3], text: '#CFE2FF', halo: 'rgba(15,61,122,.85)', ink: '#FFFFFF', dots: '#DDEBFF', grid: 'rgba(221,235,255,.15)', lines: '#FFD166', forceGrid: true }),
  relief: () => PALETTES.atlas(),
  // picture maps: NASA Blue Marble and Natural Earth rasters, reprojected to Mercator as they are drawn
  nightlights: () => ({ raster: 'nightlights', sea: '#02040A', land: '#0A0D14', coast: 'rgba(160,190,255,.22)', border: 'rgba(255,214,120,.45)', borderDash: [3, 3], text: '#C9D6F2', halo: 'rgba(0,0,0,.7)', ink: '#FFFFFF', dots: '#FFD27A', dotGlow: true, grid: 'rgba(160,190,255,.1)', lines: '#FFD27A', glow: true }),
  grey: () => ({ raster: 'grey', sea: '#B9BDC0', land: '#D9DADB', coast: 'rgba(40,40,40,.35)', border: '#6B6F73', borderDash: [4, 3], text: '#3A3D40', halo: 'rgba(235,236,237,.9)', ink: '#1E2124', dots: '#4A4E52', grid: 'rgba(0,0,0,.1)', lines: '#C0392B' }),
  metro: () => ({ sea: '#15181D', land: '#20252C', coast: '#39414C', border: '#4E5866', borderDash: [], text: '#8E99A8', halo: 'rgba(21,24,29,.9)', ink: '#F2F4F7', dots: '#FFFFFF', grid: 'rgba(255,255,255,.06)', lines: '#00B2FF' }),
  newsprint: () => ({ sea: '#DCD7CB', land: '#F4F1E8', coast: '#2B2B2B', border: '#2B2B2B', borderDash: [1, 3], text: '#2B2B2B', halo: 'rgba(244,241,232,.92)', ink: '#111111', dots: '#2B2B2B', grid: 'rgba(0,0,0,.12)', lines: '#111111', serif: true, seaTexture: true }),
  topo: () => ({ sea: '#B7D3C9', land: '#DCE5C3', fills: ['#D6E2B5', '#E3E6BF', '#CFDDB0', '#E0E8C8', '#D2DDB9', '#E6E3C0'], coast: '#4F6B4A', border: '#8A5A2B', borderW: 1.2, borderDash: [6, 2, 1, 2], text: '#3F4F32', halo: 'rgba(236,240,222,.9)', ink: '#20291A', dots: '#6B4A2B', grid: 'rgba(79,107,74,.22)', lines: '#8A5A2B', forceGrid: true }),
  synthwave: () => ({ sea: '#1A0B2E', land: '#2D1350', fills: ['#3A1466', '#2E1A5C', '#40125E', '#351A66', '#2B155A', '#3D1A6E'], coast: '#FF3CAC', border: '#00F0FF', borderW: 1, borderDash: [5, 4], text: '#F9C80E', halo: 'rgba(26,11,46,.85)', ink: '#FFFFFF', dots: '#00F0FF', dotGlow: true, grid: 'rgba(255,60,172,.18)', lines: '#F9C80E', glow: true, forceGrid: true }),
  satellite: () => ({ raster: 'satellite', sea: '#0A1C38', land: '#2F4A2A', coast: 'rgba(255,255,255,.18)', border: 'rgba(255,255,255,.7)', borderDash: [4, 3], text: '#EEF3FF', halo: 'rgba(0,0,0,.65)', ink: '#FFFFFF', dots: '#FFE08A', grid: 'rgba(255,255,255,.12)', lines: '#FFD166' }),
  terrain: () => ({ raster: 'terrain', sea: '#B8D3E2', land: '#E6E1C8', coast: 'rgba(60,80,90,.35)', border: '#7A5C8E', text: '#3B3F3A', halo: 'rgba(245,242,230,.9)', ink: '#1F2320', dots: '#5B4A3A', grid: 'rgba(0,0,0,.08)', lines: '#1D6FB8' }),
  outdoor: () => ({ raster: 'terrain', filter: 'saturate(1.35) brightness(1.07) contrast(1.06)', sea: '#9CCBE3', land: '#DCE9C4', coast: 'rgba(40,90,110,.45)', border: '#3F7A4F', borderW: 1.3, text: '#2E4A34', halo: 'rgba(240,248,236,.9)', ink: '#15261A', dots: '#2F5E3A', grid: 'rgba(0,0,0,.08)', lines: '#D9480F' }),
  midcentury: () => ({ raster: 'midcentury', sea: '#C9D8D2', land: '#E8DEC0', coast: 'rgba(90,70,50,.35)', border: '#9A5B3C', borderDash: [3, 3], text: '#5A4632', halo: 'rgba(240,232,210,.9)', ink: '#3A2A1A', dots: '#7A5A3A', grid: 'rgba(90,60,30,.12)', lines: '#B0413E', serif: true }),
};
const RASTERS = {};
function rasterImage(name, onReady) {
  let r = RASTERS[name];
  if (!r) { r = RASTERS[name] = { img: new Image(), ok: false, failed: false, waiters: new Set() }; r.img.onload = () => { r.ok = true; r.waiters.forEach(f => f()); }; r.img.onerror = () => { r.failed = true; }; r.img.src = 'maps/' + name + '.jpg'; }
  if (!r.ok && onReady) r.waiters.add(onReady);
  return r;
}
const mercY = la => Math.log(Math.tan(Math.PI / 4 + rad(Math.max(-85, Math.min(85, la))) / 2));
const invMercY = y => deg(2 * Math.atan(Math.exp(y)) - Math.PI / 2);

class MapView {
  constructor(canvas, cfg) {
    this.c = canvas; this.ctx = canvas.getContext('2d'); this.cfg = cfg; this.view = { lon: 10, y: 0.9, s: 900 }; this.W = 0; this.H = 0; this.anim = 0; this.hatch = null;
    new ResizeObserver(() => this.resize()).observe(canvas);
    let drag = null, moved = false;
    canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, lon: this.view.lon, vy: this.view.y }; moved = false; canvas.setPointerCapture(e.pointerId); cancelAnimationFrame(this.anim); });
    canvas.addEventListener('pointermove', e => {
      if (!drag) return;
      if (!moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4) { moved = true; canvas.classList.add('dragging'); }
      if (!moved) return;
      this.view.lon = drag.lon - deg((e.clientX - drag.x) / this.view.s); this.view.y = drag.vy + (e.clientY - drag.y) / this.view.s; this.draw();
    });
    canvas.addEventListener('pointerup', e => { if (drag && !moved && cfg.click) cfg.click(this.at(e)); drag = null; canvas.classList.remove('dragging'); });
    canvas.addEventListener('pointercancel', () => { drag = null; canvas.classList.remove('dragging'); });
    canvas.addEventListener('wheel', e => { e.preventDefault(); const r = canvas.getBoundingClientRect(); this.zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  }
  at(e) { const r = this.c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; return { x, y, lon: this.view.lon + deg((x - this.W / 2) / this.view.s), lat: invMercY(this.view.y - (y - this.H / 2) / this.view.s) }; }
  resize() {
    const r = this.c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1; this.W = r.width; this.H = r.height; if (!this.W || !this.H) return;
    this.c.width = Math.round(this.W * dpr); this.c.height = Math.round(this.H * dpr); this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.pendingFit) { const [b, pad, padR] = this.pendingFit; this.pendingFit = null; this.fit(b, true, pad, padR); } else this.draw();
  }
  wrap(lo) { let d = lo - this.view.lon; d = ((d + 540) % 360) - 180; return this.view.lon + d; }
  px(lo, la) { return [this.W / 2 + rad(this.wrap(lo) - this.view.lon) * this.view.s, this.H / 2 - (mercY(la) - this.view.y) * this.view.s]; }
  zoomAt(f, cx = this.W / 2, cy = this.H / 2) { const v = this.view, lon = v.lon + deg((cx - this.W / 2) / v.s), y = v.y - (cy - this.H / 2) / v.s; v.s = Math.max(100, Math.min(90000, v.s * f)); v.lon = lon - deg((cx - this.W / 2) / v.s); v.y = y + (cy - this.H / 2) / v.s; this.draw(); }
  fit(points, instant, pad = 56, padR = 56) {
    if (!points.length) return;
    if (!this.W || !this.H) { this.pendingFit = [points, pad, padR]; return; }
    const lon0 = points[0][1]; let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (const [la, lo] of points) { const x = lon0 + (((lo - lon0 + 540) % 360) - 180); minX = Math.min(minX, x); maxX = Math.max(maxX, x); const y = mercY(la); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    const sx = (this.W - pad - padR) / Math.max(1e-6, rad(maxX - minX)), sy = (this.H - pad * 2) / Math.max(1e-6, maxY - minY), s = Math.max(120, Math.min(60000, Math.min(sx, sy)));
    const target = { lon: (minX + maxX) / 2 + deg((padR - pad) / 2 / s), y: (minY + maxY) / 2, s };
    if (instant || matchMedia('(prefers-reduced-motion: reduce)').matches) { Object.assign(this.view, target); this.draw(); return; }
    const from = { ...this.view }, t0 = performance.now(), dl = ((target.lon - from.lon + 540) % 360) - 180; cancelAnimationFrame(this.anim);
    const step = now => { const k = Math.min(1, (now - t0) / 550), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; this.view.lon = from.lon + dl * e; this.view.y = from.y + (target.y - from.y) * e; this.view.s = Math.exp(Math.log(from.s) + (Math.log(target.s) - Math.log(from.s)) * e); this.draw(); if (k < 1) this.anim = requestAnimationFrame(step); };
    this.anim = requestAnimationFrame(step);
  }
  visible(p) {
    const v = this.view, lonSpan = deg(this.W / v.s), west = v.lon - lonSpan / 2 - 2, east = v.lon + lonSpan / 2 + 2, top = invMercY(v.y + this.H / 2 / v.s) + 2, bottom = invMercY(v.y - this.H / 2 / v.s) - 2;
    if (p.maxY < bottom || p.minY > top) return false;
    if (lonSpan < 300) { const c = this.wrap((p.minX + p.maxX) / 2), half = (p.maxX - p.minX) / 2; if (half < 170 && (c + half < west || c - half > east)) return false; }
    return true;
  }
  trace(list) {
    const ctx = this.ctx;
    for (const p of list) {
      if (!this.visible(p)) continue;
      const pts = p.pts; let lastX = null;
      for (let i = 0; i < pts.length; i += 2) { const [x, y] = this.px(pts[i], pts[i + 1]); if (i === 0 || (lastX !== null && Math.abs(x - lastX) > this.view.s * 3)) ctx.moveTo(x, y); else ctx.lineTo(x, y); lastX = x; }
    }
  }
  label(text, x, y, o = {}) {
    const ctx = this.ctx, pal = this.pal;
    ctx.font = `${o.weight || 600} ${o.size || 13}px ${o.family || (pal.serif ? 'Georgia, serif' : 'Barlow, sans-serif')}`; ctx.textAlign = o.align || 'left'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4; ctx.strokeStyle = pal.halo; ctx.lineJoin = 'round'; ctx.strokeText(text, x, y); ctx.fillStyle = o.color || pal.ink; ctx.fillText(text, x, y);
  }
  // an equirectangular world image drawn in thin horizontal strips, each stretched to its Mercator latitude band
  drawRaster(img, filter) {
    const ctx = this.ctx, W = this.W, H = this.H, v = this.view, iw = img.naturalWidth, ih = img.naturalHeight;
    const lonL = v.lon - deg(W / 2 / v.s), lonR = v.lon + deg(W / 2 / v.s);
    const sx0 = (lonL + 180) / 360 * iw, sx1 = (lonR + 180) / 360 * iw;
    if (filter) ctx.filter = filter;
    const step = 3;
    for (let y = 0; y < H; y += step) {
      const laTop = invMercY(v.y - (y - H / 2) / v.s), laBot = invMercY(v.y - (y + step - H / 2) / v.s);
      if (laBot > 85 || laTop < -85) continue;
      const syTop = (90 - laTop) / 180 * ih, syBot = (90 - laBot) / 180 * ih, sh = Math.max(0.5, syBot - syTop);
      for (let k = Math.floor(sx0 / iw); k <= Math.floor(sx1 / iw); k++) {
        const a = Math.max(sx0, k * iw), b = Math.min(sx1, (k + 1) * iw); if (b <= a) continue;
        const dx0 = (a - sx0) / (sx1 - sx0) * W, dx1 = (b - sx0) / (sx1 - sx0) * W;
        ctx.drawImage(img, a - k * iw, syTop, b - a, sh, dx0, y, dx1 - dx0 + 0.5, step + 0.5);
      }
    }
    ctx.filter = 'none';
  }
  draw() {
    if (!this.W || !this.H || !G) return;
    const ctx = this.ctx, W = this.W, H = this.H, cfg = this.cfg, style = cfg.style(), pal = this.pal = (PALETTES[style] || PALETTES.atlas)(), ov = cfg.overlays();
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = pal.sea; ctx.fillRect(0, 0, W, H);
    if (pal.seaTexture) { ctx.strokeStyle = 'rgba(122,90,54,.12)'; ctx.lineWidth = 1; ctx.beginPath(); for (let y = 6; y < H; y += 9) { ctx.moveTo(0, y); ctx.lineTo(W, y); } ctx.stroke(); }
    let rasterDrawn = false;
    if (pal.raster) {
      const r = rasterImage(pal.raster, () => this.draw());
      if (r.ok) { this.drawRaster(r.img, pal.filter); rasterDrawn = true; }
    }
    if (!rasterDrawn) { ctx.beginPath(); this.trace(G.land); ctx.fillStyle = pal.land; ctx.fill('evenodd'); }
    const tint = cfg.tint ? cfg.tint() : null;
    const fillOrder = G.drawLast.size ? [...G.shapes.keys()].filter(i => !G.drawLast.has(i)).concat([...G.drawLast]) : G.shapes.keys();
    if (pal.fills || tint) for (const ci of fillOrder) {
      const sh = G.shapes[ci]; if (!sh || !this.visible(sh)) continue;
      const color = tint ? tint(ci) : pal.fills[Math.max(0, G.colorIdx[ci])]; if (!color) continue;
      ctx.beginPath(); this.trace(sh.rings); ctx.fillStyle = color; ctx.fill('evenodd');
    }
    const avoid = cfg.avoid ? cfg.avoid() : null;
    if (avoid && avoid.size) {
      if (!this.hatch) { const pc = document.createElement('canvas'); pc.width = pc.height = 10; const p = pc.getContext('2d'); p.strokeStyle = 'rgba(30,30,30,.6)'; p.lineWidth = 2; p.beginPath(); p.moveTo(-2, 12); p.lineTo(12, -2); p.moveTo(-2, 2); p.lineTo(2, -2); p.moveTo(8, 12); p.lineTo(12, 8); p.stroke(); this.hatch = ctx.createPattern(pc, 'repeat'); }
      for (const ci of avoid) { const sh = G.shapes[ci]; if (!sh || !this.visible(sh)) continue; ctx.beginPath(); this.trace(sh.rings); ctx.fillStyle = 'rgba(120,120,120,.4)'; ctx.fill('evenodd'); ctx.fillStyle = this.hatch; ctx.fill('evenodd'); }
    }
    ctx.beginPath(); this.trace(G.land); ctx.strokeStyle = pal.coast; ctx.lineWidth = pal.glow ? 1.2 : 0.8; ctx.stroke();
    ctx.beginPath(); this.trace(G.border); ctx.setLineDash(pal.borderDash || [4, 3]); ctx.strokeStyle = pal.border; ctx.lineWidth = pal.borderW || 1; ctx.stroke(); ctx.setLineDash([]);
    // disputed territories: a red-orange dashed outline, labelled once you zoom in
    if (G.disputed.length) {
      ctx.beginPath(); this.trace(G.disputed); ctx.setLineDash([5, 3]); ctx.strokeStyle = pal.halo; ctx.lineWidth = 3.2; ctx.stroke();
      ctx.strokeStyle = pal.glow ? '#FF9F43' : '#D9480F'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
      const kmPx = R / this.view.s * Math.cos(rad(invMercY(this.view.y)));
      if (kmPx < 5 && ov.names !== false) { G.areaAnchors ||= G.areas.map((a, k) => { let best = -1; for (let i = 0; i < G.n; i++) if (G.area[i] === k + 1 && (best < 0 || G.pop[i] > G.pop[best])) best = i; return best; });
        G.areaAnchors.forEach((i, k) => { if (i < 0) return; const [x, y] = this.px(G.lon[i], G.lat[i]); if (x < 0 || y < 0 || x > W || y > H) return; this.label(G.areas[k][0] + ' · disputed', x, y + 16, { size: 11, weight: 700, align: 'center', color: pal.glow ? '#FF9F43' : '#B8400C' }); }); }
    }
    if (ov.grid || pal.forceGrid) {
      const v = this.view, span = deg(W / v.s), stepDeg = span > 120 ? 30 : span > 50 ? 10 : span > 12 ? 5 : 1;
      ctx.strokeStyle = pal.grid; ctx.lineWidth = 1; ctx.beginPath();
      for (let lo = Math.floor((v.lon - span / 2) / stepDeg) * stepDeg; lo <= v.lon + span / 2; lo += stepDeg) { const [x] = this.px(lo, 0); ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (let la = -80; la <= 80; la += stepDeg) { const [, y] = this.px(v.lon, la); if (y > 0 && y < H) { ctx.moveTo(0, y); ctx.lineTo(W, y); } }
      ctx.stroke();
    }
    if (ov.lines) for (const [la, nm] of [[0, 'Equator'], [23.44, 'Tropic of Cancer'], [-23.44, 'Tropic of Capricorn'], [66.56, 'Arctic Circle'], [-66.56, 'Antarctic Circle']]) {
      const [, y] = this.px(this.view.lon, la); if (y < 0 || y > H) continue;
      ctx.setLineDash(la === 0 ? [10, 6] : [4, 6]); ctx.strokeStyle = pal.lines; ctx.globalAlpha = 0.65; ctx.lineWidth = la === 0 ? 1.8 : 1.2; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); ctx.globalAlpha = 1; ctx.setLineDash([]);
      this.label(nm, 10, y - 9, { size: 11, color: pal.lines });
    }
    const kmPerPx = R / this.view.s * Math.cos(rad(invMercY(this.view.y)));
    if (ov.towns) { // unlabeled dots: never names, so they don't give answers away
      const minPop = kmPerPx > 6 ? 1e6 : kmPerPx > 3 ? 500000 : kmPerPx > 1.5 ? 150000 : kmPerPx > 0.7 ? 50000 : 15000;
      ctx.fillStyle = pal.dots; if (pal.dotGlow) { ctx.shadowColor = pal.dots; ctx.shadowBlur = 6; }
      for (let i = 0; i < G.n && G.pop[i] >= minPop; i++) { const [x, y] = this.px(G.lon[i], G.lat[i]); if (x < -5 || y < -5 || x > W + 5 || y > H + 5) continue; ctx.beginPath(); ctx.arc(x, y, G.pop[i] >= 1e6 ? 2.6 : 1.8, 0, 7); ctx.fill(); }
      ctx.shadowBlur = 0;
    }
    if (ov.names) {
      const placed = []; ctx.font = `600 12px ${pal.serif ? 'Georgia, serif' : '"Barlow Condensed", sans-serif'}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const a of G.anchors) {
        const [x, y] = this.px(a.lon, a.lat); if (x < 30 || y < 12 || x > W - 30 || y > H - 12) continue;
        const t = G.countries[a.i][1].toUpperCase(), w = ctx.measureText(t).width + 14;
        if (placed.some(p => Math.abs(p[0] - x) < (p[2] + w) / 2 && Math.abs(p[1] - y) < 16)) continue;
        placed.push([x, y, w]); ctx.fillStyle = pal.text; ctx.globalAlpha = 0.6; ctx.fillText(t, x, y); ctx.globalAlpha = 1;
        if (placed.length > 45) break;
      }
    }
    if (cfg.layer) cfg.layer(this, ctx, pal);
  }
}
function zoomToCountry(map, ci, instant) { const sh = G.shapes[ci]; if (!sh) return; const m = sh.main; map.fit([[m.minY, m.minX], [m.maxY, m.maxX]], instant, 40, 40); }

// ================= trip map =================
const routeColor = () => (ROUTES.find(r => r.id === P.equip.route) || ROUTES[0]).color;
const masteryTint = () => { const k = countryKnowledge(); return ci => { const lv = masteryLevel(k[ci]); return lv ? MASTERY[lv].color + '66' : null; }; };
let flashUntil = 0;
const tripMap = new MapView($('map'), {
  style: () => (S && S.classic) ? 'atlas' : P.equip.style,
  overlays: () => (S && S.classic) ? { names: true, towns: true } : P.overlays,
  avoid: () => (S && G) ? tripAvoid() : null,
  tint: () => (!S || S.classic || !(P.overlays.mastery || P.equip.style === 'relief')) ? null : masteryTint(),
  layer: (m, ctx, pal) => {
    if (!S) return;
    const rc = pal.glow ? '#FF5C8A' : routeColor();
    const gc = (a, b, seg = 40) => { const out = []; for (let i = 0; i <= seg; i++) { const [la, lo] = interp(G.lat[a], G.lon[a], G.lat[b], G.lon[b], i / seg); out.push(m.px(lo, la)); } return out; };
    const stroke = (pts, color, w, dash = []) => { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.setLineDash(dash); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke(); ctx.setLineDash([]); };
    const labels = [];
    const tryLabel = (text, x, y, o) => { ctx.font = `${o.weight || 600} ${o.size || 12}px Barlow, sans-serif`; const w = ctx.measureText(text).width, bx = x, by = y - 8; if (labels.some(l => bx < l[0] + l[2] && bx + w > l[0] && by < l[1] + 16 && by + 16 > l[1])) return; labels.push([bx, by, w]); m.label(text, x, y, o); };
    if (!S.done) {
      const ring = []; for (let b = 0; b <= 360; b += 4) { const [la, lo] = destPoint(G.lat[S.cur], G.lon[S.cur], b, Math.max(1, S.fuel)); ring.push(m.px(lo, la)); }
      ctx.beginPath(); ring.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
      const flashing = performance.now() < flashUntil;
      ctx.fillStyle = flashing ? 'rgba(196,43,43,.14)' : pal.glow ? 'rgba(245,195,91,.08)' : 'rgba(29,111,184,.10)'; ctx.fill();
      ctx.setLineDash([7, 5]); ctx.strokeStyle = flashing ? '#C42B2B' : pal.lines; ctx.lineWidth = 1.6; ctx.stroke(); ctx.setLineDash([]);
    }
    let prev = S.start;
    if (pal.glow) { ctx.shadowColor = rc; ctx.shadowBlur = 10; }
    const legPts = (path, a, b) => path ? path.map(([la, lo]) => m.px(lo, la)) : gc(a, b);
    for (const s of S.stops) { const pts = legPts(s.path, prev, s.id); if (s.kind === 'train') { stroke(pts, pal.halo, 7); stroke(pts, '#2B2B2B', 4); stroke(pts, '#FFFFFF', 2, [6, 6]); }
      else if (s.kind === 'flight') { stroke(pts, pal.halo, 5); stroke(pts, '#8A3FFC', 2.5, [2, 5]); const mid = pts[Math.floor(pts.length / 2)]; ctx.font = '16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✈', mid[0], mid[1]); }
      else if (s.kind === 'ferry') stroke(pts, '#5AAAE8', 3, [8, 6]); else strokeTrail(ctx, pts, rc, pal, stroke); prev = s.id; }
    ctx.shadowBlur = 0;
    if (!S.done) { const ahead = [S.cur, ...viaLeft(), S.dest]; for (let i = 1; i < ahead.length; i++) stroke(gc(ahead[i - 1], ahead[i], 60), pal.text, 1, [2, 6]); }
    // checkpoints: a diamond on each place the trip has to pass through
    (S.via || []).forEach((id, k) => {
      const [x, y] = m.px(G.lon[id], G.lat[id]), passed = S.stops.some(s => s.id === id);
      ctx.beginPath(); ctx.moveTo(x, y - 11); ctx.lineTo(x + 11, y); ctx.lineTo(x, y + 11); ctx.lineTo(x - 11, y); ctx.closePath();
      ctx.fillStyle = passed ? pal.land : '#E07A10'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = passed ? '#E07A10' : pal.halo; ctx.stroke();
      ctx.fillStyle = passed ? '#B85E00' : '#FFFFFF'; ctx.font = '700 12px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(passed ? '✓' : String(k + 1), x, y + 1);
      tryLabel(G.name[id], x + 15, y, { size: 13, weight: 700, color: pal.glow ? '#FFB86B' : '#B85E00' });
    });
    // the route you could have taken, drawn so you can learn it
    if (S.rescue && ((S.done && S.gaveUp) || S.showRoute)) {
      for (let i = 1; i < S.rescue.length; i++) { const pts = legPts(S.rescuePaths && S.rescuePaths[i - 1], S.rescue[i - 1], S.rescue[i]); stroke(pts, pal.halo, 7); stroke(pts, '#12A150', 3.5, [9, 5]); }
      S.rescue.slice(1, -1).forEach((id, i) => {
        const [x, y] = m.px(G.lon[id], G.lat[id]);
        ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fillStyle = '#12A150'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = pal.halo; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = '700 11px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), x, y + 1);
        tryLabel(G.name[id], x + 12, y, { size: 13, weight: 700, color: pal.glow ? '#7CF0A8' : '#0E7A3C' });
      });
    }
    for (const s of S.stops) { if (s.id === S.dest) continue; const [x, y] = m.px(G.lon[s.id], G.lat[s.id]); ctx.beginPath(); ctx.arc(x, y, 4.5, 0, 7); ctx.fillStyle = pal.land; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = rc; ctx.stroke(); tryLabel(G.name[s.id], x + (s.id === S.cur ? 20 : 8), y - 1, { size: 12 }); }
    drawWantedPins(m, ctx, pal);
    hintIds.forEach((id, i) => { const [x, y] = m.px(G.lon[id], G.lat[id]); ctx.beginPath(); ctx.arc(x, y, 10, 0, 7); ctx.fillStyle = '#1D6FB8'; ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '700 13px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), x, y + 1); });
    { const [x, y] = m.px(G.lon[S.start], G.lat[S.start]); ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.fillStyle = rc; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = pal.land; ctx.stroke(); tryLabel(G.name[S.start], x + (S.cur === S.start ? 20 : 10), y, { size: 14, weight: 700 }); }
    { const [x, y] = m.px(G.lon[S.dest], G.lat[S.dest]); ctx.fillStyle = '#0B6B3A'; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x - 9, y - 9, 18, 18, 4); else ctx.rect(x - 9, y - 9, 18, 18); ctx.fill(); ctx.fillStyle = '#fff'; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if ((i + j) % 2 === 0) ctx.fillRect(x - 6 + i * 4, y - 6 + j * 4, 4, 4); m.label(G.name[S.dest].toUpperCase(), x + 14, y, { size: 16, weight: 800, family: '"Barlow Condensed", sans-serif', color: pal.glow ? '#7CF0A8' : '#0B6B3A' }); }
    if (HOOKS.mapLayer) HOOKS.mapLayer(m, ctx, pal, tryLabel);
    // your vehicle (see garage.js): it glides along each new leg, and stays on the map until the last glide lands
    if (!S.done || S.cur !== S.dest || (GLIDE.self && performance.now() < GLIDE.self.end)) drawSelf(m, ctx, pal); else drawParts(m, ctx);
  },
});
function tripBounds() {
  if (!S || !G) return [];
  const ids = [S.start, S.dest, S.cur, ...(S.via || []), ...S.stops.map(s => s.id), ...hintIds, ...(S.done && S.rescue ? S.rescue : [])];
  const pts = ids.map(id => [G.lat[id], G.lon[id]]);
  if (!S.done) for (let b = 0; b < 360; b += 45) pts.push(destPoint(G.lat[S.cur], G.lon[S.cur], b, Math.max(40, S.fuel)));
  return pts;
}
function flashRange() { flashUntil = performance.now() + 900; tripMap.draw(); setTimeout(() => tripMap.draw(), 950); }
$('zoom-in').onclick = () => tripMap.zoomAt(1.5);
$('zoom-out').onclick = () => tripMap.zoomAt(1 / 1.5);
$('recenter').onclick = () => tripMap.fit(tripBounds(), false, 56, 130);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => tripMap.draw());
new MutationObserver(() => tripMap.draw()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
function applyCosmetics() {
  const c = CURSORS.find(x => x.id === P.equip.cursor);
  const css = c && c.emoji ? `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32'><text x='3' y='24' font-size='22'>${c.emoji}</text></svg>`)}") 6 6, crosshair` : '';
  document.querySelectorAll('.mapwrap canvas').forEach(el => { el.style.cursor = css; });
  document.documentElement.style.setProperty('--route', routeColor());
}
function renderLayers() {
  const owned = Object.keys(STYLES).filter(k => P.owned.includes('style:' + k)), classic = S && S.classic;
  $('layerpanel').innerHTML = `
    <div class="label">Map style</div>
    <select class="field" id="lay-style" aria-label="Map style" ${classic ? 'disabled' : ''}>${owned.map(k => `<option value="${k}" ${P.equip.style === k ? 'selected' : ''}>${STYLES[k].name}</option>`).join('')}</select>
    <span class="hint">${Object.keys(STYLES).length - owned.length ? `${Object.keys(STYLES).length - owned.length} more styles in the shop` : 'You own every style'}</span>
    <div class="label" style="margin-top:6px">Overlays</div>
    ${[['names', 'Country names'], ['towns', 'Town dots (never named)'], ['grid', 'Latitude and longitude grid'], ['lines', 'Equator, tropics, polar circles'], ['mastery', 'Mastery tint']].map(([k, l]) => `<label><input type="checkbox" data-ov="${k}" ${P.overlays[k] ? 'checked' : ''} ${classic ? 'disabled' : ''}> ${l}</label>`).join('')}
    ${classic ? '<span class="hint">Classic rules use the original map.</span>' : ''}`;
  if ($('lay-style')) $('lay-style').onchange = e => { P.equip.style = e.target.value; saveProfile(); tripMap.draw(); };
  $('layerpanel').querySelectorAll('[data-ov]').forEach(cb => cb.onchange = () => { P.overlays[cb.dataset.ov] = cb.checked; saveProfile(); tripMap.draw(); });
}
$('layers-btn').onclick = () => { const p = $('layerpanel'); p.hidden = !p.hidden; $('layers-btn').setAttribute('aria-expanded', String(!p.hidden)); if (!p.hidden) renderLayers(); };
