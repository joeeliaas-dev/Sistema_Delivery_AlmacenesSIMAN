import { collection, getDocs, terminate } from 'firebase/firestore';
import { listenRouteShipments, listenShipments, getShipment } from '../src/features/shipments/shipmentsService';
import { assignToRoute, changeStatus, changeStatusMany } from '../src/features/shipments/statusMachine';
import { db } from '../src/lib/firebase';
import { todayISO } from '../src/lib/dates';
const OK_DELIVERY = {
  photoUri: 'file:///foto.jpg',
  signatureBase64: 'data:image/png;base64,AAAA',
  description: 'Recibió la clienta en la puerta',
};
const OK_FAIL = {
  reason: 'Cliente ausente',
  photoUri: 'file:///foto.jpg',
  description: 'Nadie atendió después de tocar',
};
const events = async (id) => (await getDocs(collection(db, 'shipments', id, 'events'))).docs.map((d) => d.data());
const first = (subscribe, quietMs = 400) =>
  new Promise((resolve) => {
    let timer, last, cancel;
    cancel = subscribe((v) => {
      last = v;
      clearTimeout(timer);
      timer = setTimeout(() => {
        cancel?.();
        resolve(last);
      }, quietMs);
    });
  });
beforeAll(() => require('./reseed')(), 60000);
afterAll(() => terminate(db));
test('los listeners leen el seed del día', async () => {
  const date = todayISO();
  const all = await first((cb) =>
    listenShipments(
      {
        date,
      },
      cb,
    ),
  );
  expect(all).toHaveLength(60);
  const z1Retries = await first((cb) =>
    listenShipments(
      {
        date,
        zoneId: 'Z1',
        statuses: ['no_entregado'],
      },
      cb,
    ),
  );
  expect(z1Retries.map((s) => s.id).sort()).toEqual(['SIM-0401', 'SIM-0402']);
  const rutaA = await first((cb) => listenRouteShipments(`R-${date}-Z2`, cb));
  expect(rutaA.map((s) => s.stopSequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
});
test('entregar SIM-0419 escribe envío y evento en Firestore', async () => {
  const before = (await events('SIM-0419')).length;
  const res = await changeStatus({
    shipment: await getShipment('SIM-0419'),
    to: 'entregado',
    payload: OK_DELIVERY,
    driverId: 'D2',
  });
  expect(res.status).toBe('entregado');
  const s = await getShipment('SIM-0419');
  expect(s.status).toBe('entregado');
  expect(s.lastEvidence).toMatchObject({
    photoUrl: 'evidence/SIM-0419/intento-1/foto.jpg',
    signatureUrl: 'evidence/SIM-0419/intento-1/firma.png',
  });
  expect(s.updatedAt?.toDate).toBeDefined();
  const ev = await events('SIM-0419');
  expect(ev).toHaveLength(before + 1);
  expect(ev.find((e) => e.toStatus === 'entregado')).toMatchObject({
    fromStatus: 'en_ruta',
    driverId: 'D2',
    attempt: 1,
  });
});
test('reintento de SIM-0401 y 2.º fallo deja devuelto', async () => {
  await assignToRoute({
    routeId: 'R-emu-Z1',
    driverId: 'D1',
    stops: [
      {
        shipmentId: 'SIM-0401',
        seq: 1,
        etaMin: 7,
      },
    ],
  });
  expect(await getShipment('SIM-0401')).toMatchObject({
    status: 'asignado',
    routeId: 'R-emu-Z1',
    stopSequence: 1,
  });
  await changeStatusMany({
    shipmentIds: ['SIM-0401'],
    to: 'en_ruta',
    driverId: 'D1',
  });
  const res = await changeStatus({
    shipment: await getShipment('SIM-0401'),
    to: 'no_entregado',
    payload: OK_FAIL,
    driverId: 'D1',
  });
  expect(res.status).toBe('devuelto');
  expect(await getShipment('SIM-0401')).toMatchObject({
    status: 'devuelto',
    attempts: 2,
  });
  const ev = await events('SIM-0401');
  expect(ev.filter((e) => e.toStatus === 'devuelto')).toEqual([
    expect.objectContaining({
      automatic: true,
      attempt: 2,
    }),
  ]);
});
test('ruta y asignación se guardan juntas; si falla, no queda ruta huérfana', async () => {
  const { doc, getDoc } = require('firebase/firestore');
  const route = {
    code: 'Ruta B',
    date: todayISO(),
    zoneId: 'Z3',
    driverId: 'D3',
    status: 'asignada',
    stops: [],
  };
  const routeDoc = (id) => getDoc(doc(db, 'routes', id));
  await expect(
    assignToRoute({
      routeId: 'R-emu-huerfana',
      route,
      stops: [
        {
          shipmentId: 'SIM-0437',
          seq: 1,
          etaMin: 1,
        },
      ],
    }),
  ).rejects.toThrow('SIM-0437 (devuelto)');
  expect((await routeDoc('R-emu-huerfana')).exists()).toBe(false);
  await assignToRoute({
    routeId: 'R-emu-Z3',
    driverId: 'D3',
    route,
    stops: [
      {
        shipmentId: 'SIM-0425',
        seq: 1,
        etaMin: 4,
      },
    ],
  });
  await changeStatusMany({
    shipmentIds: ['SIM-0425'],
    to: 'en_ruta',
    routeStatus: {
      routeId: 'R-emu-Z3',
      status: 'en_curso',
    },
  });
  const saved = await routeDoc('R-emu-Z3');
  expect(saved.data()).toMatchObject({
    code: 'Ruta B',
    status: 'en_curso',
  });
  expect(saved.data().createdAt.toDate).toBeDefined();
  expect(await getShipment('SIM-0425')).toMatchObject({
    status: 'en_ruta',
    routeId: 'R-emu-Z3',
  });
});
test('P2: generar e iniciar la ruta de Z5 contra Firestore', async () => {
  const { createRoute, listenDriverRoute, startRoute } = require('../src/features/routes/routesService');
  const date = todayISO();
  const { routeId } = await createRoute({
    zoneId: 'Z5',
    date,
  });
  const route = await first((cb) =>
    listenDriverRoute(
      {
        driverId: 'D5',
        date,
      },
      cb,
    ),
  );
  expect(route).toMatchObject({
    id: routeId,
    zoneId: 'Z5',
    driverId: 'D5',
    status: 'asignada',
  });
  expect(route.stops).toHaveLength(12);
  expect(route.totalKm).toBeLessThanOrEqual(route.baselineKm);
  const shipments = await first((cb) => listenRouteShipments(routeId, cb));
  expect(shipments.map((s) => s.status)).toEqual(Array(12).fill('asignado'));
  await expect(
    createRoute({
      zoneId: 'Z5',
      date,
    }),
  ).rejects.toThrow('La zona ya tiene una ruta abierta hoy');
  await startRoute(routeId, 'D5');
  expect(
    (
      await first((cb) =>
        listenDriverRoute(
          {
            driverId: 'D5',
            date,
          },
          cb,
        ),
      )
    ).status,
  ).toBe('en_curso');
  expect((await getShipment(route.stops[0].shipmentId)).status).toBe('en_ruta');
});
test('dos teléfonos a la vez: transacción, gana uno y el otro no escribe nada', async () => {
  const route = {
    code: 'Ruta C',
    date: todayISO(),
    zoneId: 'Z4',
    driverId: 'D4',
    status: 'asignada',
    stops: [],
  };
  const results = await Promise.allSettled([
    assignToRoute({
      routeId: 'R-emu-carrera',
      route,
      stops: [
        {
          shipmentId: 'SIM-0438',
          seq: 1,
          etaMin: 3,
        },
      ],
    }),
    assignToRoute({
      routeId: 'R-emu-carrera',
      route,
      stops: [
        {
          shipmentId: 'SIM-0439',
          seq: 1,
          etaMin: 3,
        },
      ],
    }),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.find((r) => r.status === 'rejected').reason.message).toBe('La zona ya tiene una ruta abierta hoy');
  const statuses = [(await getShipment('SIM-0438')).status, (await getShipment('SIM-0439')).status].sort();
  expect(statuses).toEqual(['asignado', 'pendiente']);
  const s = await getShipment('SIM-0421');
  const both = await Promise.allSettled([
    changeStatus({
      shipment: s,
      to: 'entregado',
      payload: OK_DELIVERY,
      driverId: 'D2',
    }),
    changeStatus({
      shipment: s,
      to: 'no_entregado',
      payload: OK_FAIL,
      driverId: 'D2',
    }),
  ]);
  expect(both.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect((await events('SIM-0421')).filter((e) => e.fromStatus === 'en_ruta')).toHaveLength(1);
});
test('una transición inválida no escribe nada', async () => {
  const before = await getShipment('SIM-0437');
  await expect(
    assignToRoute({
      routeId: 'R-x',
      stops: [
        {
          shipmentId: 'SIM-0437',
          seq: 1,
          etaMin: 1,
        },
      ],
    }),
  ).rejects.toThrow('SIM-0437 (devuelto)');
  expect(await getShipment('SIM-0437')).toEqual(before);
});
