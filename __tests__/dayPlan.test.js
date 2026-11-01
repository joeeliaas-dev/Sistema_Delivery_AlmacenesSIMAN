// __tests__/dayPlan.test.js  (dueño: P2)
// Optimizar día (S4-06 y S4-07): una ruta por zona con Geoapify, optimizeDay, createRoutesForDay y "Pasar a…".
// Modo mocks: Geoapify responde el Route Planner sintético de P1; las fallas se simulan.
import { todayISO } from '../src/lib/dates';
import { ROUTING } from '../src/config/routing';

let opt, svc, geo, mockDb;
const today = todayISO();
const tomorrow = () => require('../src/features/dispatch/dispatchMath').addDays(today, 1);

// Reloj fijo a las 08:00 de hoy: Geoapify respeta el horario de los express (hasta las 12:00) y el
// turno, así que lo que entra en una ruta de hoy no puede depender de la hora a la que se corre la prueba
const at8 = () => {
  const d = new Date();
  d.setHours(8, 0, 0, 0);
  return d;
};
const ONLY_DATE = [
  'nextTick',
  'setImmediate',
  'queueMicrotask',
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
];
afterEach(() => jest.useRealTimers());
beforeEach(() => {
  jest.useFakeTimers({ now: at8(), doNotFake: ONLY_DATE });
  jest.resetModules();
  opt = require('../src/optimizer');
  svc = require('../src/features/routes/routesService');
  geo = require('../src/lib/geoapify');
  mockDb = require('../src/mocks').mockDb;
  // Se cuentan las llamadas a Geoapify; responde el mock de P1
  jest.spyOn(geo, 'geoapifyFetch');
});

const data = () => ({
  shipments: mockDb.all('shipments'),
  drivers: mockDb.all('drivers'),
  depot: mockDb.all('depots')[0],
  zones: mockDb.all('zones'),
});
const zoneArgs = (zoneId) => {
  const d = data();
  return {
    shipments: d.shipments.filter((s) => s.zoneId === zoneId && opt.isPlannable(s)),
    driver: d.drivers.find((x) => x.zoneId === zoneId),
    depot: d.depot,
    date: tomorrow(),
    zoneId,
  };
};
const failWith = (code) =>
  jest.spyOn(geo, 'geoapifyFetch').mockRejectedValue(new geo.GeoapifyError(code, `falla simulada: ${code}`));
const plannerCalls = () => geo.geoapifyFetch.mock.calls.filter(([path]) => path.startsWith('/v1/routeplanner'));

describe('optimizeRoute: una zona con Geoapify', () => {
  it('RoutePlan del contrato (motor, paradas con ETA, km, línea por calles)', async () => {
    const plan = await opt.optimizeRoute(zoneArgs('Z1'));
    expect(plan).toMatchObject({ zoneId: 'Z1', driverId: 'D1', engine: 'geoapify', warning: null });
    expect(plan.stops).toHaveLength(12);
    expect(plan.unassigned).toEqual([]);
    expect(plan.stops[0]).toMatchObject({ stopSequence: 1, etaISO: expect.stringMatching(/T07:\d\d:\d\d-06:00$/) });
    expect(plan.stops.map((s) => s.stopSequence)).toEqual(plan.stops.map((_, i) => i + 1));
    expect(plan.geometry.length).toBeGreaterThan(2);
    expect(plan.baselineKm).toBeGreaterThanOrEqual(plan.km);
    expect(plannerCalls()).toHaveLength(1);
  });

  it('si Geoapify falla, lanza el error (no hay cálculo en el teléfono)', async () => {
    failWith('timeout');
    await expect(opt.optimizeRoute(zoneArgs('Z1'))).rejects.toThrow('falla simulada: timeout');
  });

  it(`más de ${ROUTING.maxStops} pedidos: entran los primeros por prioridad y hora; el resto queda por capacidad`, async () => {
    const args = zoneArgs('Z1');
    const extra = Array.from({ length: 20 }, (_, i) => ({
      ...args.shipments[0],
      id: `X${i}`,
      code: `X${i}`,
      priority: 'normal',
      scheduledTime: '17:00',
    }));
    const plan = await opt.optimizeRoute({ ...args, shipments: [...args.shipments, ...extra] });
    expect(plannerCalls()[0][1].body.jobs).toHaveLength(ROUTING.maxStops);
    const over = plan.unassigned.filter((u) => u.reason === 'capacidad');
    expect(over).toHaveLength(12 + 20 - ROUTING.maxStops);
    expect(over.every((u) => u.shipmentId.startsWith('X'))).toBe(true);
  });

  it('departureSec: hoy dentro del turno sale ahora; otro día o fuera del turno, al inicio del turno', () => {
    const d = { shiftStart: '07:00', shiftEnd: '18:00' };
    const at = (h, m = 0) => new Date(2026, 9, 28, h, m);
    expect(opt.departureSec('2026-10-28', d, at(10, 15))).toBe(10 * 3600 + 15 * 60);
    expect(opt.departureSec('2026-10-28', d, at(22, 30))).toBe(7 * 3600);
    expect(opt.departureSec('2026-10-28', d, at(6))).toBe(7 * 3600);
    expect(opt.departureSec('2026-10-29', d, at(10))).toBe(7 * 3600);
  });
});

