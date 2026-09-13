// Loopback-only static preview. Never serve dotfiles or server-side sources.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const port = Number(process.argv[2] || 3000);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let file;
  try { file = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname).slice(1) || 'index.html'; }
  catch (_) { res.writeHead(400); res.end(); return; }
  const allowed = /^(index\.html|manifest\.json|icon\.svg|sw\.js)$/.test(file) ||
    /^(js|css)\/[a-zA-Z0-9_./-]+\.(js|css)$/.test(file) ||
    /^tests\/(tax-practice-demo|workspace-demo)\.js$/.test(file) ||
    /^work\/tax-bank\/tax-(question|subjective)-bank\.publishable\.json$/.test(file) ||
    /^work\/tax-advisor-bank\/tax-law-(i|ii)\.publishable\.json$/.test(file);
  if (!allowed || file.split('/').some(part => part.startsWith('.'))) { res.writeHead(404); res.end(); return; }
  const absolute = path.resolve(root, file);
  if (!absolute.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(absolute, (error, data) => {
    if (error) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});
server.listen(port, '127.0.0.1', () => console.log('Local preview: http://127.0.0.1:' + port + '/?taxDemo=1&workspacePreview=1'));
