// Read-only local preview. No database, authentication mutations, or outbound calls.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const publicFiles = new Set(['admin.html','owner-dashboard.js','index.html','app.js','styles.css','firebase-config.js','patient.html','patient.js','patient.css','commerce.js','commerce.css','commerce-config.js','i18n.js','i18n-catalog.js']);
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8' };
http.createServer((req,res) => {
  const file = new URL(req.url,'http://localhost').pathname.slice(1) || 'index.html';
  if (!publicFiles.has(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type':types[path.extname(file)], 'Cache-Control':'no-store' });
  fs.createReadStream(path.resolve(__dirname,'..',file)).pipe(res);
}).listen(Number(process.argv[2]) || 3033,'127.0.0.1', () => console.log('Read-only preview ready'));
