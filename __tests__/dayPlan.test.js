// __tests__/dayPlan.test.js  (dueño: P2)
// Optimizar día (S4-06 y S4-07): optimizeRoute con respaldo local, optimizeDay y createRoutesForDay.
// Modo mocks: Geoapify responde la grabación de Z1 o el sintético de P1; las fallas se simulan.
import { todayISO } from '../src/lib/dates';

let opt, svc, geo, mockDb;
const today = todayISO();
const tomorrow = () => require('../src/features/dispatch/dispatchMath').addDays(today, 1);

beforeEach(() => {
  jest.resetModules();
  opt = require('../src/optimizer');
  svc = require('../src/features/routes/routesService');
  geo = require('../src/lib/geoapify');
  mockDb = require('../src/mocks').mockDb;
  // Se cuentan las llamadas a Geoapify; responde el mock de P1 (con varios agentes, su fleetPlanner)
  jest.spyOn(geo, 'geoapifyFetch');
});

const data = () => ({
  shipments: mockDb.all('shipments'),
  drivers: mockDb.all('drivers'),
  vehicles: mockDb.all('vehicles'),
  depot: mockDb.all('depots')[0],
  zones: mockDb.all('zones'),
});
const zoneArgs = (zoneId) => {
  const d = data();
  const driver = d.drivers.find((x) => x.zoneId === zoneId);
  return {
    shipments: d.shipments.filter((s) => s.zoneId === zoneId && opt.isPlannable(s)),
    driver,
    vehicle: d.vehicles.find((v) => v.id === driver.vehicleId),
    depot: d.depot,
    date: tomorrow(),
    zoneId,
    zoneName: d.zones.find((z) => z.id === zoneId).name,
  };
};
const failWith = (code) =>
  jest.spyOn(geo, 'geoapifyFetch').mockRejectedValue(new geo.GeoapifyError(code, `falla simulada: ${code}`));

