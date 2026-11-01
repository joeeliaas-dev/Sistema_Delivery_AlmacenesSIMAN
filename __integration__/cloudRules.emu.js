// __integration__/cloudRules.emu.js  (dueño: P1)
// Las escrituras LEGÍTIMAS del despachador y del motorista deben pasar con las reglas de la NUBE
// (firestore.cloud.rules). Carga esas reglas en el emulador (después del seed, que necesita las abiertas),
// corre el flujo y al final restaura firestore.rules.
// Lo prohibido lo comprueba npm run check:cloud contra la nube real.
import { readFileSync } from 'node:fs';
import { collection, doc, getDocs, terminate, updateDoc } from 'firebase/firestore';
import { db } from '../src/lib/firebase';
import { todayISO } from '../src/lib/dates';
import { carryOverRetries } from '../src/features/shipments/carryOver';
import { changeStatus } from '../src/features/shipments/statusMachine';
import { getShipment } from '../src/features/shipments/shipmentsService';
import { moveStop, optimizeAndSaveDay, startRoute } from '../src/features/routes/routesService';

const RULES_URL = `http://127.0.0.1:8080/emulator/v1/projects/${process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID}:securityRules`;
const loadRules = async (file) => {
  const content = readFileSync(require.resolve(`../${file}`), 'utf8');
  const res = await fetch(RULES_URL, {
    method: 'PUT',
    body: JSON.stringify({ rules: { files: [{ name: file, content }] } }),
  });
  if (!res.ok) throw new Error(`No se pudieron cargar ${file}: ${res.status} ${await res.text()}`);
};

const date = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return todayISO(d);
})();

beforeAll(async () => {
  require('./reseed')();
  await loadRules('firestore.cloud.rules');
}, 60000);
afterAll(async () => {
  await loadRules('firestore.rules');
  await terminate(db);
});

test('turno del motorista', async () => {
  await updateDoc(doc(db, 'drivers', 'D1'), { shiftStart: '07:00', shiftEnd: '17:00' });
});

test('traer reintentos (reprogramar)', async () => {
  expect(await carryOverRetries(date)).toEqual({ moved: 2 });
});

let started;
test('optimizar el día y mover una parada', async () => {
  const res = await optimizeAndSaveDay(todayISO()); // los pedidos del seed son de hoy
  expect(res.routeIds.length).toBeGreaterThan(1);
  const [from, to] = res.routeIds;
  const routes = (await getDocs(collection(db, 'routes'))).docs.map((d) => ({ id: d.id, ...d.data() }));
  const moved = routes.find((r) => r.id === from).stops[0].shipmentId;
  await moveStop(moved, to);
  expect(await getShipment(moved)).toMatchObject({ status: 'asignado', routeId: to });
  started = to;
}, 60000);

test('el motorista inicia la ruta y entrega', async () => {
  const route = await new Promise((resolve) => {
    const stop = require('../src/features/routes/routesService').listenRoute(started, (r) => {
      resolve(r);
      setTimeout(() => stop?.());
    });
  });
  await startRoute(started, route.driverId);
  const first = await getShipment(route.stops[0].shipmentId);
  const res = await changeStatus({
    shipment: first,
    to: 'entregado',
    payload: {
      photoUri: 'file:///f.jpg',
      signatureBase64: 'data:image/png;base64,AA',
      description: 'Recibió el cliente',
    },
    driverId: route.driverId,
  });
  expect(res.status).toBe('entregado');
}, 60000);
