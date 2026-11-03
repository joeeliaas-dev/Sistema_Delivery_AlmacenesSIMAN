// __tests__/zonaLenta.test.js  (dueño: P1) — Geoapify lento (2 nov): una zona que no responde no tumba el día
import { ROUTE_PLANNER_TIMEOUT_MS } from '../src/constants';

const shipments = require('./grabaciones/shipments.json');
const zones = require('../src/config/zones.json');
const depot = require('../src/config/depot.json');
const drivers = zones.map((z, i) => ({
  id: `D${i + 1}`,
  name: `Motorista ${i + 1}`,
  zoneId: z.id,
  active: true,
  shiftStart: '07:00',
  shiftEnd: '18:00',
}));
const date = shipments[0].scheduledDate;
let opt, geo, real;

beforeEach(() => {
  jest.resetModules();
  geo = require('../src/lib/geoapify');
  opt = require('../src/optimizer');
  real = geo.geoapifyFetch;
});

const failFor = (ids) =>
  jest.spyOn(geo, 'geoapifyFetch').mockImplementation((path, opts) =>
    ids.includes(opts?.body?.agents?.[0]?.id)
      ? Promise.reject(new geo.GeoapifyError('timeout', 'Geoapify no respondió a tiempo.'))
      : real(path, opts),
  );

it('el Route Planner espera hasta 90 s (la búsqueda de direcciones sigue con 15 s)', async () => {
  const spy = failFor([]);
  await opt.optimizeDay({ date, shipments, drivers, depot, zones });
  expect(spy.mock.calls.every(([, o]) => o.timeoutMs === ROUTE_PLANNER_TIMEOUT_MS)).toBe(true);
  expect(ROUTE_PLANNER_TIMEOUT_MS).toBe(90000);
});

it('si una zona no responde, se guardan las demás y se avisa cuál volver a pedir', async () => {
  failFor(['D5']);
  const day = await opt.optimizeDay({ date, shipments, drivers, depot, zones });
  expect(day.plans.map((p) => p.zoneId)).not.toContain('Z5');
  expect(day.plans.length).toBeGreaterThan(0);
  expect(day.failedZones).toEqual(['Z5']);
  expect(day.warnings.some((w) => /Geoapify no respondió para la .*Toque Optimizar día otra vez/.test(w))).toBe(true);
  // sus pedidos no quedan "sin asignar" con motivo: siguen pendientes para el próximo intento
  const z5 = new Set(shipments.filter((s) => s.zoneId === 'Z5').map((s) => s.id));
  expect(day.unassigned.some((u) => z5.has(u.shipmentId))).toBe(false);
});

it('si no responde ninguna zona, avisa que se intente de nuevo', async () => {
  failFor(drivers.map((d) => d.id));
  await expect(opt.optimizeDay({ date, shipments, drivers, depot, zones })).rejects.toThrow(
    /Geoapify no pudo calcular las rutas .*Intente de nuevo/,
  );
});
