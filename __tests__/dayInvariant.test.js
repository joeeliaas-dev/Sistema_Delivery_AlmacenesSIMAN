// __tests__/dayInvariant.test.js  (dueño: P2)
// Lo que vale para TODO plan del día, con cualquier método (por zona, conjunta por rondas, híbrido):
// los ids de day.unassigned son únicos, ninguno está en una ruta, ningún pedido va en dos rutas, y
// en ruta + sin asignar = pedidos abiertos del día (pendientes y reintentos, con o sin ubicación).
jest.mock('../src/lib/geoapify', () => {
  const actual = jest.requireActual('../src/lib/geoapify');
  return { ...actual, geoapifyFetch: jest.fn() };
});
const geo = require('../src/lib/geoapify');
const opt = require('../src/optimizer');
const { fleetRoutePlanner } = require('../src/mocks/geoapify/fleetPlanner');

/** Comprueba el invariante y devuelve los números para mirar. */
function expectConsistent(day, shipments) {
  const open = shipments.filter((s) => s.status === 'pendiente' || (s.status === 'no_entregado' && s.attempts < 2));
  const routed = day.plans.flatMap((p) => p.stops.map((st) => st.shipmentId));
  const left = day.unassigned.map((u) => u.shipmentId);
  expect(new Set(left).size).toBe(left.length); // sin repetidos en sin asignar
  expect(new Set(routed).size).toBe(routed.length); // ningún pedido en dos rutas
  expect(left.filter((id) => routed.includes(id))).toEqual([]); // ni en ruta y sin asignar a la vez
  expect(routed.length + left.length).toBe(open.length); // ni huérfanos
  expect(new Set([...routed, ...left])).toEqual(new Set(open.map((s) => s.id)));
  return { routed: routed.length, left: left.length };
}

const DATE = '2026-11-02';
const NOW = new Date(2026, 9, 30, 9, 0);
const depot = { location: { lat: 13.699, lng: -89.22 } };
const drivers = [
  { id: 'D1', name: 'Kevin Rivas', zoneId: 'Z1', vehicleId: 'V1' },
  { id: 'D3', name: 'Daniela Flores', zoneId: 'Z3', vehicleId: 'V4' },
  { id: 'D4', name: 'Mario Castro', zoneId: 'Z4', vehicleId: 'V5' },
];
const vehicles = [
  { id: 'V1', label: 'Moto 1', maxKg: 40, capabilities: [] },
  { id: 'V4', label: 'Pick-up 1', maxKg: 600, capabilities: ['carga_grande'] },
  { id: 'V5', label: 'Camión 1', maxKg: 2000, capabilities: ['carga_grande'] },
];
const ship = (id, zoneId, weightKg, i, over = {}) => ({
  id,
  code: id,
  zoneId,
  scheduledDate: DATE,
  status: 'pendiente',
  attempts: 0,
  routeId: null,
  location: { lat: 13.7 + i * 0.002, lng: -89.21 - i * 0.002, status: 'alta' },
  priority: 'normal',
  weightKg,
  requires: [],
  serviceMin: 5,
  timeWindow: null,
  ...over,
});
// Z1: la moto no lleva los dos de 30 kg (uno pasa a otra zona). Z3: la pick-up recibe ese pedido y
// tiene uno propio de 3000 kg que no cabe en NINGÚN vehículo. Z4: un pedido sin ubicación confiable.
const shipments = [
  ship('A', 'Z1', 30, 1),
  ship('B', 'Z1', 30, 2),
  ship('C', 'Z3', 5, 3),
  ship('H', 'Z3', 3000, 4),
  ship('D', 'Z4', 10, 5),
  ship('R', 'Z4', 2, 6, { location: { lat: 13.7, lng: -89.2, status: 'revisar' } }),
];
const args = (over = {}) => ({ date: DATE, shipments, drivers, vehicles, depot, now: NOW, ...over });

beforeEach(() => {
  geo.geoapifyFetch.mockReset();
  geo.geoapifyFetch.mockImplementation((path, { body }) => Promise.resolve(fleetRoutePlanner(body)));
});

