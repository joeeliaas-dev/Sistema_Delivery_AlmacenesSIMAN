import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
const dir = resolve(process.argv[2] ?? 'dist');
const port = Number(process.argv[3] ?? 8090);
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
  '.css': 'text/css',
};
createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  let file = join(dir, path);
  if (!file.startsWith(dir) || !existsSync(file) || statSync(file).isDirectory()) file = join(dir, 'index.html');
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
  });
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`Sirviendo ${dir} en http://localhost:${port}`));