describe('optimizeDay', () => {
  it('una ruta por zona, una llamada por zona; ningún pedido se pierde ni se cuenta dos veces', async () => {
    const d = data();
    const day = await opt.optimizeDay({ date: tomorrow(), ...d });
    expect(day.engine).toBe('geoapify');
    expect(day.plans.map((p) => p.zoneId)).toEqual(['Z1', 'Z2', 'Z3', 'Z4', 'Z5']);
    expect(day.plans.map((p) => p.driverId)).toEqual(['D1', 'D2', 'D3', 'D4', 'D5']);
    expect(plannerCalls()).toHaveLength(5);
    // Cada pedido abierto queda en una ruta o en sin asignar, nunca en los dos ni en ninguno
    const routed = day.plans.flatMap((p) => p.stops.map((s) => s.shipmentId));
    const left = day.unassigned.map((u) => u.shipmentId);
    expect(new Set([...routed, ...left]).size).toBe(routed.length + left.length);
    const open = d.shipments.filter((s) => s.status === 'pendiente' || (s.status === 'no_entregado' && s.attempts < 2));
    expect(routed.length + left.length).toBe(open.length);
    for (const pl of day.plans)
      expect(pl.stops.every((st) => mockDb.get('shipments', st.shipmentId).zoneId === pl.zoneId)).toBe(true);
  });

  it('no entra ningún pedido con ubicación "revisar" o "sin_ubicacion": vuelven como sin_ubicacion', async () => {
    mockDb.upsert('shipments', {
      id: 'SIM-0410',
      location: { ...mockDb.get('shipments', 'SIM-0410').location, status: 'revisar' },
    });
    mockDb.upsert('shipments', { id: 'SIM-0445', location: { lat: null, lng: null, status: 'sin_ubicacion' } });
    const day = await opt.optimizeDay({ date: tomorrow(), ...data() });
    const routed = day.plans.flatMap((p) => p.stops.map((s) => s.shipmentId));
    expect(routed).not.toContain('SIM-0410');
    expect(routed).not.toContain('SIM-0445');
    expect(day.unassigned).toEqual(
      expect.arrayContaining([
        { shipmentId: 'SIM-0410', reason: 'sin_ubicacion' },
        { shipmentId: 'SIM-0445', reason: 'sin_ubicacion' },
      ]),
    );
  });

  it('si Geoapify falla, el día no se guarda a medias: avisa que se intente de nuevo', async () => {
    failWith('offline');
    await expect(opt.optimizeDay({ date: tomorrow(), ...data() })).rejects.toThrow(
      'Geoapify no pudo calcular las rutas (falla simulada: offline). Intente de nuevo en un momento.',
    );
  });

  it('motorista dado de baja: su zona no tiene ruta y lo dice; las demás siguen igual', async () => {
    mockDb.upsert('drivers', { id: 'D5', active: false });
    const day = await opt.optimizeDay({ date: tomorrow(), ...data() });
    expect(day.plans.map((p) => p.zoneId)).toEqual(['Z1', 'Z2', 'Z3', 'Z4']);
    expect(day.warnings.some((w) => /no tiene motorista activo/.test(w))).toBe(true);
  });

  it('hoy la zona cuya ruta ya salió no se toca ni se le pregunta a Geoapify', async () => {
    const day = await opt.optimizeDay({ date: today, ...data(), routes: mockDb.all('routes') });
    expect(day.plans.map((p) => p.zoneId)).not.toContain('Z2');
    expect(day.warnings.some((w) => /ya salió con la Ruta A; no se cambió\./.test(w))).toBe(true);
    expect(plannerCalls()).toHaveLength(4);
  });
});