describe('ningún pedido se pierde ni se cuenta dos veces', () => {
  it('por zona (local): la zona que recibe un pedido de otra conserva sus propios sin asignar', async () => {
    const day = await opt.optimizeDay(args({ engine: 'local' }));
    expectConsistent(day, shipments);
    // B pasó a la pick-up de Z3; H (3000 kg) sigue sin asignar aunque Z3 se recalculó
    expect(day.plans.find((p) => p.zoneId === 'Z3').stops.map((st) => st.shipmentId)).toContain('B');
    expect(day.unassigned).toContainEqual({ shipmentId: 'H', reason: 'capacidad' });
  });

  it('por zona (Geoapify de prueba)', async () => {
    expectConsistent(await opt.optimizeDayByZone(args()), shipments);
  });

  it('conjunta por rondas', async () => {
    expectConsistent(await opt.optimizeDay(args()), shipments);
  });
});

describe('híbrido: por zona y lo que no cupo lo reparte Geoapify (optimizeDayHybrid)', () => {
  const bodies = () => geo.geoapifyFetch.mock.calls.map(([, o]) => o.body);

  it('invariante: ningún pedido se pierde ni se cuenta dos veces', async () => {
    expectConsistent(await opt.optimizeDayHybrid(args()), shipments);
  });

  it('(a) por zona sin pasar por cercanía, (b) UNA llamada con lo que no cupo y los vehículos con espacio, (c) la ruta que recibe se pide sola', async () => {
    const day = await opt.optimizeDayHybrid(args());
    const calls = bodies();
    // (a) una por zona; (b) la conjunta; (c) la ruta que recibió el que no cupo en la moto
    expect(calls.slice(0, 3).map((b) => b.agents.map((a) => a.id))).toEqual([['D1'], ['D3'], ['D4']]);
    const fleet = calls[3];
    // La moto de Z1 se queda con uno de los dos de 30 kg; el otro (spare) no cabe
    const spare = ['A', 'B'].find(
      (id) => !day.plans.find((p) => p.driverId === 'D1').stops.some((st) => st.shipmentId === id),
    );
    expect(fleet.jobs.map((j) => j.id).sort()).toEqual([spare, 'H'].sort()); // solo capacidad o requisito
    // Cada vehículo con lo que le queda: la moto lleva 30 kg, la pick-up C (5), el camión D (10)
    expect(fleet.agents.map((a) => [a.id, a.delivery_capacity])).toEqual([
      ['D1', 10],
      ['D3', 595],
      ['D4', 1990],
    ]);
    expect(calls).toHaveLength(5);
    expect(calls[4].agents).toHaveLength(1);
    const receiver = day.plans.find((p) => p.stops.some((st) => st.shipmentId === spare));
    expect(['D3', 'D4']).toContain(receiver.driverId);
    expect(calls[4].agents[0].id).toBe(receiver.driverId);
    expect(calls[4].jobs.map((j) => j.id).sort()).toEqual(
      receiver.stops.map((st) => st.shipmentId).sort(), // su ruta entera, ordenada junta
    );
    expect(day.unassigned).toEqual(
      expect.arrayContaining([
        { shipmentId: 'H', reason: 'capacidad' },
        { shipmentId: 'R', reason: 'sin_ubicacion' },
      ]),
    );
    expect(day.unassigned).toHaveLength(2);
    expect(day.warnings).toContain('1 pedido que no cabía en el vehículo de su zona pasó a otra ruta.');
    // H se escribe con el plan de su zona (createRoutesForDay); R (sin ubicación) queda suelto
    expect(day.plans.find((p) => p.zoneId === 'Z3').unassigned).toContainEqual({
      shipmentId: 'H',
      reason: 'capacidad',
    });
    expect(day.plans.flatMap((p) => p.unassigned).map((u) => u.shipmentId)).not.toContain('R');
  });

  it('si la llamada conjunta falla, queda lo de por zona con un aviso', async () => {
    geo.geoapifyFetch.mockImplementation((path, { body }) =>
      body.agents.length > 1
        ? Promise.reject(new geo.GeoapifyError('timeout', 'lento'))
        : Promise.resolve(fleetRoutePlanner(body)),
    );
    const day = await opt.optimizeDayHybrid(args());
    expectConsistent(day, shipments);
    expect(day.warnings).toContain('No se pudo repartir con Geoapify lo que no cupo en su zona: queda sin asignar.');
    // Los motivos quedan como los dio por zona (no se intentó repartir)
    const spare = day.unassigned.find((u) => ['A', 'B'].includes(u.shipmentId));
    expect(spare.reason).toBe('capacidad');
  });
});

