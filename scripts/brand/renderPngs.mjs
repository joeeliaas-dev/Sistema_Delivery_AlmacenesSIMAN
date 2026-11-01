// scripts/brand/renderPngs.mjs  (dueño: P1)
// Convierte la marca SVG en los PNG que pide app.json, con Chrome por CDP (sin paquetes).
// Uso: node scripts/brand/renderPngs.mjs
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const mark = readFileSync(join(root, 'assets/brand/trazza-mark.svg'), 'utf8');
// Solo el dibujo, sin el fondo: para el ícono adaptable y el monocromo de Android
const glyph = (color) =>
  mark
    .replace(/<rect[^>]*\/>/, '')
    .replace(/<circle cx="860"[^>]*\/>/, '')
    .replaceAll('#FFFFFF', color)
    .replace('#5B4A9C', color === '#FFFFFF' ? '#5B4A9C' : '#00000000')
    .replace('#FBDDF0', color)
    .replace('#9A5B8A', color === '#FFFFFF' ? '#9A5B8A' : '#00000000');
// En el ícono adaptable el dibujo va dentro del 66 % central (zona segura de Android)
const inset = (svg) => svg.replace('viewBox="0 0 1024 1024"', 'viewBox="-264 -264 1552 1552"');

const OUT = [
  // iOS aplica su propia máscara redondeada: el ícono va de borde a borde, sin transparencia
  { file: 'icon.png', size: 1024, svg: mark.replace('rx="232"', 'rx="0"') },
  { file: 'favicon.png', size: 64, svg: mark },
  { file: 'splash-icon.png', size: 1024, svg: mark },
  { file: 'android-icon-foreground.png', size: 1024, svg: inset(glyph('#FFFFFF')) },
  { file: 'android-icon-monochrome.png', size: 1024, svg: inset(glyph('#000000')) },
  {
    file: 'android-icon-background.png',
    size: 1024,
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7A68B8"/><stop offset="1" stop-color="#4A3A86"/></linearGradient></defs><rect width="1024" height="1024" fill="url(#bg)"/></svg>',
  },
];

const CHROME = process.env.CHROME_PATH ?? ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find(existsSync);
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'brand-'))}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try {
    target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page');
  } catch {
    // arrancando
  }
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) pending.get(m.id)(m) || pending.delete(m.id);
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });

await send('Page.enable');
await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
for (const { file, size, svg } of OUT) {
  await send('Emulation.setDeviceMetricsOverride', { width: size, height: size, deviceScaleFactor: 1, mobile: false });
  const html = `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`;
  await send('Page.navigate', { url: `data:text/html;base64,${Buffer.from(html).toString('base64')}` });
  await sleep(400);
  const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: size, height: size, scale: 1 } });
  writeFileSync(join(root, 'assets', file), Buffer.from(shot.result.data, 'base64'));
  console.log(`assets/${file} (${size}px)`);
}
ws.close();
chrome.kill();
process.exit(0);