describe('createRoutesForDay', () => {
  it('guarda una ruta por zona (N3); salta Z2, que ya salió', async () => {
    const date = today;
    const day = await opt.optimizeDay({ date, ...data(), routes: mockDb.all('routes') });
    const { routeIds, warnings } = await svc.createRoutesForDay(date, day);
    expect(routeIds.sort()).toEqual(['Z1', 'Z3', 'Z4', 'Z5'].map((z) => `R-${date}-${z}`));
    expect(warnings).toEqual([]);
    const codes = routeIds.map((id) => mockDb.get('routes', id).code).sort();
    expect(codes).toEqual(['Ruta B', 'Ruta C', 'Ruta D', 'Ruta E']); // la Ruta A de Z2 ya existía

    for (const id of routeIds) {
      const r = mockDb.get('routes', id);
      expect(r).toMatchObject({ status: 'asignada', date, engine: 'geoapify' });
      expect(r).not.toHaveProperty('vehicleId');
      expect(r.stops.every((st) => mockDb.get('shipments', st.shipmentId).status === 'asignado')).toBe(true);
      expect(r.stops.every((st) => Number.isInteger(st.seq) && st.etaISO)).toBe(true);
      // Sin arreglos anidados (Firestore no los acepta)
      expect(r.geometry.every((p) => typeof p.lat === 'number')).toBe(true);
    }
  });

  it('zona con ruta sin iniciar: se rehace en el mismo id y con la misma letra (C33)', async () => {
    const date = tomorrow();
    const first = await svc.optimizeAndSaveDay(date);
    const codes = Object.fromEntries(first.routeIds.map((id) => [id, mockDb.get('routes', id).code]));
    // Llega un pedido nuevo a Z3: al volver a optimizar entra en una de las rutas (la más cercana)
    const base = mockDb.get('shipments', 'SIM-0425');
    mockDb.upsert('shipments', {
      ...base,
      id: 'SIM-0990',
      code: 'SIM-0990',
      status: 'pendiente',
      routeId: null,
      stopSequence: null,
    });
    const again = await svc.optimizeAndSaveDay(date);
    expect(again.routeIds.sort()).toEqual(first.routeIds.sort());
    expect(again.replaced.sort()).toEqual(first.routeIds.sort());
    for (const id of again.routeIds) expect(mockDb.get('routes', id).code).toBe(codes[id]);
    const holder = again.routeIds
      .map((id) => mockDb.get('routes', id))
      .find((r) => r.stops.some((st) => st.shipmentId === 'SIM-0990'));
    expect(holder).toBeDefined();
    expect(mockDb.get('shipments', 'SIM-0990')).toMatchObject({ status: 'asignado', routeId: holder.id });
    expect(holder.stops.map((st) => st.seq)).toEqual(holder.stops.map((_, i) => i + 1));
  });

  it('al rehacer, lo que ya no entra vuelve a pendiente sin ruta y con su motivo (evento liberado)', async () => {
    const date = tomorrow();
    await svc.optimizeAndSaveDay(date);
    const z5 = mockDb.get('routes', `R-${date}-Z5`);
    // Llega un pedido nuevo (así se puede volver a optimizar) y el turno de Z5 se acorta
    mockDb.upsert('shipments', {
      ...mockDb.get('shipments', z5.stops[0].shipmentId),
      id: 'SIM-0991',
      code: 'SIM-0991',
      status: 'pendiente',
      routeId: null,
      stopSequence: null,
    });
    mockDb.upsert('drivers', { id: 'D5', shiftStart: '07:00', shiftEnd: '07:40' });
    await svc.optimizeAndSaveDay(date);
    const left = z5.stops.map((st) => st.shipmentId).filter((id) => mockDb.get('shipments', id).status === 'pendiente');
    expect(left.length).toBeGreaterThan(0);
    for (const id of left) {
      expect(mockDb.get('shipments', id)).toMatchObject({ routeId: null, unassignedReason: 'ventana' });
      expect(mockDb.all('events').some((e) => e.shipmentId === id && e.kind === 'liberado')).toBe(true);
    }
  });

  it('routeGeometry devuelve [[lat, lng]] para DispatchMap, venga como objetos o como pares', () => {
    expect(
      svc.routeGeometry({
        geometry: [
          { lat: 1, lng: 2 },
          { lat: 3, lng: 4 },
        ],
      }),
    ).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(
      svc.routeGeometry({
        geometry: [
          [1, 2],
          [3, 4],
        ],
      }),
    ).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(svc.routeGeometry({ geometry: null })).toBeNull();
    expect(
      svc.geometryToDoc([
        [1, 2],
        [3, 4],
      ]),
    ).toEqual([
      { lat: 1, lng: 2 },
      { lat: 3, lng: 4 },
    ]);
  });
});

