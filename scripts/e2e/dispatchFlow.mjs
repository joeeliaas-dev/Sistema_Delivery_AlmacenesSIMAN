// scripts/e2e/dispatchFlow.mjs  (dueño: P1)
// Flujo del despachador como usuario, en escritorio (1280 px) y con datos de prueba: optimizar el día
// con Geoapify (una ruta por zona) y revisar las reglas en los datos guardados (paradas y motivos).
// Uso: npm run e2e:despacho -- <url>. Capturas en .e2e/despacho/
import { join } from 'node:path';
import { openPhone, root, sleep } from './phone.mjs';

const BASE = (process.argv[2] ?? 'http://localhost:8090').replace(/\/$/, '');
const phone = await openPhone({ width: 1280, height: 900, out: join(root, '.e2e', 'despacho') });
const { send, evaluate, waitFor, tap, screenshot, consoleErrors } = phone;

const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push(true);
    console.log(`  ✓ ${name}`);
  } catch (err) {
    results.push(false);
    console.log(`  ✗ ${name}: ${err.message}`);
    await screenshot(`FALLO-${name.replace(/[^a-z0-9]+/gi, '-')}`);
    throw err;
  }
}

const mocks = () => evaluate(`JSON.parse(localStorage.getItem('siman-logistica:mocks:v3') || 'null')`);

console.log(`Flujo del despachador en ${BASE} (1280 px)`);
let failed = false;
try {
  await step('abre el Centro de despacho con datos de prueba limpios', async () => {
    await send('Page.navigate', { url: `${BASE}/despacho` });
    await waitFor('Centro de despacho');
    await evaluate(`localStorage.removeItem('siman-logistica:mocks:v3')`);
    await send('Page.navigate', { url: `${BASE}/despacho` });
    await waitFor(/Optimizar día/);
  });

  await step('optimiza el día: una ruta por zona y sin asignar con motivo', async () => {
    await tap('Optimizar día');
    await waitFor(/Se crearon \d+ rutas?|No se creó ninguna ruta/, 'resumen de la optimización', 60000);
    await sleep(800);
    await screenshot('optimizado');
  });

  await step('el resumen y el panel cuentan los mismos sin asignar', async () => {
    const text = await evaluate('document.body.innerText');
    const summary = Number(text.match(/(\d+) sin asignar/)?.[1]);
    const panel = Number(text.match(/Sin asignar \((\d+)\)/)?.[1]);
    if (summary !== panel) throw new Error(`el resumen dice ${summary} y el panel ${panel}`);
  });

  await step('reglas: una ruta por zona, máximo 25 paradas, motivos válidos', async () => {
    const db = await mocks();
    const { shipments, routes } = db.collections;
    const date = new Date().toLocaleDateString('en-CA');
    const dayRoutes = routes.filter((r) => r.date === date);
    if (!dayRoutes.length) throw new Error(`no hay rutas para el ${date}`);
    const zones = dayRoutes.map((r) => r.zoneId);
    if (new Set(zones).size !== zones.length) throw new Error('hay una zona con dos rutas');
    for (const r of dayRoutes) if (r.stops.length > 25) throw new Error(`${r.id}: ${r.stops.length} paradas`);
    const reasons = ['capacidad', 'ventana', 'sin_ubicacion'];
    const left = shipments.filter((s) => s.status === 'pendiente' && s.unassignedReason);
    if (left.some((s) => !reasons.includes(s.unassignedReason)))
      throw new Error('hay un motivo de sin asignar desconocido');
    console.log(`    ${dayRoutes.length} rutas · ${left.length} sin asignar con motivo`);
  });
} catch {
  failed = true;
}

const errors = consoleErrors.filter((e) => e && !/favicon|DevTools/.test(e));
console.log(
  `\n${results.filter(Boolean).length}/${results.length} pasos · errores en consola: ${errors.length} · capturas en .e2e/despacho/`,
);
errors.slice(0, 5).forEach((e) => console.log(`  consola: ${String(e).slice(0, 200)}`));
phone.close();
process.exit(failed || errors.length ? 1 : 0);
