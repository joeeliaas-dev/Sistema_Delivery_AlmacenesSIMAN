import { terminate } from 'firebase/firestore';
import { countByStage, kmOptimized } from '../src/features/dispatch/dispatchMath';
import { createRoute, listenDriverRoute, listenRoutes, startRoute } from '../src/features/routes/routesService';
import { getShipment, listenShipments } from '../src/features/shipments/shipmentsService';
import { changeStatus } from '../src/features/shipments/statusMachine';
import { db } from '../src/lib/firebase';
import { todayISO } from '../src/lib/dates';
const DELIVERY = {
  photoUri: 'file:///foto.jpg',
  signatureBase64: 'data:image/png;base64,AAAA',
  description: 'Recibió la clienta',
};
const fail = (reason) => ({
  reason,
  photoUri: 'file:///foto.jpg',
  description: 'Descripción de la visita fallida',
});
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
const date = todayISO();
const counters = async () =>
  countByStage(
    await first((cb) =>
      listenShipments(
        {
          date,
        },
        cb,
      ),
    ),
  );
beforeAll(() => require('./reseed')(), 60000);
afterAll(() => terminate(db));
test('guion de la demo de punta a punta', async () => {
  expect(await counters()).toEqual({
    pendientes: 51,
    enRuta: 6,
    entregados: 2,
  });
  const { routeId } = await createRoute({
    zoneId: 'Z1',
    date,
  });
  const z1 = await first((cb) =>
    listenDriverRoute(
      {
        driverId: 'D1',
        date,
      },
      cb,
    ),
  );
  expect(z1).toMatchObject({
    id: routeId,
    code: 'Ruta B',
    status: 'asignada',
  });
  expect(z1.stops.map((s) => s.shipmentId)).toEqual(expect.arrayContaining(['SIM-0401', 'SIM-0402']));
  expect(z1.stops).toHaveLength(12);
  expect(await counters()).toEqual({
    pendientes: 39,
    enRuta: 18,
    entregados: 2,
  });
  const rutaA = await first((cb) =>
    listenDriverRoute(
      {
        driverId: 'D2',
        date,
      },
      cb,
    ),
  );
  expect(rutaA).toMatchObject({
    code: 'Ruta A',
    status: 'en_curso',
    estEnd: `${date}T12:20:00-06:00`,
  });
  expect(
    (
      await changeStatus({
        shipment: await getShipment('SIM-0419'),
        to: 'entregado',
        payload: DELIVERY,
        driverId: 'D2',
      })
    ).status,
  ).toBe('entregado');
  expect((await counters()).entregados).toBe(3);
  expect(
    (
      await changeStatus({
        shipment: await getShipment('SIM-0420'),
        to: 'no_entregado',
        payload: fail('Cliente ausente'),
        driverId: 'D2',
      })
    ).status,
  ).toBe('no_entregado');
  expect(await counters()).toEqual({
    pendientes: 40,
    enRuta: 16,
    entregados: 3,
  });
  expect(await startRoute(routeId, 'D1')).toEqual({
    count: 12,
  });
  expect((await getShipment('SIM-0401')).status).toBe('en_ruta');
  expect(
    (
      await changeStatus({
        shipment: await getShipment('SIM-0401'),
        to: 'no_entregado',
        payload: fail('Dirección incorrecta'),
        driverId: 'D1',
      })
    ).status,
  ).toBe('devuelto');
  expect(await getShipment('SIM-0401')).toMatchObject({
    status: 'devuelto',
    attempts: 2,
  });
  const routes = await first((cb) =>
    listenRoutes(
      {
        date,
      },
      cb,
    ),
  );
  const kpi = kmOptimized(routes);
  expect(routes).toHaveLength(2);
  expect(kpi.km).toBeGreaterThan(0);
});