describe('despacho S4-09: cálculos del mapa y de los paneles', () => {
  let dm;
  beforeEach(() => {
    dm = require('../src/features/dispatch/dispatchMath');
  });
  const palette = ['#111111', '#222222'];
  const tonesForPins = { pending: 'P', unassigned: 'U', delivered: 'D', fallback: 'F' };

  it('routeColorMap: un color por ruta, en orden y dando la vuelta a la paleta', () => {
    expect(dm.routeColorMap([{ id: 'a' }, { id: 'b' }, { id: 'c' }], palette)).toEqual({
      a: '#111111',
      b: '#222222',
      c: '#111111',
    });
  });

  it('toDispatchRoutes: por calles con geometry; recta y punteada desde el depósito sin ella', () => {
    const depot = { location: { lat: 1, lng: 1 } };
    const shipmentsById = { s1: { location: { lat: 2, lng: 2 } }, s2: { location: { lat: 3, lng: 3 } } };
    const routes = [
      {
        id: 'g',
        geometry: [
          { lat: 1, lng: 1 },
          { lat: 2, lng: 2 },
        ],
        stops: [],
      },
      {
        id: 'l',
        geometry: null,
        stops: [
          { shipmentId: 's2', seq: 2 },
          { shipmentId: 's1', seq: 1 },
        ],
      },
      { id: 'vacía', geometry: null, stops: [] },
    ];
    expect(dm.toDispatchRoutes(routes, shipmentsById, depot, { g: 'G', l: 'L' })).toEqual([
      {
        id: 'g',
        color: 'G',
        coords: [
          [1, 1],
          [2, 2],
        ],
        dashed: false,
      },
      {
        id: 'l',
        color: 'L',
        coords: [
          [1, 1],
          [2, 2],
          [3, 3],
        ],
        dashed: true,
      },
    ]);
  });

  it('toDispatchPins: color de su ruta y número de parada; sin ruta naranja o rojo; entregado verde', () => {
    const at = { lat: 13.7, lng: -89.2 };
    const pins = dm.toDispatchPins(
      [
        {
          id: 'r',
          code: 'SIM-1',
          customer: { name: 'Ana' },
          location: at,
          status: 'asignado',
          routeId: 'R1',
          stopSequence: 3,
        },
        { id: 'p', location: at, status: 'pendiente' },
        { id: 'u', location: at, status: 'pendiente', unassignedReason: 'capacidad' },
        { id: 'e', location: at, status: 'entregado', routeId: 'R1' },
        { id: 'sin', location: { lat: null, lng: null }, status: 'pendiente' },
      ],
      { R1: '#ABCDEF' },
      tonesForPins,
    );
    expect(pins.map((p) => [p.id, p.color, p.label])).toEqual([
      ['r', '#ABCDEF', '3'],
      ['p', 'P', ''],
      ['u', 'U', ''],
      ['e', 'D', '1'.slice(1)],
    ]);
    expect(pins[0].title).toBe('SIM-1 · Ana');
    // Fuera de ruta: punto chico (C37); con ruta, el pin normal con su número
    expect(pins.map((p) => [p.id, p.size])).toEqual([
      ['r', undefined],
      ['p', 'sm'],
      ['u', 'sm'],
      ['e', undefined],
    ]);
  });

  it('unassignedOf y needsLocationReview', () => {
    const list = [
      { id: 'a', code: 'A', status: 'pendiente', unassignedReason: 'ventana' },
      { id: 'b', code: 'B', status: 'pendiente', unassignedReason: 'capacidad' },
      { id: 'c', code: 'C', status: 'asignado', routeId: 'R', unassignedReason: null },
      { id: 'd', code: 'D', status: 'pendiente', unassignedReason: null },
    ];
    // Orden de REASON_LABEL: ruta llena (25 paradas), horario, ubicación
    expect(dm.unassignedOf(list).map((s) => s.id)).toEqual(['b', 'a']);
    expect(dm.REASON_LABEL).toEqual({
      capacidad: 'La ruta ya lleva 25 paradas',
      ventana: 'No alcanza su horario',
      sin_ubicacion: 'Sin ubicación confirmada',
    });
    expect(dm.needsLocationReview({ status: 'pendiente', location: { status: 'revisar' } })).toBe(true);
    expect(dm.needsLocationReview({ status: 'entregado', location: { status: 'revisar' } })).toBe(false);
    expect(dm.needsLocationReview({ status: 'pendiente', location: { status: 'alta' } })).toBe(false);
    // Siempre Geoapify (C53); "(prueba)" con la API apagada
    expect(dm.engineLabel('geoapify')).toBe('Geoapify');
    expect(dm.engineLabel('geoapify', { live: false })).toBe('Geoapify (prueba)');
  });
});

