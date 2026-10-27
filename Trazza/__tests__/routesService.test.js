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
    expect(route).toMatchObject({
      code: 'Ruta A',
      zoneId: 'Z2',
      driverId: 'D2',
      date: today,
    });
    expect(route.stops).toHaveLength(8);
  });
  it('listenRoute da null si no existe', async () => {
    expect(await next((cb) => svc.listenRoute('R-no-existe', cb))).toBeNull();
  });
  it('listenDriverRoute encuentra la ruta del motorista y la fecha', async () => {
    const route = await next((cb) =>
      svc.listenDriverRoute(
        {
          driverId: 'D2',
          date: today,
        },
        cb,
      ),
    );
    expect(route.id).toBe(`R-${today}-Z2`);
  });
  it('listenDriverRoute da null si el motorista no tiene ruta', async () => {
    expect(
      await next((cb) =>
        svc.listenDriverRoute(
          {
            driverId: 'D1',
            date: today,
          },
          cb,
        ),
      ),
    ).toBeNull();
    expect(
      await next((cb) =>
        svc.listenDriverRoute(
          {
            driverId: 'D2',
            date: '2000-01-01',
          },
          cb,
        ),
      ),
    ).toBeNull();
  });
  it('listenRoutes devuelve las rutas de la fecha', async () => {
    const routes = await next((cb) =>
      svc.listenRoutes(
        {
          date: today,
        },
        cb,
      ),
    );
    expect(routes.map((r) => r.id)).toEqual([`R-${today}-Z2`]);
    expect(
      await next((cb) =>
        svc.listenRoutes(
          {
            date: '2000-01-01',
          },
          cb,
        ),
      ),
    ).toEqual([]);
  });
  it('cancelar evita más llamadas', async () => {
    const cb = jest.fn();
    svc.listenRoute(`R-${today}-Z2`, cb)();
    await Promise.resolve();
    expect(cb).not.toHaveBeenCalled();
  });
});
describe('nombres e ids', () => {
  it('routeCode: Ruta A, B, C… en orden de creación', () => {
    expect([0, 1, 2, 25].map(svc.routeCode)).toEqual(['Ruta A', 'Ruta B', 'Ruta C', 'Ruta Z']);
    expect(svc.routeCode(26)).toBe('Ruta 27');
  });
  it('nextRouteId usa el sufijo -2, -3… si el id ya existe', () => {
    const args = {
      date: '2026-10-12',
      zoneId: 'Z1',
    };
    expect(svc.nextRouteId(args, new Set())).toBe('R-2026-10-12-Z1');
    expect(svc.nextRouteId(args, new Set(['R-2026-10-12-Z1']))).toBe('R-2026-10-12-Z1-2');
    expect(svc.nextRouteId(args, new Set(['R-2026-10-12-Z1', 'R-2026-10-12-Z1-2']))).toBe('R-2026-10-12-Z1-3');
  });
});
describe('createRoute', () => {
  it('en Z1 deja los 12 envíos en asignado con stopSequence y etaMin, incluidos los 2 reintentos', async () => {
    const { routeId } = await svc.createRoute({
      zoneId: 'Z1',
      date: today,
    });
    expect(routeId).toBe(`R-${today}-Z1`);
    const route = mockDb.get('routes', routeId);
    expect(route).toMatchObject({
      code: 'Ruta B',
      zoneId: 'Z1',
      driverId: 'D1',
      status: 'asignada',
      date: today,
    });
    expect(route.stops).toHaveLength(12);
    expect(route.totalKm).toBeLessThanOrEqual(route.baselineKm);
    const z1 = shipmentsOf('Z1');
    expect(z1.every((s) => s.status === 'asignado' && s.routeId === routeId)).toBe(true);
    expect(z1.map((s) => s.stopSequence).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(z1.every((s) => Number.isInteger(s.etaMin))).toBe(true);
    const ids = route.stops.map((st) => st.shipmentId);
    expect(ids).toEqual(expect.arrayContaining(['SIM-0401', 'SIM-0402']));
    const priorities = route.stops.map((st) => mockDb.get('shipments', st.shipmentId).priority);
    expect(priorities.indexOf('normal')).toBeGreaterThan(priorities.lastIndexOf('express'));
    expect(mockDb.all('events').filter((e) => e.toStatus === 'asignado')).toHaveLength(12);
  });
  it('si assignToRoute falla, la ruta no queda guardada y ningún envío cambia', async () => {
    const realGet = mockDb.get;
    jest.spyOn(mockDb, 'get').mockImplementation((name, id) => {
      const d = realGet(name, id);
      return name === 'shipments' && id === 'SIM-0400'
        ? {
            ...d,
            status: 'entregado',
          }
        : d;
    });
    await expect(
      svc.createRoute({
        zoneId: 'Z1',
        date: today,
      }),
    ).rejects.toThrow('No se pueden asignar: SIM-0400 (entregado)');
    expect(mockDb.get('routes', `R-${today}-Z1`)).toBeNull();
    expect(shipmentsOf('Z1').some((s) => s.status === 'asignado' || s.routeId)).toBe(false);
    expect(mockDb.all('events')).toHaveLength(0);
  });
  it('crearla dos veces da error', async () => {
    await svc.createRoute({
      zoneId: 'Z1',
      date: today,
    });
    await expect(
      svc.createRoute({
        zoneId: 'Z1',
        date: today,
      }),
    ).rejects.toThrow('La zona ya tiene una ruta abierta hoy');
  });
  it('Z2 ya tiene la Ruta A abierta', async () => {
    await expect(
      svc.createRoute({
        zoneId: 'Z2',
        date: today,
      }),
    ).rejects.toThrow('La zona ya tiene una ruta abierta hoy');
  });
  it('con la ruta anterior cerrada crea -2, sigue la letra y el motorista ve la nueva', async () => {
    const { routeId: first } = await svc.createRoute({
      zoneId: 'Z1',
      date: today,
    });
    for (const s of shipmentsOf('Z1'))
      mockDb.upsert('shipments', {
        id: s.id,
        status: 'no_entregado',
        attempts: 1,
      });
    const { routeId: second } = await svc.createRoute({
      zoneId: 'Z1',
      date: today,
    });
    expect(second).toBe(`${first}-2`);
    expect(mockDb.get('routes', second).code).toBe('Ruta C');
    expect(mockDb.get('routes', second).stops).toHaveLength(12);
    expect(
      (
        await next((cb) =>
          svc.listenDriverRoute(
            {
              driverId: 'D1',
              date: today,
            },
            cb,
          ),
        )
      ).id,
    ).toBe(second);
  });
  it('no incluye los devueltos (Z4: 11 de 12)', async () => {
    const { routeId } = await svc.createRoute({
      zoneId: 'Z4',
      date: today,
    });
    expect(mockDb.get('routes', routeId).stops).toHaveLength(11);
    expect(mockDb.get('shipments', 'SIM-0437').status).toBe('devuelto');
  });
  it('sin pendientes da error', async () => {
    for (const s of shipmentsOf('Z5'))
      mockDb.upsert('shipments', {
        id: s.id,
        status: 'entregado',
      });
    await expect(
      svc.createRoute({
        zoneId: 'Z5',
        date: today,
      }),
    ).rejects.toThrow('No hay envíos pendientes en esta zona');
  });
  it('zona inexistente da error', async () => {
    await expect(
      svc.createRoute({
        zoneId: 'Z9',
        date: today,
      }),
    ).rejects.toThrow('No existe la zona Z9');
  });
});
describe('createRoute: errores de lectura y skipped (C18, C20)', () => {
  it('devuelve skipped vacío cuando caben todas', async () => {
    const { skipped } = await svc.createRoute({
      zoneId: 'Z1',
      date: today,
    });
    expect(skipped).toEqual([]);
  });
  it('con más de 25 candidatos devuelve los que no entraron en skipped', async () => {
    const base = mockDb.get('shipments', 'SIM-0400');
    for (let i = 0; i < 14; i++) {
      mockDb.upsert('shipments', {
        ...base,
        id: `SIM-09${String(i).padStart(2, '0')}`,
        code: `SIM-09${String(i).padStart(2, '0')}`,
        scheduledTime: '16:30',
      });
    }
    const { routeId, skipped } = await svc.createRoute({
      zoneId: 'Z1',
      date: today,
    });
    expect(mockDb.get('routes', routeId).stops).toHaveLength(25);
    expect(skipped).toHaveLength(1);
    expect(mockDb.get('shipments', skipped[0].id).status).toBe('pendiente');
  });
  it('si una lectura falla, rechaza con el mensaje del listen*', async () => {
    const catalog = require('../src/features/catalog/catalogService');
    jest.spyOn(catalog, 'listenZones').mockImplementation((cb, onError) => {
      Promise.resolve().then(() =>
        onError(new Error('No se pudieron leer los datos. Revise la conexión e intente de nuevo.')),
      );
      return () => {};
    });
    await expect(
      svc.createRoute({
        zoneId: 'Z1',
        date: today,
      }),
    ).rejects.toThrow('No se pudieron leer los datos');
  });
  it('si una lectura no responde en 15 s, rechaza con "No se pudo leer la ruta…"', async () => {
    jest.useFakeTimers({
      doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
    });
    try {
      const catalog = require('../src/features/catalog/catalogService');
      jest.spyOn(catalog, 'listenZones').mockImplementation(() => () => {});
      const pending = svc.createRoute({
        zoneId: 'Z1',
        date: today,
      });
      const check = expect(pending).rejects.toThrow('No se pudo leer la ruta. Revise la conexión');
      jest.advanceTimersByTime(svc.READ_TIMEOUT_MS);
      await check;
    } finally {
      jest.useRealTimers();
    }
  });
  it('si getDepot falla, avisa "Falta el depósito de salida"', async () => {
    const catalog = require('../src/features/catalog/catalogService');
    jest.spyOn(catalog, 'getDepot').mockRejectedValue(new Error('sin red'));
    await expect(
      svc.createRoute({
        zoneId: 'Z1',
        date: today,
      }),
    ).rejects.toThrow('Falta el depósito de salida');
  });
  it('los listen* de rutas aceptan onError como tercer parámetro (C18)', () => {
    expect(svc.listenRoute.length).toBe(3);
    expect(svc.listenRoutes.length).toBe(3);
    expect(svc.listenDriverRoute.length).toBe(3);
  });
});
describe('startRoute', () => {
  it('pasa las paradas a en_ruta y la ruta a en_curso', async () => {
    const { routeId } = await svc.createRoute({
      zoneId: 'Z3',
      date: today,
    });
    const { count } = await svc.startRoute(routeId, 'D3');
    expect(count).toBe(12);
    expect(shipmentsOf('Z3').every((s) => s.status === 'en_ruta')).toBe(true);
    expect(mockDb.get('routes', routeId).status).toBe('en_curso');
    expect(mockDb.all('events').filter((e) => e.toStatus === 'en_ruta' && e.driverId === 'D3')).toHaveLength(12);
  });
  it('no se inicia dos veces', async () => {
    const { routeId } = await svc.createRoute({
      zoneId: 'Z3',
      date: today,
    });
    await svc.startRoute(routeId, 'D3');
    await expect(svc.startRoute(routeId, 'D3')).rejects.toThrow('La Ruta B ya está en curso');
  });
  it('ruta inexistente da error', async () => {
    await expect(svc.startRoute('R-no-existe', 'D1')).rejects.toThrow('No existe la ruta R-no-existe');
  });
});
describe('hora de salida (N12)', () => {
  const day = '2026-10-12';
  const local = (h, min = 0) => new Date(2026, 9, 12, h, min);
  it('routeStartAt: ahora entre 07:00 y 18:00; si no, las 08:00 del día de la ruta', () => {
    expect(svc.routeStartAt(day, local(10, 15))).toEqual(local(10, 15));
    expect(svc.routeStartAt(day, local(7))).toEqual(local(7));
    expect(svc.routeStartAt(day, local(18))).toEqual(local(18));
    expect(svc.routeStartAt(day, local(22, 30))).toEqual(local(8));
    expect(svc.routeStartAt(day, local(6, 59))).toEqual(local(8));
    expect(svc.routeStartAt(day, new Date(2026, 9, 11, 10))).toEqual(local(8));
  });
  describe('createRoute guarda estEnd desde esa hora', () => {
    afterEach(() => jest.useRealTimers());
    async function createAt(when) {
      jest.useFakeTimers({
        now: when,
        doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
      });
      jest.resetModules();
      const s = require('../src/features/routes/routesService');
      const db = require('../src/mocks').mockDb;
      const { routeId: id } = await s.createRoute({
        zoneId: 'Z1',
        date: day,
      });
      return db.get('routes', id);
    }
    it('de día sale ahora (10:15)', async () => {
      const route = await createAt(local(10, 15));
      const end = new Date(route.estEnd);
      const lastEta = route.stops.at(-1).etaMin;
      expect(end.getTime()).toBeGreaterThan(local(10, 15).getTime() + lastEta * 60000);
      expect(end.getDate()).toBe(12);
    });
    it('de noche (22:30) sale a las 08:00: no da "Fin estimado 00:05"', async () => {
      const route = await createAt(local(22, 30));
      const end = new Date(route.estEnd);
      expect(end.getDate()).toBe(12);
      expect(end.getHours()).toBeGreaterThanOrEqual(8);
      expect(end.getHours()).toBeLessThan(18);
    });
  });
});
describe('días anteriores: lo abierto no desaparece al cambiar de día', () => {
  const tomorrow = require('../src/features/dispatch/dispatchMath').addDays(today, 1);
  const OPEN = ['pendiente', 'asignado', 'en_ruta', 'no_entregado'];
  it('listenShipments del día siguiente trae los abiertos de hoy y deja los cerrados', async () => {
    const { listenShipments } = require('../src/features/shipments/shipmentsService');
    const list = await next((cb) =>
      listenShipments(
        {
          date: tomorrow,
        },
        cb,
      ),
    );
    const open = mockDb.all('shipments').filter((s) => OPEN.includes(s.status));
    expect(list.map((s) => s.id).sort()).toEqual(open.map((s) => s.id).sort());
    expect(list.some((s) => s.status === 'entregado' || s.status === 'devuelto')).toBe(false);
  });
  it('la Ruta A sin terminar sigue en el despacho y con su motorista', async () => {
    const routes = await next((cb) =>
      svc.listenRoutes(
        {
          date: tomorrow,
        },
        cb,
      ),
    );
    expect(routes.map((r) => r.id)).toEqual([`R-${today}-Z2`]);
    expect(
      (
        await next((cb) =>
          svc.listenDriverRoute(
            {
              driverId: 'D2',
              date: tomorrow,
            },
            cb,
          ),
        )
      ).id,
    ).toBe(`R-${today}-Z2`);
    await expect(
      svc.createRoute({
        zoneId: 'Z2',
        date: tomorrow,
      }),
    ).rejects.toThrow('La zona ya tiene una ruta abierta hoy');
  });
  it('terminada la ruta, ya no se arrastra', async () => {
    for (const s of shipmentsOf('Z2').filter((x) => x.routeId))
      mockDb.upsert('shipments', {
        id: s.id,
        status: 'entregado',
      });
    expect(
      await next((cb) =>
        svc.listenRoutes(
          {
            date: tomorrow,
          },
          cb,
        ),
      ),
    ).toEqual([]);
    expect(
      await next((cb) =>
        svc.listenDriverRoute(
          {
            driverId: 'D2',
            date: tomorrow,
          },
          cb,
        ),
      ),
    ).toBeNull();
  });
  it('los pendientes de hoy entran a la ruta del día siguiente, que empieza en Ruta A', async () => {
    const pending = shipmentsOf('Z1').filter((s) => s.status === 'pendiente' || s.status === 'no_entregado');
    const { routeId } = await svc.createRoute({
      zoneId: 'Z1',
      date: tomorrow,
    });
    const route = mockDb.get('routes', routeId);
    expect(routeId).toBe(`R-${tomorrow}-Z1`);
    expect(route.code).toBe('Ruta A');
    expect(route.stops).toHaveLength(pending.length);
  });
});