describe('optimizeRoute: Geoapify y respaldo local por zona', () => {
  it('con Geoapify: RoutePlan del contrato (motor, paradas con ETA, km, línea por calles)', async () => {
    const plan = await opt.optimizeRoute(zoneArgs('Z1'));
    expect(plan).toMatchObject({ zoneId: 'Z1', driverId: 'D1', vehicleId: 'V1', engine: 'geoapify', warning: null });
    expect(plan.stops).toHaveLength(6);
    expect(plan.stops[0]).toMatchObject({ stopSequence: 1, etaISO: expect.stringMatching(/T07:\d\d:\d\d-06:00$/) });
    expect(plan.geometry.length).toBeGreaterThan(2);
    expect(plan.baselineKm).toBeGreaterThan(0);
  });

  it.each([
    ['timeout', 'Geoapify no respondió a tiempo'],
    ['quota', 'Se acabaron los créditos de Geoapify por hoy'],
    ['offline', 'No hay conexión a internet'],
  ])('si Geoapify falla con %s, la zona se calcula local y avisa', async (code, why) => {
    failWith(code);
    const plan = await opt.optimizeRoute(zoneArgs('Z1'));
    expect(plan.engine).toBe('local');
    expect(plan.geometry).toBeNull();
    expect(plan.warning).toBe(`${why}; la San Salvador Centro se calculó en el teléfono, sin calles ni horarios.`);
    // El respaldo también saca lo que la moto no puede llevar, con el mismo criterio
    const reasons = Object.fromEntries(plan.unassigned.map((u) => [u.shipmentId, u.reason]));
    expect(reasons['SIM-0400']).toBe('requisito');
    const kg = plan.stops.reduce((s, st) => s + Math.ceil(mockDb.get('shipments', st.shipmentId).weightKg), 0);
    expect(kg).toBeLessThanOrEqual(40);
    expect(plan.stops.length + plan.unassigned.length).toBe(12);
    expect(plan.stops.map((s) => s.stopSequence)).toEqual(plan.stops.map((_, i) => i + 1));
  });

  it('una respuesta inesperada también cae al cálculo local (no rompe el día)', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(geo, 'geoapifyFetch').mockResolvedValue({ features: [{ properties: { actions: 'no-es-lista' } }] });
    const plan = await opt.optimizeRoute(zoneArgs('Z3'));
    expect(plan.engine).toBe('local');
    expect(plan.warning).toMatch(/Geoapify no pudo calcular la ruta; la Antiguo Cuscatlán/);
    err.mockRestore();
  });

  it('fitToVehicle: requisito, capacidad llenando primero express, y máximo de paradas', () => {
    const s = (id, kg, extra = {}) => ({ id, weightKg: kg, requires: [], priority: 'normal', ...extra });
    const moto = { maxKg: 40, capabilities: [] };
    const { fits, unassigned } = opt.fitToVehicle(
      [s('a', 30), s('b', 15, { priority: 'express' }), s('c', 5, { requires: ['carga_grande'] }), s('d', 20)],
      moto,
    );
    expect(fits.map((x) => x.id)).toEqual(['b', 'd']);
    expect(unassigned).toEqual([
      { shipmentId: 'a', reason: 'capacidad' },
      { shipmentId: 'c', reason: 'requisito' },
    ]);
    expect(opt.fitToVehicle([s('a', 1), s('b', 1)], null, 1).unassigned).toEqual([
      { shipmentId: 'b', reason: 'capacidad' },
    ]);
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
  it('una ruta por zona con motorista; ninguna línea blanca va en moto', async () => {
    const d = data();
    const day = await opt.optimizeDay({ date: tomorrow(), ...d });
    expect(day.engine).toBe('geoapify');
    expect(day.plans.map((p) => p.zoneId).sort()).toEqual(['Z1', 'Z2', 'Z3', 'Z4', 'Z5']);
    const vehicleOf = (p) => d.vehicles.find((v) => v.id === p.vehicleId);
    for (const p of day.plans) {
      const v = vehicleOf(p);
      const big = p.stops.filter((st) => mockDb.get('shipments', st.shipmentId).requires?.length);
      if (v.type === 'moto') expect(big).toEqual([]);
      const kg = p.stops.reduce((s, st) => s + Math.ceil(mockDb.get('shipments', st.shipmentId).weightKg), 0);
      expect(kg).toBeLessThanOrEqual(v.maxKg);
    }
    // Cada pedido abierto queda en una ruta o en sin asignar, nunca en los dos ni en ninguno
    const routed = day.plans.flatMap((p) => p.stops.map((s) => s.shipmentId));
    const left = day.unassigned.map((u) => u.shipmentId);
    expect(new Set([...routed, ...left]).size).toBe(routed.length + left.length);
    const open = d.shipments.filter((s) => s.status === 'pendiente' || (s.status === 'no_entregado' && s.attempts < 2));
    expect(routed.length + left.length).toBe(open.length);
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

  it('si Geoapify no está, todas las zonas salen local, con un aviso por zona', async () => {
    failWith('offline');
    const day = await opt.optimizeDay({ date: tomorrow(), ...data() });
    expect(day.engine).toBe('local');
    // Optimización conjunta caída: el día sale por zona en el teléfono, con UN aviso
    expect(day.warnings[0]).toBe(
      'No hay conexión a internet; las rutas se calcularon en el teléfono, por zona, sin calles ni horarios.',
    );
    expect(day.warnings.filter((w) => /calcul(ó|aron) en el teléfono/.test(w))).toHaveLength(1);
    expect(day.plans.every((p) => p.engine === 'local' && p.geometry === null)).toBe(true);
  });

  it('motorista inactivo: no entra al reparto, y los pedidos de su zona los llevan los demás', async () => {
    mockDb.upsert('drivers', { id: 'D5', active: false });
    const day = await opt.optimizeDay({ date: tomorrow(), ...data() });
    expect(day.plans.map((p) => p.driverId)).not.toContain('D5');
    const routed = new Set(day.plans.flatMap((p) => p.stops.map((st) => st.shipmentId)));
    const z5 = data().shipments.filter((s) => s.zoneId === 'Z5' && opt.isPlannable(s));
    expect(z5.some((s) => routed.has(s.id))).toBe(true);
    expect(day.warnings.some((w) => /no tiene motorista/.test(w))).toBe(false);
  });
});

describe('createRoutesForDay', () => {
  it('guarda una ruta por zona (N3), con motivos de lo que no cupo; salta Z2, que ya salió', async () => {
    const date = today;
    const day = await opt.optimizeDay({ date, ...data(), routes: mockDb.all('routes') });
    const { routeIds, warnings } = await svc.createRoutesForDay(date, day);

    // Jorge (Z2) sigue en ruta: no entra como agente; un plan por cada motorista libre
    expect(day.warnings).toContain('Jorge sigue en ruta (Ruta A): no recibe pedidos nuevos.');
    expect(routeIds.sort()).toEqual(['Z1', 'Z3', 'Z4', 'Z5'].map((z) => `R-${date}-${z}`));
    expect(warnings).toEqual([]);
    const codes = routeIds.map((id) => mockDb.get('routes', id).code).sort();
    expect(codes).toEqual(['Ruta B', 'Ruta C', 'Ruta D', 'Ruta E']); // la Ruta A de Z2 ya existía

    for (const id of routeIds) {
      const r = mockDb.get('routes', id);
      expect(r).toMatchObject({ status: 'asignada', date, engine: expect.any(String) });
      expect(r.stops.every((st) => mockDb.get('shipments', st.shipmentId).status === 'asignado')).toBe(true);
      expect(r.stops.every((st) => Number.isInteger(st.seq) && st.etaISO)).toBe(true);
      // Sin arreglos anidados (Firestore no los acepta)
      expect(r.geometry === null || r.geometry.every((p) => typeof p.lat === 'number')).toBe(true);
    }
    // Lo que no cupo queda pendiente con su motivo escrito
    for (const u of day.unassigned.filter((x) => mockDb.get('shipments', x.shipmentId).zoneId !== 'Z2')) {
      expect(mockDb.get('shipments', u.shipmentId)).toMatchObject({
        status: expect.any(String),
        unassignedReason: u.reason,
      });
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
    const z5 = mockDb.get('routes', `R-${date}-Z5`); // Z5 va en moto
    const victim = z5.stops[0].shipmentId;
    mockDb.upsert('shipments', { id: victim, requires: ['carga_grande'] }); // ahora pide carga grande
    // y ningún otro vehículo la lleva: no puede pasar a otra zona
    for (const id of ['V4', 'V5']) mockDb.upsert('vehicles', { id, capabilities: [] });
    await svc.optimizeAndSaveDay(date);
    expect(mockDb.get('shipments', victim)).toMatchObject({
      status: 'pendiente',
      routeId: null,
      unassignedReason: 'requisito',
    });
    expect(mockDb.get('routes', z5.id).stops.map((st) => st.shipmentId)).not.toContain(victim);
    expect(mockDb.all('events').some((e) => e.shipmentId === victim && e.kind === 'liberado')).toBe(true);
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
    expect(dm.unassignedOf(list).map((s) => s.id)).toEqual(['b', 'a']);
    expect(dm.REASON_LABEL.capacidad).toBe('No cabe en el vehículo');
    expect(dm.needsLocationReview({ status: 'pendiente', location: { status: 'revisar' } })).toBe(true);
    expect(dm.needsLocationReview({ status: 'entregado', location: { status: 'revisar' } })).toBe(false);
    expect(dm.needsLocationReview({ status: 'pendiente', location: { status: 'alta' } })).toBe(false);
    expect(dm.engineLabel('local')).toBe('Cálculo local');
    expect(dm.engineLabel('geoapify')).toBe('Geoapify');
    expect(dm.engineLabel('geoapify', { live: false })).toBe('Geoapify (prueba)');
    expect(dm.engineLabel('local', { live: false })).toBe('Cálculo local');
  });
});

describe('optimizeAndSaveDay (botón "Optimizar día")', () => {
  it('una sola llamada al Route Planner con los motoristas libres; quien sigue en ruta no entra', async () => {
    const r = await svc.optimizeAndSaveDay(today);
    const fleetCalls = geo.geoapifyFetch.mock.calls.filter(([, opts]) => (opts?.body?.agents?.length ?? 0) > 1);
    expect(fleetCalls).toHaveLength(1);
    expect(fleetCalls[0][1].body.agents.map((a) => a.id)).toEqual(['D1', 'D3', 'D4', 'D5']); // sin Jorge
    expect(r.warnings).toContain('Jorge sigue en ruta (Ruta A): no recibe pedidos nuevos.');
    // Los pedidos de Escalón NO quedan bloqueados: entran al reparto general (ninguno "espera otra ruta")
    const list = mockDb.all('shipments');
    const byId = Object.fromEntries(list.map((x) => [x.id, x]));
    const waiting = require('../src/features/dispatch/dispatchMath').waitingOf(list, mockDb.all('routes'), byId);
    expect(waiting).toEqual([]);
    const z2Open = list.filter((x) => x.zoneId === 'Z2' && x.status === 'pendiente');
    for (const x of z2Open) expect(x.unassignedReason).toEqual(expect.any(String));
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
    expect(r.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/sigue en ruta \(Ruta A\)/)]));
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
    // Con la optimización conjunta los pendientes de Escalón (Z2, Ruta A en curso) entran al reparto:
    // ninguno queda "esperando otra ruta" sin motivo
    expect(waiting).toEqual([]);
    // Ningún pendiente abierto queda fuera de la cuenta
    const open = list.filter((x) => ['pendiente', 'no_entregado'].includes(x.status) && !x.routeId);
    const counted = new Set([...unassigned, ...waiting.flatMap((g) => g.shipments)].map((x) => x.id));
    expect(open.filter((x) => !counted.has(x.id) && x.zoneId === 'Z2')).toEqual([]);
    const c = dm.unassignedCount(unassigned, waiting, today);
    expect(c.total).toBe(counted.size);
    expect(c.waiting).toBe(0);
  });
});

describe('moveStop (Pasar a…, S4-08)', () => {
  let date, routeOf;
  beforeEach(async () => {
    date = tomorrow();
    // Sin pasar pedidos entre zonas al optimizar, para que queden sin asignar los casos que se mueven a mano
    for (const id of ['V4', 'V5']) mockDb.upsert('vehicles', { id, capabilities: [] });
    await svc.optimizeAndSaveDay(date);
    for (const id of ['V4', 'V5']) mockDb.upsert('vehicles', { id, capabilities: ['carga_grande'] });
    routeOf = (zone) => mockDb.get('routes', `R-${date}-${zone}`);
  });
  const snapshot = (zone) => JSON.stringify(routeOf(zone).stops);

  it('de Sin asignar a otra ruta: la línea blanca de Z1 entra en la pick-up de Z3; las demás rutas no cambian', async () => {
    expect(mockDb.get('shipments', 'SIM-0400')).toMatchObject({ status: 'pendiente', unassignedReason: 'requisito' });
    const untouched = { Z1: snapshot('Z1'), Z4: snapshot('Z4'), Z5: snapshot('Z5') };
    const { routeIds } = await svc.moveStop('SIM-0400', routeOf('Z3').id);
    expect(routeIds).toEqual([routeOf('Z3').id]);
    expect(mockDb.get('shipments', 'SIM-0400')).toMatchObject({
      status: 'asignado',
      routeId: routeOf('Z3').id,
      unassignedReason: null,
    });
    expect(routeOf('Z3').stops.map((st) => st.shipmentId)).toContain('SIM-0400');
    expect({ Z1: snapshot('Z1'), Z4: snapshot('Z4'), Z5: snapshot('Z5') }).toEqual(untouched);
  });

  it('entre rutas: sale de una y entra en la otra; solo esas dos se reoptimizan', async () => {
    const from = routeOf('Z3');
    const moved = from.stops.find((st) => !mockDb.get('shipments', st.shipmentId).requires?.length).shipmentId;
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

  it('no deja pasar carga grande a una moto', async () => {
    await expect(svc.moveStop('SIM-0400', routeOf('Z1').id)).rejects.toThrow(
      'Moto 1 de la Ruta B no lleva carga grande',
    );
  });

  it('no deja pasar lo que no cabe en lo libre del vehículo, y dice cuánto lleva', async () => {
    // La moto de Z1 va casi llena; SIM-0401 pesa 12 kg y no entra en lo libre
    const kg = routeOf('Z1').stops.reduce(
      (sum, st) => sum + Math.ceil(mockDb.get('shipments', st.shipmentId).weightKg ?? 0),
      0,
    );
    expect(kg + 12).toBeGreaterThan(40);
    await expect(svc.moveStop('SIM-0401', routeOf('Z1').id)).rejects.toThrow(
      `No cabe en Moto 1: lleva ${kg} de 40 kg y SIM-0401 pesa 12 kg`,
    );
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

  it('rankMoveTargets: con carga grande, las motos al final y marcadas; sin carga grande, igual que antes', () => {
    const moto = { capabilities: [] };
    const pick = { capabilities: ['carga_grande'] };
    const targets = [{ id: 'M' }, { id: 'P' }, { id: 'N' }];
    const veh = (r) => ({ M: moto, P: pick, N: null })[r.id];
    const big = dm().rankMoveTargets({ requires: ['carga_grande'] }, targets, veh);
    expect(big.map((t) => [t.route.id, t.lacks])).toEqual([
      ['P', false],
      ['N', false],
      ['M', true],
    ]);
    const small = dm().rankMoveTargets({ requires: [] }, targets, veh);
    expect(small.map((t) => [t.route.id, t.lacks])).toEqual([
      ['M', false],
      ['P', false],
      ['N', false],
    ]);
  });
});

describe('reglas del 30 oct: lo que no cabe pasa a otra zona, "Pasar a…" por espacio y cercanía', () => {
  it('respaldo local (por zona): lo que no cabe en la moto de su zona pasa a la ruta con espacio', async () => {
    const date = tomorrow();
    const before = await (async () => {
      for (const id of ['V4', 'V5']) mockDb.upsert('vehicles', { id, capabilities: [], maxKg: 40 });
      const d = await opt.optimizeDay({ date, ...data(), engine: 'local' });
      for (const id of ['V4', 'V5']) mockDb.upsert('vehicles', { id, capabilities: ['carga_grande'] });
      mockDb.upsert('vehicles', { id: 'V4', maxKg: 600 });
      mockDb.upsert('vehicles', { id: 'V5', maxKg: 2000 });
      return d;
    })();
    const after = await opt.optimizeDay({ date, ...data(), engine: 'local' });
    const spill = (d) => d.unassigned.filter((u) => ['capacidad', 'requisito'].includes(u.reason)).length;
    expect(spill(after)).toBeLessThan(spill(before));
    expect(after.warnings.some((w) => /pas(ó|aron) a la ruta con espacio/.test(w))).toBe(true);
    // ningún pedido queda en dos rutas, ni en una ruta y sin asignar a la vez
    const routed = after.plans.flatMap((p) => p.stops.map((st) => st.shipmentId));
    expect(new Set(routed).size).toBe(routed.length);
    expect(after.unassigned.filter((u) => routed.includes(u.shipmentId))).toEqual([]);
  });

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

  it('rankMoveTargets con envíos: las llenas al final con sus kilos, las demás de la más cercana a la más lejana', () => {
    const dm = require('../src/features/dispatch/dispatchMath');
    const at = (lat, lng) => ({ lat, lng, status: 'alta' });
    const byId = {
      a: { id: 'a', routeId: 'LEJOS', status: 'asignado', weightKg: 5, location: at(13.8, -89.0) },
      b: { id: 'b', routeId: 'CERCA', status: 'asignado', weightKg: 5, location: at(13.701, -89.2) },
      c: { id: 'c', routeId: 'LLENA', status: 'asignado', weightKg: 38, location: at(13.7, -89.2) },
    };
    const route = (id, sid) => ({ id, stops: [{ shipmentId: sid }] });
    const targets = [route('LEJOS', 'a'), route('LLENA', 'c'), route('CERCA', 'b')];
    const moto = { maxKg: 40, capabilities: [] };
    const ranked = dm.rankMoveTargets({ weightKg: 4, location: at(13.7, -89.2) }, targets, () => moto, byId);
    expect(ranked.map((t) => t.route.id)).toEqual(['CERCA', 'LEJOS', 'LLENA']);
    expect(ranked[2]).toMatchObject({ full: true, usedKg: 38, maxKg: 40 });
    expect(dm.moveTargetNote(ranked[2])).toBe('llena: 38 de 40 kg');
    expect(dm.moveTargetNote(ranked[0])).toMatch(/^a 0\.\d km$/);
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
      weightKg: 1,
      requires: [],
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
