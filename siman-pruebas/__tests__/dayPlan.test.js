// __tests__/dayPlan.test.js  (dueño: P2)
// Cálculos del despacho y del optimizador sin servidor: mapa, paneles, "Pasar a…", km optimizados y
// el aviso "Rutas al día". Lo que guarda en Firestore lo prueban __integration__/dayPlan.emu.js y serverReads.emu.js.
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

  it('rankMoveTargets: sin vehículo; las rutas con 25 paradas al final, marcadas full', () => {
    const stops = (n) => Array.from({ length: n }, (_, i) => ({ shipmentId: `x${i}` }));
    const targets = [
      { id: 'LLENA', stops: stops(25) },
      { id: 'A', stops: stops(3) },
      { id: 'B', stops: stops(24) },
    ];
    // Sin ubicación del pedido no hay distancia: queda el orden recibido, las llenas al final
    const ranked = dm().rankMoveTargets({ id: 'p' }, targets, {});
    expect(ranked.map((t) => [t.route.id, t.full, t.stops])).toEqual([
      ['A', false, 3],
      ['B', false, 24],
      ['LLENA', true, 25],
    ]);
    expect(dm().moveTargetNote(ranked[2])).toBe('llena: 25 paradas');
  });
});

it('secondsToISO: pasada la medianoche sigue el día siguiente, nunca "T24:"', () => {
  const { secondsToISO } = require('../src/optimizer/geoapify');
  expect(secondsToISO('2026-10-31', 7 * 3600)).toMatch(/^2026-10-31T07:00:00/);
  expect(secondsToISO('2026-10-31', 24.5 * 3600)).toMatch(/^2026-11-01T00:30:00/);
  expect(Number.isNaN(new Date(secondsToISO('2026-12-31', 25 * 3600)).getTime())).toBe(false);
});

it('optimizeDayState: al día solo con rutas de la fecha y sin pedidos nuevos en todo el día', () => {
  const dm = require('../src/features/dispatch/dispatchMath');
  const d = '2026-10-31';
  const route = { id: 'R1', date: d, zoneId: 'Z1', status: 'asignada', stops: [] };
  const nuevo = { id: 'n', status: 'pendiente', zoneId: 'Z3', routeId: null, unassignedReason: null };
  const sinEspacio = { id: 's', status: 'pendiente', zoneId: 'Z1', routeId: null, unassignedReason: 'capacidad' };
  expect(dm.optimizeDayState([sinEspacio], [route], d)).toEqual({ newCount: 0, hasRoutes: true, upToDate: true });
  expect(dm.optimizeDayState([sinEspacio, nuevo], [route], d)).toMatchObject({ newCount: 1, upToDate: false });
  expect(dm.optimizeDayState([nuevo], [], d)).toMatchObject({ hasRoutes: false, upToDate: false });
});

