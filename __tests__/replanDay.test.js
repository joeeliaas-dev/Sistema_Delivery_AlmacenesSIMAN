// __tests__/replanDay.test.js  (dueño: P1) — reoptimizar el día no deja rutas viejas con paradas ajenas
import { todayISO } from '../src/lib/dates';

let svc, fleet, mockDb;
const tomorrow = () => require('../src/features/dispatch/dispatchMath').addDays(todayISO(), 1);
beforeEach(() => {
  jest.resetModules();
  svc = require('../src/features/routes/routesService');
  fleet = require('../src/features/fleet/fleetService');
  mockDb = require('../src/mocks').mockDb;
});

function consistent(date) {
  const routes = mockDb.all('routes').filter((r) => r.date === date);
  const stops = routes.flatMap((r) => r.stops.map((st) => [st.shipmentId, r.id]));
  expect(new Set(stops.map(([id]) => id)).size).toBe(stops.length); // nadie en dos rutas
  for (const [id, routeId] of stops) expect(mockDb.get('shipments', id)).toMatchObject({ status: 'asignado', routeId });
  const inStops = new Set(stops.map(([id, r]) => `${r}|${id}`));
  const orphans = mockDb
    .all('shipments')
    .filter((s) => s.status === 'asignado' && s.routeId && !inStops.has(`${s.routeId}|${s.id}`) && mockDb.get('routes', s.routeId)?.date === date);
  expect(orphans.map((s) => s.id)).toEqual([]);
  return routes;
}

it('optimizar dos veces deja todo consistente', async () => {
  const date = tomorrow();
  await svc.optimizeAndSaveDay(date);
  consistent(date);
  await svc.optimizeAndSaveDay(date);
  consistent(date);
});

it('si un motorista queda ausente, al reoptimizar su ruta sin salir se vacía y sus pedidos van a otros o a pendiente', async () => {
  const date = tomorrow();
  await svc.optimizeAndSaveDay(date);
  const before = consistent(date);
  const victim = before.find((r) => r.stops.length && r.driverId);
  await fleet.setDriverAbsent(victim.driverId, date, true);
  const res = await svc.optimizeAndSaveDay(date);
  const after = consistent(date);
  expect(after.find((r) => r.id === victim.id).stops).toEqual([]);
  expect(res.warnings.some((w) => w.includes(`${victim.code} quedó sin paradas`))).toBe(true);
  for (const st of victim.stops) {
    const s = mockDb.get('shipments', st.shipmentId);
    if (s.status === 'pendiente') expect(s.unassignedReason).toBeTruthy();
    else expect(s.routeId).not.toBe(victim.id);
  }
});

it('EXPO_PUBLIC_DAY_OPTIMIZER=zona: Optimizar día usa el método por zona (versión nube, C50)', async () => {
  jest.resetModules();
  process.env.EXPO_PUBLIC_DAY_OPTIMIZER = 'zona';
  try {
    const opt = require('../src/optimizer');
    const byZone = jest.spyOn(opt, 'optimizeDayByZone');
    const joint = jest.spyOn(opt, 'optimizeDay');
    const service = require('../src/features/routes/routesService');
    await service.optimizeAndSaveDay(tomorrow());
    expect(byZone).toHaveBeenCalledTimes(1);
    expect(joint).not.toHaveBeenCalled();
  } finally {
    delete process.env.EXPO_PUBLIC_DAY_OPTIMIZER;
  }
});
