// __integration__/sprint4.emu.js  (dueño: P1)
// Sprint 4 contra el emulador (Firestore real, Geoapify simulado): importar el Excel de prueba,
// motoristas, reintentos y sin asignar. Arranca con el seed limpio (reseed).
import { readFileSync } from 'node:fs';
import { collection, doc, getDoc, getDocs, terminate } from 'firebase/firestore';
import { db } from '../src/lib/firebase';
import { todayISO } from '../src/lib/dates';
import { parseOrdersFile } from '../src/features/orders/parseOrdersFile';
import { validateOrders } from '../src/features/orders/validateOrders';
import { importOrders, listOrderNumbers } from '../src/features/orders/importOrders';
import { resolveLocations } from '../src/features/geo/resolveLocations';
import { confirmLocation } from '../src/features/geo/confirmLocation';
import { updateDriverShift } from '../src/features/fleet/fleetService';
import { carryOverRetries } from '../src/features/shipments/carryOver';
import { assignToRoute, replanRoutes } from '../src/features/shipments/statusMachine';
import { getShipment } from '../src/features/shipments/shipmentsService';

const today = todayISO();
const tomorrow = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return todayISO(d);
})();
const data = (snap) => (snap.exists() ? snap.data() : null);

beforeAll(() => require('./reseed')(), 60000);
afterAll(() => terminate(db));

let imported = [];

test('importa pedidos-prueba-100.xlsx: 96 en menos de 10 s, 4 rojos y evento importado', async () => {
  const file = readFileSync(require.resolve('../assets/pedidos-prueba-100.xlsx'));
  const { rows: hoja } = await parseOrdersFile(new Uint8Array(file).buffer);
  const rows = require('../__tests__/simulaciones/excel.cjs').paraManana(hoja);
  const validated = validateOrders(rows, { existingOrderIds: await listOrderNumbers() });
  const located = await resolveLocations(validated);
  expect(located.filter((r) => r.status === 'roja')).toHaveLength(4);

  const t0 = Date.now();
  const { created, skipped, ids } = await importOrders(located);
  const ms = Date.now() - t0;
  expect({ created, skipped }).toEqual({ created: 96, skipped: 4 });
  expect(ms).toBeLessThan(10000);
  imported = ids;

  const s = await getShipment(ids[0]);
  const fileDate = located.find((r) => r.status !== 'roja').order.scheduledDate; // la fecha que trae el archivo
  expect(s).toMatchObject({ status: 'pendiente', scheduledDate: fileDate, attempts: 0, unassignedReason: null });
  const ev = (await getDocs(collection(db, 'shipments', ids[0], 'events'))).docs.map((d) => d.data());
  expect(ev).toEqual([expect.objectContaining({ kind: 'importado', toStatus: 'pendiente' })]);

  // El mismo archivo otra vez: los 96 pedidos ya existen y salen rojos
  const again = validateOrders(rows, { existingOrderIds: await listOrderNumbers() });
  expect(again.filter((r) => r.status === 'roja')).toHaveLength(100);
}, 60000);

test('confirmLocation: confirma la ubicación del pedido y recalcula su zona', async () => {
  const toReview = [];
  for (const id of imported) {
    const s = await getShipment(id);
    if (s.location?.status === 'revisar') toReview.push(s);
  }
  expect(toReview).toHaveLength(15);
  const s = toReview[0];
  const { zoneId } = await confirmLocation(s.id, { lat: 13.6989, lng: -89.1914 }, 'despacho');
  expect((await getShipment(s.id)).location).toMatchObject({ status: 'confirmada', source: 'despacho', lat: 13.6989 });
  expect(zoneId).toBeTruthy();
});

test('turno del motorista', async () => {
  await updateDriverShift('D5', { shiftStart: '08:00', shiftEnd: '16:00' });
  expect(data(await getDoc(doc(db, 'drivers', 'D5')))).toMatchObject({ shiftStart: '08:00', shiftEnd: '16:00' });
});

test('carryOverRetries: los reintentos de hoy pasan a mañana como pendientes', async () => {
  expect(await carryOverRetries(tomorrow)).toEqual({ moved: 2 });
  const s = await getShipment('SIM-0401');
  expect(s).toMatchObject({ status: 'pendiente', scheduledDate: tomorrow, attempts: 1, routeId: null });
  const ev = (await getDocs(collection(db, 'shipments', 'SIM-0401', 'events'))).docs.map((d) => d.data());
  expect(ev.some((e) => e.kind === 'reprogramado')).toBe(true);
  expect(await carryOverRetries(today)).toEqual({ moved: 0 });
});

test('assignToRoute con sin asignar en una sola transacción', async () => {
  await assignToRoute({
    routeId: `R-${tomorrow}-Z1`,
    stops: [{ shipmentId: imported[0], seq: 1, etaMin: 12 }],
    driverId: 'D1',
    route: { code: 'Ruta A', date: tomorrow, zoneId: 'Z1', driverId: 'D1', status: 'asignada', stops: [] },
    unassigned: [{ shipmentId: imported[1], reason: 'capacidad' }],
  });
  expect(await getShipment(imported[0])).toMatchObject({ status: 'asignado', unassignedReason: null });
  expect(await getShipment(imported[1])).toMatchObject({ status: 'pendiente', unassignedReason: 'capacidad' });
});

test('replanRoutes: reemplaza una ruta no iniciada y libera un envío en una transacción', async () => {
  const r = `R-${tomorrow}-Z1`; // creada arriba con imported[0]
  await replanRoutes({
    routes: [
      {
        routeId: r,
        route: {
          code: 'Ruta A',
          date: tomorrow,
          zoneId: 'Z1',
          driverId: 'D1',
          stops: [{ shipmentId: imported[2], seq: 1, etaMin: 8 }],
        },
        stops: [{ shipmentId: imported[2], seq: 1, etaMin: 8 }],
      },
    ],
    released: [imported[0]],
    unassigned: [{ shipmentId: imported[0], reason: 'capacidad' }],
  });
  expect(await getShipment(imported[2])).toMatchObject({ status: 'asignado', routeId: r });
  expect(await getShipment(imported[0])).toMatchObject({
    status: 'pendiente',
    routeId: null,
    unassignedReason: 'capacidad',
  });
  expect(data(await getDoc(doc(db, 'routes', r)))).toMatchObject({
    status: 'asignada',
    stops: [expect.objectContaining({ shipmentId: imported[2] })],
  });
});
