// scripts/e2e/dispatchFlow.mjs  (dueño: P1)
// Flujo del despachador del Sprint 4 como usuario, en escritorio (1280 px) y con datos de prueba:
// importar pedidos-prueba-100.xlsx → revisar una ubicación → optimizar el día, y revisa las reglas
// de negocio en los datos guardados (capacidad, línea blanca, motivos de sin asignar).
// Uso: npm run e2e:despacho -- [url]   (por defecto la vista previa del Sprint 4). Capturas en .e2e/despacho/
import { join } from 'node:path';
import { openPhone, root, sleep } from './phone.mjs';

const BASE = (process.argv[2] ?? 'https://trazza-web--sprint4-sxws7bh3.web.app').replace(/\/$/, '');
const FILE = join(root, 'assets', 'pedidos-prueba-100.xlsx');
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

const mocks = () => evaluate(`JSON.parse(localStorage.getItem('siman-logistica:mocks:v2') || 'null')`);

console.log(`Flujo del despachador en ${BASE} (1280 px)`);
let failed = false;
try {
  await step('abre Importar pedidos con datos de prueba limpios', async () => {
    await send('Page.navigate', { url: `${BASE}/despacho` });
    await waitFor('Centro de despacho');
    await evaluate(`localStorage.removeItem('siman-logistica:mocks:v2')`);
    await send('Page.navigate', { url: `${BASE}/despacho/importar` });
    await waitFor('Descargar plantilla', 'paso Subir');
  });

  await step('sube el Excel: 96 para cargar y 4 con error', async () => {
    const { root: docRoot } = await send('DOM.getDocument', { depth: -1 }).then((r) => r.result);
    const { nodeId } = (await send('DOM.querySelector', { nodeId: docRoot.nodeId, selector: 'input[type=file]' }))
      .result;
    await send('DOM.setFileInputFiles', { nodeId, files: [FILE] });
    await waitFor(/Con error/, 'resumen', 30000);
    await waitFor(/Continuar/, 'ubicación terminada', 60000);
    await screenshot('revisar');
    await tap('Continuar');
    await waitFor(/Cargar 96 pedidos/, 'botón de carga');
    await waitFor(/4 con error no se cargan/);
  });

  await step('carga los 96 pedidos y ofrece revisar 15 ubicaciones', async () => {
    await tap('Cargar 96 pedidos');
    await waitFor(/Revisar 15 direcciones/, 'resultado', 30000);
    const db = await mocks();
    const imported = db.collections.shipments.filter((s) => s.orderNumber?.startsWith('WEB-9'));
    if (imported.length !== 96) throw new Error(`se guardaron ${imported.length} pedidos, no 96`);
    await screenshot('cargado');
  });

  await step('confirma una ubicación y quedan 14', async () => {
    await tap('Revisar 15 direcciones');
    await waitFor(/Quedan 15/);
    await tap('Confirmar ubicación');
    await waitFor(/Quedan 14/, 'contador', 15000);
    const db = await mocks();
    if (!db.collections.shipments.some((s) => s.location?.source === 'despacho'))
      throw new Error('ninguna ubicación quedó confirmada por el despacho');
    await screenshot('ubicaciones');
  });

  await step('optimiza el día: rutas por zona y sin asignar con motivo', async () => {
    await send('Page.navigate', { url: `${BASE}/despacho` }); // recarga: los datos siguen en el navegador
    await waitFor(/Optimizar día/);
    await tap('Mañana'); // los pedidos del Excel son de mañana
    await sleep(800);
    await tap('Optimizar día');
    await waitFor(/\d+ rutas? listas?/, 'resumen de la optimización', 60000);
    await sleep(800);
    await screenshot('optimizado');
  });

  await step('el resumen y el panel cuentan los mismos sin asignar', async () => {
    const text = await evaluate('document.body.innerText');
    const summary = Number(text.match(/(\d+) sin asignar/)?.[1]);
    const panel = Number(text.match(/Sin asignar \((\d+)\)/)?.[1]);
    if (summary !== panel) throw new Error(`el resumen dice ${summary} y el panel ${panel}`);
  });

  await step('reglas: nada sobre capacidad, ninguna línea blanca en moto, motivos válidos', async () => {
    const db = await mocks();
    const { shipments, routes, vehicles, drivers } = db.collections;
    const date = shipments.find((s) => s.orderNumber?.startsWith('WEB-9')).scheduledDate;
    const dayRoutes = routes.filter((r) => r.date === date);
    if (!dayRoutes.length) throw new Error(`no hay rutas para el ${date}`);
    const byId = Object.fromEntries(shipments.map((s) => [s.id, s]));
    for (const r of dayRoutes) {
      const vehicle = vehicles.find(
        (v) => v.id === (r.vehicleId ?? drivers.find((d) => d.id === r.driverId)?.vehicleId),
      );
      const load = r.stops.reduce((kg, st) => kg + (byId[st.shipmentId]?.weightKg ?? 0), 0);
      if (vehicle && load > vehicle.maxKg) throw new Error(`${r.id}: ${load} kg en un vehículo de ${vehicle.maxKg}`);
      const big = r.stops.filter((st) => byId[st.shipmentId]?.requires?.includes('carga_grande'));
      if (big.length && !vehicle?.capabilities?.includes('carga_grande'))
        throw new Error(`${r.id}: línea blanca en ${vehicle?.label ?? 'un vehículo sin carga grande'}`);
      if (r.stops.some((st) => byId[st.shipmentId]?.location?.status === 'revisar'))
        throw new Error(`${r.id}: entró un pedido con ubicación por revisar`);
    }
    const reasons = ['capacidad', 'ventana', 'requisito', 'sin_ubicacion'];
    const left = shipments.filter((s) => s.scheduledDate === date && s.status === 'pendiente' && s.unassignedReason);
    if (left.some((s) => !reasons.includes(s.unassignedReason)))
      throw new Error('hay un motivo de sin asignar desconocido');
    const engines = [...new Set(dayRoutes.map((r) => r.engine))].join(', ');
    console.log(`    ${dayRoutes.length} rutas (${engines}) · ${left.length} sin asignar con motivo`);
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