describe('optimizeAndSaveDay (botón "Optimizar día")', () => {
  it('hoy: una llamada por zona libre; la zona en ruta no entra y sus pendientes esperan otra ruta', async () => {
    const r = await svc.optimizeAndSaveDay(today);
    expect(
      plannerCalls()
        .map(([, o]) => o.body.agents[0].id)
        .sort(),
    ).toEqual(['D1', 'D3', 'D4', 'D5']); // sin Jorge
    expect(r.warnings.some((w) => /ya salió con la Ruta A/.test(w))).toBe(true);
    const list = mockDb.all('shipments');
    const byId = Object.fromEntries(list.map((x) => [x.id, x]));
    const waiting = require('../src/features/dispatch/dispatchMath').waitingOf(list, mockDb.all('routes'), byId);
    const z2Open = list.filter((x) => x.zoneId === 'Z2' && x.status === 'pendiente' && !x.routeId);
    expect(
      waiting
        .flatMap((g) => g.shipments)
        .map((x) => x.id)
        .sort(),
    ).toEqual(z2Open.map((x) => x.id).sort());
  });

  it('mañana no repite la letra de la ruta que sigue abierta desde hoy (N37): ninguna "Ruta A" doble', async () => {
    const date = tomorrow();
    const r = await svc.optimizeAndSaveDay(date);
    const { listenRoutes } = svc;
    const shown = await new Promise((resolve) => {
      const stop = listenRoutes({ date }, (l) => {
        resolve(l);
        setTimeout(() => stop?.());
      });
    });
    expect(shown.some((x) => x.date < date && x.code === 'Ruta A')).toBe(true); // la de hoy, en curso
    const codes = shown.map((x) => x.code);
    expect(new Set(codes).size).toBe(codes.length);
    // C45: Escalón también tiene ruta mañana (la Ruta A en curso de hoy no la bloquea), sin repetir la A
    expect(r.routeIds.map((id) => mockDb.get('routes', id).code).sort()).toEqual([
      'Ruta B',
      'Ruta C',
      'Ruta D',
      'Ruta E',
      'Ruta F',
    ]);
    expect(r.routeIds).toContain(`R-${date}-Z2`);
  });

  it('lee la fecha, optimiza y guarda; devuelve rutas, avisos, motor y cuántos quedaron sin asignar', async () => {
    const r = await svc.optimizeAndSaveDay(today);
    expect(r.routeIds).toHaveLength(4);
    expect(r.engine).toBe('geoapify');
    expect(r.unassigned).toBeGreaterThanOrEqual(0);
  });

  it('si Geoapify falla no se guarda nada', async () => {
    const before = JSON.stringify(mockDb.all('routes'));
    failWith('quota');
    await expect(svc.optimizeAndSaveDay(tomorrow())).rejects.toThrow('Intente de nuevo');
    expect(JSON.stringify(mockDb.all('routes'))).toBe(before);
  });

  it('resumen y panel salen de la misma cuenta: con motivo + los que esperan otra ruta', async () => {
    const r = await svc.optimizeAndSaveDay(today);
    const { listenShipments } = require('../src/features/shipments/shipmentsService');
    const dm = require('../src/features/dispatch/dispatchMath');
    const list = await new Promise((resolve) => {
      const stop = listenShipments({ date: today }, (l) => {
        resolve(l);
        setTimeout(() => stop?.());
      });
    });
    const routes = mockDb.all('routes').filter((x) => x.date === today);
    const byId = Object.fromEntries(list.map((x) => [x.id, x]));
    const unassigned = dm.unassignedOf(list);
    const waiting = dm.waitingOf(list, routes, byId);
    // Lo que optimizeAndSaveDay dice que escribió es lo que el panel ve con motivo
    expect(r.unassigned).toBe(unassigned.length);
    // Ningún pendiente abierto queda fuera de la cuenta
    const open = list.filter((x) => ['pendiente', 'no_entregado'].includes(x.status) && !x.routeId);
    const counted = new Set([...unassigned, ...waiting.flatMap((g) => g.shipments)].map((x) => x.id));
    expect(open.filter((x) => !counted.has(x.id))).toEqual([]);
    const c = dm.unassignedCount(unassigned, waiting, today);
    expect(c.total).toBe(counted.size);
  });
});

