// __integration__/dayPlan.emu.js  (dueño: P2)
// "Optimizar día" contra el emulador (Firestore real; Geoapify en mocks): optimizeDay + createRoutesForDay.
// Verifica lo que los mocks no pueden: que Firestore acepta el documento de la ruta (geometry sin
// arreglos anidados) y que ruta, estados y unassignedReason quedan escritos juntos (C30).
import { collection, doc, getDoc, getDocs, terminate } from 'firebase/firestore';
import { db } from '../src/lib/firebase';
import { todayISO } from '../src/lib/dates';
import { optimizeDay } from '../src/optimizer';
import { createRoutesForDay } from '../src/features/routes/routesService';

const today = todayISO();
const all = async (name) => (await getDocs(collection(db, name))).docs.map((d) => ({ id: d.id, ...d.data() }));

beforeAll(() => require('./reseed')(), 60000);
afterAll(() => terminate(db));

test('Optimizar día: una ruta por zona en Firestore, con geometry, motor y motivos de sin asignar', async () => {
  const [shipments, drivers, vehicles, zones, depots] = await Promise.all(
    ['shipments', 'drivers', 'vehicles', 'zones', 'depots'].map(all),
  );
  const day = await optimizeDay({ date: today, shipments, drivers, vehicles, depot: depots[0], zones });
  expect(day.plans).toHaveLength(5);

  const { routeIds, warnings } = await createRoutesForDay(today, day);
  // Z2 ya salió con la Ruta A del seed: se salta y avisa
  expect(routeIds.sort()).toEqual(['Z1', 'Z3', 'Z4', 'Z5'].map((z) => `R-${today}-${z}`));
  expect(warnings).toEqual([expect.stringMatching(/ya salió con la Ruta A/)]);

  for (const id of routeIds) {
    const route = (await getDoc(doc(db, 'routes', id))).data();
    expect(route).toMatchObject({ status: 'asignada', date: today, engine: 'geoapify', vehicleId: expect.any(String) });
    expect(route.geometry.length).toBeGreaterThan(1);
    expect(route.geometry[0]).toEqual({ lat: expect.any(Number), lng: expect.any(Number) });
    expect(route.createdAt?.toMillis?.()).toBeGreaterThan(0);
    for (const st of route.stops) {
      const s = (await getDoc(doc(db, 'shipments', st.shipmentId))).data();
      expect(s).toMatchObject({ status: 'asignado', routeId: id, stopSequence: st.seq, unassignedReason: null });
    }
  }

  // Ninguna línea blanca en moto, y lo que no cupo tiene su motivo escrito
  const vehicleOf = Object.fromEntries(drivers.map((d) => [d.id, vehicles.find((v) => v.id === d.vehicleId)]));
  for (const id of routeIds) {
    const route = (await getDoc(doc(db, 'routes', id))).data();
    if (vehicleOf[route.driverId].type !== 'moto') continue;
    for (const st of route.stops)
      expect((await getDoc(doc(db, 'shipments', st.shipmentId))).data().requires ?? []).toEqual([]);
  }
  // La línea blanca de Z1 (moto) no cabe en su zona: pasa a una ruta con carga grande (regla del 30 oct)
  const white = (await getDoc(doc(db, 'shipments', 'SIM-0400'))).data();
  expect(white).toMatchObject({ status: 'asignado', unassignedReason: null });
  const whiteRoute = (await getDoc(doc(db, 'routes', white.routeId))).data();
  expect(vehicleOf[whiteRoute.driverId].capabilities).toContain('carga_grande');
  const notZ2 = day.unassigned.filter((u) => shipments.find((s) => s.id === u.shipmentId)?.zoneId !== 'Z2');
  for (const u of notZ2) {
    const s = (await getDoc(doc(db, 'shipments', u.shipmentId))).data();
    expect(s.unassignedReason).toBe(u.reason);
  }
});

test('Pasar a… (moveStop): la línea blanca pasa entre las rutas con carga grande; Z1 no cambia', async () => {
  const { moveStop } = require('../src/features/routes/routesService');
  const z1Before = (await getDoc(doc(db, 'routes', `R-${today}-Z1`))).data().stops;
  const from = (await getDoc(doc(db, 'shipments', 'SIM-0400'))).data().routeId;
  const to = from === `R-${today}-Z3` ? `R-${today}-Z4` : `R-${today}-Z3`;

  await moveStop('SIM-0400', to);

  expect((await getDoc(doc(db, 'shipments', 'SIM-0400'))).data()).toMatchObject({
    status: 'asignado',
    routeId: to,
    unassignedReason: null,
  });
  const dest = (await getDoc(doc(db, 'routes', to))).data();
  expect(dest.stops.map((st) => st.shipmentId)).toContain('SIM-0400');
  expect(dest.status).toBe('asignada');
  expect((await getDoc(doc(db, 'routes', `R-${today}-Z1`))).data().stops).toEqual(z1Before);
  // Rechazos con su motivo
  await expect(moveStop('SIM-0403', `R-${today}-Z1`)).rejects.toThrow('no lleva carga grande');
});
