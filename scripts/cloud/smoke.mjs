// scripts/cloud/smoke.mjs  (dueño: P1)
// Chequeo de humo de una versión publicada: abre el despacho y el motorista como un usuario (360 y
// 1280 px) y falla si una pantalla no pinta en 40 s o hay errores en la consola. Solo lee: no toca botones.
// Con login (C48) entra por la pantalla de entrada: el despachador para el despacho y Kevin para el
// motorista, con TRAZZA_CLAVE_CUENTAS de .env.local (en el link de prueba, la sesión local de prueba).
// Uso: node scripts/cloud/smoke.mjs [url=https://trazzasv.web.app]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openPhone, root } from '../e2e/phone.mjs';

const BASE = (process.argv[2] ?? 'https://trazzasv.web.app').replace(/\/$/, '');
const ACCOUNTS = JSON.parse(readFileSync(join(root, 'src/lib/demoAccounts.json'), 'utf8'));
const email = (key) => ACCOUNTS.find((a) => a.key === key).email;
let PASSWORD = 'trazza-prueba';
try {
  PASSWORD = /^TRAZZA_CLAVE_CUENTAS=(.+)$/m.exec(readFileSync(join(root, '.env.local'), 'utf8'))?.[1]?.trim() ?? PASSWORD;
} catch {
  // sin .env.local: solo sirve para el link de prueba
}
const CHECKS = [
  { path: '/despacho', width: 1280, expect: 'Centro de despacho', account: 'despacho' },
  { path: '/despacho', width: 360, expect: 'Centro de despacho', account: 'despacho' },
  { path: '/motorista', width: 360, expect: 'Kevin', account: 'kevin' },
];

let bad = 0;
console.log(`Chequeo de humo en ${BASE}`);
for (const c of CHECKS) {
  const phone = await openPhone({ width: c.width, out: join(root, '.e2e', 'smoke'), session: email(c.account) });
  await phone.send('Page.addScriptToEvaluateOnNewDocument', {
    source: "window.__errs=[];addEventListener('error',e=>window.__errs.push(e.message),true);",
  });
  const t0 = Date.now();
  await phone.send('Page.navigate', { url: `${BASE}${c.path}?humo=${t0}` });
  let ms = null;
  try {
    await phone.signInIfAsked(email(c.account), PASSWORD, 40000);
  } catch {
    // si no pudo entrar, el chequeo de abajo lo reporta
  }
  while (Date.now() - t0 < 40000) {
    if (await phone.evaluate(`!!document.body && document.body.innerText.includes(${JSON.stringify(c.expect)})`)) {
      ms = Date.now() - t0;
      break;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  await new Promise((r) => setTimeout(r, 3000)); // que terminen de llegar los datos
  const errors = [...(JSON.parse((await phone.evaluate('JSON.stringify(window.__errs)')) || '[]')), ...phone.consoleErrors];
  const ok = ms != null && !errors.length;
  if (!ok) bad += 1;
  console.log(
    `  ${ok ? '✓' : '✗'} ${c.path} a ${c.width} px: ${ms == null ? 'no pintó en 40 s' : `pintó en ${(ms / 1000).toFixed(1)} s`}` +
      (errors.length ? ` · errores: ${errors.slice(0, 2).join(' | ').slice(0, 200)}` : ''),
  );
  await phone.screenshot(`${c.path.slice(1)}-${c.width}`);
  phone.close();
}
console.log(bad ? `\n${bad} problema(s)` : '\nTodo pinta y sin errores de consola');
process.exit(bad ? 1 : 0);