describe('moveStop (Pasar a…, S4-08)', () => {
  let date, routeOf;
  beforeEach(async () => {
    date = tomorrow();
    await svc.optimizeAndSaveDay(date);
    routeOf = (zone) => mockDb.get('routes', `R-${date}-${zone}`);
  });
  const snapshot = (zone) => JSON.stringify(routeOf(zone).stops);

  it('de Sin asignar a otra ruta: entra en esa ruta; las demás rutas no cambian', async () => {
    mockDb.upsert('shipments', {
      ...mockDb.get('shipments', 'SIM-0400'),
      id: 'SIM-0992',
      code: 'SIM-0992',
      status: 'pendiente',
      routeId: null,
      stopSequence: null,
      unassignedReason: 'capacidad',
    });
    const untouched = { Z1: snapshot('Z1'), Z4: snapshot('Z4'), Z5: snapshot('Z5') };
    const { routeIds } = await svc.moveStop('SIM-0992', routeOf('Z3').id);
    expect(routeIds).toEqual([routeOf('Z3').id]);
    expect(mockDb.get('shipments', 'SIM-0992')).toMatchObject({
      status: 'asignado',
      routeId: routeOf('Z3').id,
      unassignedReason: null,
    });
    expect(routeOf('Z3').stops.map((st) => st.shipmentId)).toContain('SIM-0992');
    expect({ Z1: snapshot('Z1'), Z4: snapshot('Z4'), Z5: snapshot('Z5') }).toEqual(untouched);
  });

  it('entre rutas: sale de una y entra en la otra; solo esas dos se reoptimizan', async () => {
    const moved = routeOf('Z3').stops[0].shipmentId;
    const untouched = { Z1: snapshot('Z1'), Z5: snapshot('Z5') };
    const { routeIds } = await svc.moveStop(moved, routeOf('Z4').id);
    expect(routeIds.sort()).toEqual([routeOf('Z3').id, routeOf('Z4').id].sort());
    expect(routeOf('Z3').stops.map((st) => st.shipmentId)).not.toContain(moved);
    expect(routeOf('Z4').stops.map((st) => st.shipmentId)).toContain(moved);
    expect(mockDb.get('shipments', moved)).toMatchObject({ status: 'asignado', routeId: routeOf('Z4').id });
    for (const z of ['Z3', 'Z4'])
      expect(routeOf(z).stops.map((st) => st.seq)).toEqual(routeOf(z).stops.map((_, i) => i + 1));
    expect({ Z1: snapshot('Z1'), Z5: snapshot('Z5') }).toEqual(untouched);
  });

  it('no deja pasar a una ruta que ya lleva el máximo de paradas', async () => {
    const full = routeOf('Z4');
    const tpl = mockDb.get('shipments', full.stops[0].shipmentId);
    const filler = Array.from({ length: ROUTING.maxStops - full.stops.length }, (_, i) => `F${i}`);
    for (const id of filler)
      mockDb.upsert('shipments', { ...tpl, id, code: id, status: 'pendiente', routeId: null, stopSequence: null });
    await svc.optimizeAndSaveDay(date);
    expect(routeOf('Z4').stops).toHaveLength(ROUTING.maxStops);
    const mover = routeOf('Z3').stops[0].shipmentId;
    await expect(svc.moveStop(mover, routeOf('Z4').id)).rejects.toThrow('la ruta ya lleva el máximo de paradas');
  });

  it('no mueve hacia (ni desde) una ruta ya iniciada', async () => {
    const z2 = mockDb.all('routes').find((r) => r.zoneId === 'Z2' && r.status === 'en_curso');
    await expect(svc.moveStop('SIM-0400', z2.id)).rejects.toThrow(`La ${z2.code} ya inició`);
    await svc.startRoute(routeOf('Z3').id, 'D3');
    const fromStarted = routeOf('Z3').stops[0].shipmentId;
    mockDb.upsert('shipments', { id: fromStarted, status: 'asignado' }); // sigue en una ruta en curso
    await expect(svc.moveStop(fromStarted, routeOf('Z4').id)).rejects.toThrow(`La ${routeOf('Z3').code} ya inició`);
  });

  it('a la misma ruta, o un pedido entregado, da un mensaje claro', async () => {
    const st = routeOf('Z4').stops[0].shipmentId;
    await expect(svc.moveStop(st, routeOf('Z4').id)).rejects.toThrow('ya está en la');
    await expect(svc.moveStop('SIM-0417', routeOf('Z4').id)).rejects.toThrow('no se puede mover: está entregado');
  });
});

