import http from 'node:http'; import fs from 'node:fs';
http.createServer((req, res) => {
  if (req.url.startsWith('/flags/') || req.url.startsWith('/maps/') || req.url.startsWith('/rail.json') || req.url.startsWith('/covers.json')) { const f = new URL('./dist' + req.url.split('?')[0], import.meta.url); if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': req.url.endsWith('.json') ? 'application/json' : 'image/jpeg' }); res.end(fs.readFileSync(f)); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>${fs.readFileSync(new URL('./dist/stopover.html', import.meta.url), 'utf8')}</body></html>`);
}).listen(+process.env.PORT || 4178);
