// __integration__/demoFlow.emu.js  (dueño: P1)
// El guion de la demo (docs/DEMO.md) de punta a punta contra el emulador, con los servicios
// de P1 y P2 y los cálculos del Centro de despacho de P2. Hito del día 4.
import { terminate } from 'firebase/firestore';
import { countByStage } from '../src/features/dispatch/dispatchMath';
import { listenDriverRoute, listenRoutes } from '../src/features/routes/routesService';
import { getShipment, listenShipments } from '../src/features/shipments/shipmentsService';
import { changeStatus } from '../src/features/shipments/statusMachine';
import { db } from '../src/lib/firebase';
import { todayISO } from '../src/lib/dates';

const DELIVERY = {
  photoUri: 'file:///foto.jpg',
  signatureBase64: 'data:image/png;base64,AAAA',
  description: 'Recibió la clienta',
};
const fail = (reason) => ({ reason, photoUri: 'file:///foto.jpg', description: 'Descripción de la visita fallida' });
// Último valor del listener cuando deja de cambiar: tras una transacción, el primer valor
// puede venir de la caché local y llegar viejo; el confirmado por el servidor llega enseguida.
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
const counters = async () => countByStage(await first((cb) => listenShipments({ date }, cb)));

beforeAll(() => require('./reseed')(), 60000);
afterAll(() => terminate(db));

test('guion de la demo de punta a punta', async () => {
  // 0:00 contadores de partida
  expect(await counters()).toEqual({ pendientes: 51, enRuta: 6, entregados: 2 });

  // 3:00 Vista motorista de Jorge: Ruta A, 2 de 8, próxima SIM-0419
  const rutaA = await first((cb) => listenDriverRoute({ driverId: 'D2', date }, cb));
  expect(rutaA).toMatchObject({ code: 'Ruta A', status: 'en_curso', estEnd: `${date}T12:20:00-06:00` });

  // 5:30 Completar entrega de SIM-0419 → Entregados sube a 3
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

  // 6:30 SIM-0420 no entregado → reintento programado; vuelve a contar como pendiente
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
  expect(await counters()).toEqual({ pendientes: 52, enRuta: 4, entregados: 3 });

  // 9:00 El despacho ve la Ruta A con sus paradas cerradas
  const routes = await first((cb) => listenRoutes({ date }, cb));
  expect(routes).toHaveLength(1);
  expect(routes[0]).toMatchObject({ code: 'Ruta A', driverId: 'D2' });
});