describe('moveTargets (menú Pasar a…)', () => {
  const dm = () => require('../src/features/dispatch/dispatchMath');
  const loc = { lat: 13.7, lng: -89.2, status: 'alta' };
  const routes = [
    { id: 'A', date: 'D', status: 'asignada', stops: [{ shipmentId: 'x' }] },
    { id: 'B', date: 'D', status: 'asignada', stops: [] },
    { id: 'C', date: 'D', status: 'en_curso', stops: [] },
    { id: 'V', date: 'AYER', status: 'asignada', stops: [] },
  ];
  it('rutas del día sin salir, menos la suya', () => {
    const s = { id: 'x', status: 'asignado', routeId: 'A', location: loc };
    expect(
      dm()
        .moveTargets(s, routes, { x: s }, 'D')
        .map((r) => r.id),
    ).toEqual(['B']);
    const free = { id: 'p', status: 'pendiente', location: loc };
    expect(
      dm()
        .moveTargets(free, routes, {}, 'D')
        .map((r) => r.id),
    ).toEqual(['A', 'B']);
  });
  it('ninguna si el pedido no se puede mover, no tiene ubicación o su ruta ya salió', () => {
    expect(dm().moveTargets({ status: 'entregado', location: loc }, routes, {}, 'D')).toEqual([]);
    expect(dm().moveTargets({ status: 'pendiente', location: { ...loc, status: 'revisar' } }, routes, {}, 'D')).toEqual(
      [],
    );
    const onStarted = { id: 'y', status: 'asignado', routeId: 'C', location: loc };
    expect(dm().moveTargets(onStarted, routes, {}, 'D')).toEqual([]);
    const enRuta = { x: { id: 'x', status: 'en_ruta' } };
    expect(
      dm()
        .moveTargets({ id: 'p', status: 'pendiente', location: loc }, routes, enRuta, 'D')
        .map((r) => r.id),
    ).toEqual(['B']);
  });
});

describe('KPI Km optimizados con Geoapify (línea base comparable)', () => {
  it('la proporción del ahorro en línea recta se aplica a los km reales; nunca menos que totalKm', () => {
    const depot = { location: { lat: 13.7, lng: -89.2 } };
    const p = (id, k, t) => ({
      id,
      location: { lat: 13.7, lng: -89.2 + k * 0.01 },
      scheduledTime: t,
      priority: 'normal',
    });
    // Orden por hora: 3, 1, 2 (va y vuelve); orden optimizado: 1, 2, 3 (en línea)
    const optimized = [p('a', 1, '10:00'), p('b', 2, '11:00'), p('c', 3, '09:00')];
    const base = opt.comparableBaselineKm(depot, optimized, 20);
    expect(base).toBeGreaterThan(20);
    // byTime = 3+2+1 = 6 tramos de 0.01°, orden = 3 tramos → la base real es el doble
    expect(base).toBeCloseTo(40, 0);
    const worse = [p('c', 3, '09:00'), p('a', 1, '10:00'), p('b', 2, '11:00')]; // ya es el orden por hora
    expect(opt.comparableBaselineKm(depot, worse, 20)).toBe(20);
  });

  it('las rutas de Geoapify dan ahorro mayor o igual a 0 en optimizeDay', async () => {
    const day = await opt.optimizeDay({ date: tomorrow(), ...data() });
    for (const p of day.plans.filter((x) => x.engine === 'geoapify')) expect(p.baselineKm).toBeGreaterThanOrEqual(p.km);
  });
});

describe('Pasar a… · textos de la revisión de P3', () => {
  const dm = () => require('../src/features/dispatch/dispatchMath');
  const byId = { a: { code: 'SIM-1' }, b: { code: 'SIM-2' }, c: { code: 'SIM-3' }, d: { code: 'SIM-4' } };

  it('droppedNote: singular, plural y hasta 3 nombres', () => {
    expect(dm().droppedNote([], byId)).toBe('');
    expect(dm().droppedNote([{ shipmentId: 'a' }], byId)).toBe('1 pedido ya no entró y quedó en Sin asignar: SIM-1.');
    expect(
      dm().droppedNote(
        ['a', 'b'].map((shipmentId) => ({ shipmentId })),
        byId,
      ),
    ).toBe('2 pedidos ya no entraron y quedaron en Sin asignar: SIM-1, SIM-2.');
    expect(
      dm().droppedNote(
        ['a', 'b', 'c', 'd'].map((shipmentId) => ({ shipmentId })),
        byId,
      ),
    ).toBe('4 pedidos ya no entraron y quedaron en Sin asignar: SIM-1, SIM-2, SIM-3 y 1 más.');
  });

  it('moveLockedNote: solo para pedidos de una ruta que ya salió', () => {
    const routes = [
      { id: 'out', status: 'en_curso', stops: [{ shipmentId: 's1' }] },
      { id: 'new', status: 'asignada', stops: [{ shipmentId: 's2' }] },
    ];
    const ships = {
      s1: { id: 's1', status: 'asignado', routeId: 'out' },
      s2: { id: 's2', status: 'asignado', routeId: 'new' },
      s3: { id: 's3', status: 'entregado', routeId: 'out' },
    };
    expect(dm().moveLockedNote(ships.s1, routes, ships)).toBe('Su ruta ya salió: no se puede pasar a otra');
    expect(dm().moveLockedNote(ships.s2, routes, ships)).toBeNull();
    expect(dm().moveLockedNote(ships.s3, routes, ships)).toBeNull();
    expect(dm().moveLockedNote({ id: 'p', status: 'pendiente' }, routes, ships)).toBeNull();
  });

  it('rankMoveTargets: las rutas con 25 paradas al final, marcadas full', () => {
    const stops = (n) => Array.from({ length: n }, (_, i) => ({ shipmentId: `x${i}` }));
    const targets = [
      { id: 'LLENA', stops: stops(25) },
      { id: 'A', stops: stops(3) },
      { id: 'B', stops: stops(24) },
    ];
    expect(
      dm()
        .rankMoveTargets({ id: 'p' }, targets)
        .map((t) => [t.route.id, t.full]),
    ).toEqual([
      ['A', false],
      ['B', false],
      ['LLENA', true],
    ]);
  });
});

