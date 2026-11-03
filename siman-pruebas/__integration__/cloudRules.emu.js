// __integration__/cloudRules.emu.js  (dueño: P1)
// Las escrituras LEGÍTIMAS del Sprint 4 deben pasar con las reglas de la NUBE (firestore.cloud.rules).
// Carga esas reglas en el emulador (después del seed, que necesita las abiertas), corre el flujo
// del despachador y del motorista, y al final restaura firestore.rules.
// Lo prohibido lo comprueba npm run check:cloud contra la nube real.
import { readFileSync } from 'node:fs';
import { terminate } from 'firebase/firestore';
import { db } from '../src/lib/firebase';
import { parseOrdersFile } from '../src/features/orders/parseOrdersFile';
import { validateOrders } from '../src/features/orders/validateOrders';
import { importOrders, listOrderNumbers } from '../src/features/orders/importOrders';
import { resolveLocations } from '../src/features/geo/resolveLocations';
import { confirmLocation } from '../src/features/geo/confirmLocation';
import { updateDriverShift } from '../src/features/fleet/fleetService';
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

let date;
let ids = [];

const { createAccounts, as } = require('./accounts');

// Con login (C48): cuentas de prueba antes de las reglas de la nube; se trabaja como despachador
// y el paso del motorista entra con la cuenta del motorista de esa ruta
beforeAll(async () => {
  require('./reseed')();
  await createAccounts();
  await loadRules('firestore.cloud.rules');
  await as('despacho');
}, 90000);
afterAll(async () => {
  await loadRules('firestore.rules');
  await terminate(db);
});

test('importar el Excel con las reglas de la nube', async () => {
  const { rows: hoja } = await parseOrdersFile(
    new Uint8Array(readFileSync(require.resolve('../assets/pedidos-prueba-100.xlsx'))).buffer,
  );
  const rows = require('../__tests__/simulaciones/excel.cjs').paraManana(hoja);
  const located = await resolveLocations(validateOrders(rows, { existingOrderIds: await listOrderNumbers() }));
  const res = await importOrders(located);
  expect(res).toMatchObject({ created: 96, skipped: 4 });
  ids = res.ids;
  date = (await getShipment(ids[0])).scheduledDate;
}, 60000);

test('confirmar una ubicación', async () => {
  let target;
  for (const id of ids) {
    const s = await getShipment(id);
    if (s.location?.status === 'revisar') {
      target = s;
      break;
    }
  }
  await confirmLocation(target.id, { lat: 13.7005, lng: -89.1905 }, 'despacho');
  expect((await getShipment(target.id)).location.status).toBe('confirmada');
});

test('turno del motorista', async () => {
  await updateDriverShift('D1', { shiftStart: '07:00', shiftEnd: '17:00' });
});

test('traer reintentos (reprogramar)', async () => {
  expect(await carryOverRetries(date)).toEqual({ moved: 2 });
});

let started;
test('optimizar el día y mover una parada', async () => {
  const res = await optimizeAndSaveDay(date);
  expect(res.routeIds.length).toBeGreaterThan(0);
  const unassigned = [];
  for (const id of ids) {
    const s = await getShipment(id);
    if (s.status === 'pendiente' && s.unassignedReason) unassigned.push(s);
  }
  const target = res.routeIds[0];
  if (unassigned[0]) await moveStop(unassigned[0].id, target).catch((err) => expect(err.message).toBeTruthy());
  started = target;
}, 60000);

test('el motorista inicia la ruta y entrega', async () => {
  // Del servidor: el primer aviso de un listener puede traer la versión de la caché (antes de Pasar a…)
  const { getDoc, doc } = require('firebase/firestore');
  const route = (await getDoc(doc(db, 'routes', started))).data();
  await as(route.driverId);
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
  await confirmLocation(first.id, { lat: res.gps.lat, lng: res.gps.lng }, 'gps_entrega');
  await as('despacho');
}, 60000);

test('ningún pedido queda "asignado" a una ruta que no lo tiene en sus paradas (30 oct)', async () => {
  const { getDocs, collection } = require('firebase/firestore');
  const routes = (await getDocs(collection(db, 'routes'))).docs.map((d) => ({ id: d.id, ...d.data() }));
  const ships = (await getDocs(collection(db, 'shipments'))).docs.map((d) => ({ id: d.id, ...d.data() }));
  const inStops = new Set(routes.flatMap((r) => (r.stops ?? []).map((st) => `${r.id}|${st.shipmentId}`)));
  const orphans = ships.filter((s) => s.routeId && s.status === 'asignado' && !inStops.has(`${s.routeId}|${s.id}`));
  expect(orphans.map((s) => s.id)).toEqual([]);
});

test('la fecha de un pedido no cambia salvo al reprogramar un reintento', async () => {
  const { getDocs, collection, doc, updateDoc } = require('firebase/firestore');
  const ships = (await getDocs(collection(db, 'shipments'))).docs.map((d) => ({ id: d.id, ...d.data() }));
  const loose = ships.find((x) => x.status === 'pendiente' && !x.routeId);
  await expect(updateDoc(doc(db, 'shipments', loose.id), { scheduledDate: '2099-12-31' })).rejects.toThrow();
  const routed = ships.find((x) => x.routeId && x.status === 'asignado');
  if (routed) await expect(updateDoc(doc(db, 'shipments', routed.id), { scheduledDate: '2099-12-31' })).rejects.toThrow();
});

test('motoristas con las reglas de la nube: crear, turno, baja', async () => {
  const { setDoc, doc, updateDoc, deleteDoc } = require('firebase/firestore');
  const fleet = require('../src/features/fleet/fleetService');
  const id = await fleet.createDriver({ name: 'Ana Pérez', zoneId: 'Z1' });
  await fleet.updateDriverShift(id, { shiftStart: '08:00', shiftEnd: '16:00' });
  await fleet.setDriverActive(id, false);
  // Bloqueado: motorista incompleto, en una zona que no existe, con campos de más, cambiar el nombre o borrar
  await expect(setDoc(doc(db, 'drivers', 'D9'), { name: 'X' })).rejects.toThrow();
  await expect(
    setDoc(doc(db, 'drivers', 'DZZ'), {
      name: 'Zona falsa', initials: 'ZF', phone: null, zoneId: 'Z99', active: true,
      shiftStart: '07:00', shiftEnd: '18:00',
    }),
  ).rejects.toThrow();
  await expect(
    setDoc(doc(db, 'drivers', 'DVV'), {
      name: 'Con vehículo', initials: 'CV', phone: null, zoneId: 'Z1', active: true, vehicleId: 'V1',
      shiftStart: '07:00', shiftEnd: '18:00',
    }),
  ).rejects.toThrow();
  await expect(updateDoc(doc(db, 'drivers', id), { name: 'Otro' })).rejects.toThrow();
  await expect(deleteDoc(doc(db, 'drivers', id))).rejects.toThrow();
});
