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
  const [shipments, drivers, zones, depots] = await Promise.all(['shipments', 'drivers', 'zones', 'depots'].map(all));
  const day = await optimizeDay({ date: today, shipments, drivers, depot: depots[0], zones });
  expect(day.plans).toHaveLength(5);

  const { routeIds, warnings } = await createRoutesForDay(today, day);
  // Z2 ya salió con la Ruta A del seed: se salta y avisa
  expect(routeIds.sort()).toEqual(['Z1', 'Z3', 'Z4', 'Z5'].map((z) => `R-${today}-${z}`));
  expect(warnings).toEqual([expect.stringMatching(/ya salió con la Ruta A/)]);

  for (const id of routeIds) {
    const route = (await getDoc(doc(db, 'routes', id))).data();
    expect(route).toMatchObject({ status: 'asignada', date: today, engine: 'geoapify' });
    expect(route.geometry.length).toBeGreaterThan(1);
    expect(route.geometry[0]).toEqual({ lat: expect.any(Number), lng: expect.any(Number) });
    expect(route.createdAt?.toMillis?.()).toBeGreaterThan(0);
    for (const st of route.stops) {
      const s = (await getDoc(doc(db, 'shipments', st.shipmentId))).data();
      expect(s).toMatchObject({ status: 'asignado', routeId: id, stopSequence: st.seq, unassignedReason: null });
    }
  }

  // Lo que no cupo tiene su motivo escrito
  const notZ2 = day.unassigned.filter((u) => shipments.find((s) => s.id === u.shipmentId)?.zoneId !== 'Z2');
  for (const u of notZ2) {
    const s = (await getDoc(doc(db, 'shipments', u.shipmentId))).data();
    expect(s.unassignedReason).toBe(u.reason);
  }
});

test('Pasar a… (moveStop): el pedido pasa de Z1 a Z3; solo esas dos rutas cambian', async () => {
  const { moveStop } = require('../src/features/routes/routesService');
  const z4Before = (await getDoc(doc(db, 'routes', `R-${today}-Z4`))).data().stops;
  const from = `R-${today}-Z1`;
  const to = `R-${today}-Z3`;
  expect((await getDoc(doc(db, 'shipments', 'SIM-0400'))).data().routeId).toBe(from);

  await moveStop('SIM-0400', to);

  expect((await getDoc(doc(db, 'shipments', 'SIM-0400'))).data()).toMatchObject({
    status: 'asignado',
    routeId: to,
    unassignedReason: null,
  });
  const dest = (await getDoc(doc(db, 'routes', to))).data();
  expect(dest.stops.map((st) => st.shipmentId)).toContain('SIM-0400');
  expect(dest.status).toBe('asignada');
  expect((await getDoc(doc(db, 'routes', from))).data().stops.map((st) => st.shipmentId)).not.toContain('SIM-0400');
  expect((await getDoc(doc(db, 'routes', `R-${today}-Z4`))).data().stops).toEqual(z4Before);
  // Rechazo con su motivo: la Ruta A de Z2 ya salió
  const started = (await getDocs(collection(db, 'routes'))).docs.find((d) => d.data().status === 'en_curso');
  await expect(moveStop('SIM-0401', started.id)).rejects.toThrow('ya inició');
});