describe('reglas del 30 oct: cada pedido en una sola ruta', () => {
  it('guardar el día con pedidos de otra zona deja cada pedido en una sola ruta', async () => {
    const date = tomorrow();
    await svc.optimizeAndSaveDay(date);
    await svc.optimizeAndSaveDay(date);
    const routes = mockDb.all('routes').filter((r) => r.date === date);
    const stops = routes.flatMap((r) => r.stops.map((st) => [st.shipmentId, r.id]));
    expect(new Set(stops.map(([id]) => id)).size).toBe(stops.length);
    for (const [id, routeId] of stops)
      expect(mockDb.get('shipments', id)).toMatchObject({ status: 'asignado', routeId });
  });
});

it('secondsToISO: pasada la medianoche sigue el día siguiente, nunca "T24:"', () => {
  const { secondsToISO } = require('../src/optimizer/geoapify');
  expect(secondsToISO('2026-10-31', 7 * 3600)).toMatch(/^2026-10-31T07:00:00/);
  expect(secondsToISO('2026-10-31', 24.5 * 3600)).toMatch(/^2026-11-01T00:30:00/);
  expect(Number.isNaN(new Date(secondsToISO('2026-12-31', 25 * 3600)).getTime())).toBe(false);
});

it('optimizar un día no toca las rutas sin salir de otro día (bug del 30 oct)', async () => {
  const dm = require('../src/features/dispatch/dispatchMath');
  const sat = dm.addDays(today, 1);
  const sun = dm.addDays(today, 2);
  await svc.optimizeAndSaveDay(sat);
  const satBefore = JSON.stringify(
    mockDb
      .all('routes')
      .filter((r) => r.date === sat)
      .map((r) => [r.id, r.stops]),
  );
  const tpl = mockDb.all('shipments').find((s) => s.zoneId === 'Z3' && s.location?.lat);
  for (const n of [1, 2, 3])
    mockDb.upsert('shipments', {
      ...tpl,
      id: `SIM-99${n}0`,
      code: `SIM-99${n}0`,
      scheduledDate: sun,
      status: 'pendiente',
      attempts: 0,
      routeId: null,
      stopSequence: null,
      unassignedReason: null,
    });
  const res = await svc.optimizeAndSaveDay(sun);
  // las del sábado quedan igual y el domingo tiene sus propias rutas con sus pedidos
  expect(
    JSON.stringify(
      mockDb
        .all('routes')
        .filter((r) => r.date === sat)
        .map((r) => [r.id, r.stops]),
    ),
  ).toBe(satBefore);
  expect(res.replaced).toEqual([]);
  expect(res.routeIds.every((id) => mockDb.get('routes', id).date === sun)).toBe(true);
  for (const n of [1, 2, 3]) {
    const s = mockDb.get('shipments', `SIM-99${n}0`);
    expect(s.status).toBe('asignado');
    expect(mockDb.get('routes', s.routeId).date).toBe(sun);
  }
  // y "Generar ruta de esta zona" del domingo no se bloquea por la ruta del sábado
  const zoneOfSat = mockDb.all('routes').find((r) => r.date === sat).zoneId;
  const routesSun = mockDb.all('routes').filter((r) => r.date === sun && r.zoneId === zoneOfSat);
  expect(routesSun.length).toBeLessThanOrEqual(1);
});
