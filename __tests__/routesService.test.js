// __tests__/routesService.test.js  (dueño: P2) — modo mocks (firebase se simula en jest.setup.js)
// Cada prueba recarga los módulos para empezar con la base en memoria limpia.
import { todayISO } from '../src/lib/dates';

const today = todayISO();
let svc, mockDb;

beforeEach(() => {
  jest.resetModules();
  svc = require('../src/features/routes/routesService');
  mockDb = require('../src/mocks').mockDb;
});

const next = (subscribe) =>
  new Promise((resolve) => {
    const cancel = subscribe((value) => {
      cancel();
      resolve(value);
    });
  });
const shipmentsOf = (zoneId) => mockDb.all('shipments').filter((s) => s.zoneId === zoneId);

describe('lecturas', () => {
  it('listenRoute devuelve la Ruta A de hoy', async () => {
    const route = await next((cb) => svc.listenRoute(`R-${today}-Z2`, cb));
    expect(route).toMatchObject({ code: 'Ruta A', zoneId: 'Z2', driverId: 'D2', date: today });
    expect(route.stops).toHaveLength(8);
  });

  it('listenRoute da null si no existe', async () => {
    expect(await next((cb) => svc.listenRoute('R-no-existe', cb))).toBeNull();
  });

  it('listenDriverRoute encuentra la ruta del motorista y la fecha', async () => {
    const route = await next((cb) => svc.listenDriverRoute({ driverId: 'D2', date: today }, cb));
    expect(route.id).toBe(`R-${today}-Z2`);
  });

  it('listenDriverRoute da null si el motorista no tiene ruta', async () => {
    expect(await next((cb) => svc.listenDriverRoute({ driverId: 'D1', date: today }, cb))).toBeNull();
    expect(await next((cb) => svc.listenDriverRoute({ driverId: 'D2', date: '2000-01-01' }, cb))).toBeNull();
  });

  it('listenRoutes devuelve las rutas de la fecha', async () => {
    const routes = await next((cb) => svc.listenRoutes({ date: today }, cb));
    expect(routes.map((r) => r.id)).toEqual([`R-${today}-Z2`]);
    expect(await next((cb) => svc.listenRoutes({ date: '2000-01-01' }, cb))).toEqual([]);
  });

  it('cancelar evita más llamadas', async () => {
    const cb = jest.fn();
    svc.listenRoute(`R-${today}-Z2`, cb)();
    await Promise.resolve();
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('startRoute', () => {
  // Una ruta ya asignada de Z3 (las rutas llegan asignadas; aquí se arma con statusMachine)
  async function assignedZ3() {
    const { assignToRoute } = require('../src/features/shipments/statusMachine');
    const stops = shipmentsOf('Z3')
      .filter((s) => s.status === 'pendiente')
      .map((s, i) => ({ shipmentId: s.id, seq: i + 1, etaMin: 10 * (i + 1) }));
    const routeId = `R-${today}-Z3`;
    const route = { code: 'Ruta B', date: today, zoneId: 'Z3', driverId: 'D3', status: 'asignada', stops };
    await assignToRoute({ routeId, stops, driverId: 'D3', route });
    return { routeId, n: stops.length };
  }

  it('pasa las paradas a en_ruta y la ruta a en_curso', async () => {
    const { routeId, n } = await assignedZ3();
    const { count } = await svc.startRoute(routeId, 'D3');
    expect(count).toBe(n);
    expect(mockDb.get('routes', routeId).status).toBe('en_curso');
    expect(mockDb.all('events').filter((e) => e.toStatus === 'en_ruta' && e.driverId === 'D3')).toHaveLength(n);
  });

  it('no se inicia dos veces', async () => {
    const { routeId } = await assignedZ3();
    await svc.startRoute(routeId, 'D3');
    await expect(svc.startRoute(routeId, 'D3')).rejects.toThrow('La Ruta B ya está en curso');
  });

  it('ruta inexistente da error', async () => {
    await expect(svc.startRoute('R-no-existe', 'D1')).rejects.toThrow('No existe la ruta R-no-existe');
  });
});

describe('días anteriores: lo abierto no desaparece al cambiar de día', () => {
  const tomorrow = require('../src/features/dispatch/dispatchMath').addDays(today, 1);
  const OPEN = ['pendiente', 'asignado', 'en_ruta', 'no_entregado'];

  it('listenShipments del día siguiente trae los abiertos de hoy y deja los cerrados', async () => {
    const { listenShipments } = require('../src/features/shipments/shipmentsService');
    const list = await next((cb) => listenShipments({ date: tomorrow }, cb));
    const open = mockDb.all('shipments').filter((s) => OPEN.includes(s.status));
    expect(list.map((s) => s.id).sort()).toEqual(open.map((s) => s.id).sort());
    expect(list.some((s) => s.status === 'entregado' || s.status === 'devuelto')).toBe(false);
  });

  it('la Ruta A sin terminar sigue en el despacho y con su motorista', async () => {
    const routes = await next((cb) => svc.listenRoutes({ date: tomorrow }, cb));
    expect(routes.map((r) => r.id)).toEqual([`R-${today}-Z2`]);
    expect((await next((cb) => svc.listenDriverRoute({ driverId: 'D2', date: tomorrow }, cb))).id).toBe(
      `R-${today}-Z2`,
    );
  });

  it('terminada la ruta, ya no se arrastra', async () => {
    for (const s of shipmentsOf('Z2').filter((x) => x.routeId))
      mockDb.upsert('shipments', { id: s.id, status: 'entregado' });
    expect(await next((cb) => svc.listenRoutes({ date: tomorrow }, cb))).toEqual([]);
    expect(await next((cb) => svc.listenDriverRoute({ driverId: 'D2', date: tomorrow }, cb))).toBeNull();
  });
});