// Los 125 pedidos de la llamada real del 1 nov, cada uno en la zona de centro más cercano
describe('los 125 pedidos reales del 1 nov, con los tres métodos', () => {
  const rec = require('./fixtures/geoapify-conjunta-llamada-1.json');
  const zones = require('../src/mocks/zones.json');
  const center = (z) => ({
    lat: z.polygon.reduce((s, p) => s + p.lat, 0) / z.polygon.length,
    lng: z.polygon.reduce((s, p) => s + p.lng, 0) / z.polygon.length,
  });
  const nearestZone = (loc) =>
    zones
      .map((z) => [z.id, (center(z).lat - loc.lat) ** 2 + (center(z).lng - loc.lng) ** 2])
      .sort((a, b) => a[1] - b[1])[0][0];
  const real = rec.request.jobs.map((j) => {
    const location = { lng: j.location[0], lat: j.location[1], status: 'alta' };
    return {
      id: j.id,
      code: j.id,
      zoneId: nearestZone(location),
      scheduledDate: '2026-11-01',
      status: 'pendiente',
      attempts: 0,
      routeId: null,
      location,
      priority: j.priority === 100 ? 'express' : 'normal',
      weightKg: j.delivery_amount ?? 0,
      requires: j.requirements ?? [],
      serviceMin: j.duration / 60,
      timeWindow: null,
    };
  });
  const realArgs = () => ({
    date: '2026-11-01',
    shipments: real,
    drivers: require('../src/mocks/drivers.json'),
    vehicles: require('../src/mocks/vehicles.json'),
    depot: require('../src/mocks/depot.json'),
    now: new Date(2026, 9, 31, 10, 0),
  });

  it.each([
    ['por zona', () => opt.optimizeDayByZone(realArgs())],
    ['conjunta por rondas', () => opt.optimizeDay(realArgs())],
    ['híbrido', () => opt.optimizeDayHybrid(realArgs())],
  ])('%s: cuadra (en ruta + sin asignar = 125) y ninguna ruta pasa de 25 paradas', async (_, run) => {
    const day = await run();
    expectConsistent(day, real);
    for (const p of day.plans) expect(p.stops.length).toBeLessThanOrEqual(25);
  });

  it('híbrido: la llamada de reparto lleva solo lo que no cupo y solo los vehículos con espacio', async () => {
    const byZone = await opt.optimizeDayByZone({ ...realArgs(), spill: false });
    geo.geoapifyFetch.mockClear();
    await opt.optimizeDayHybrid(realArgs());
    const calls = geo.geoapifyFetch.mock.calls.map(([, o]) => o.body);
    const share = calls[byZone.plans.length]; // después de una llamada por zona
    const noRoom = byZone.unassigned.filter((u) => ['capacidad', 'requisito'].includes(u.reason));
    expect(share.jobs.map((j) => j.id).sort()).toEqual(noRoom.map((u) => u.shipmentId).sort());
    // Con estos datos, por zona deja las motos en 39-40 kg y la pick-up y el camión en 25 paradas:
    // solo entra quien tiene kg libres y menos de 25 paradas, con lo que le queda
    const byId = Object.fromEntries(real.map((x) => [x.id, x]));
    const vehicles = realArgs().vehicles;
    const expected = byZone.plans
      .map((p) => {
        const kg = p.stops.reduce((sum, st) => sum + Math.ceil(byId[st.shipmentId].weightKg), 0);
        return [p.driverId, vehicles.find((v) => v.id === p.vehicleId).maxKg - kg, p.stops.length];
      })
      .filter(([, free, stops]) => free > 0 && stops < 25)
      .map(([id, free]) => [id, free]);
    expect(share.agents.map((a) => [a.id, a.delivery_capacity])).toEqual(expected);
  });
});
