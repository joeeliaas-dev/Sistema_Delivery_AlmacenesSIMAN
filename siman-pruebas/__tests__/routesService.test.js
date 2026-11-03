// __tests__/routesService.test.js  (dueño: P2) — nombres e ids de rutas (lo demás: __integration__)
// Cada prueba recarga los módulos para empezar con la base en memoria limpia.
import { todayISO } from '../src/lib/dates';

const today = todayISO();
const tomorrowOf = (d) => require('../src/features/dispatch/dispatchMath').addDays(d, 1);
let svc, mockDb;

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
  svc = require('../src/features/routes/routesService');
});

const next = (subscribe) =>
  new Promise((resolve) => {
    const cancel = subscribe((value) => {
      cancel();
      resolve(value);
    });
  });
const shipmentsOf = (zoneId) => mockDb.all('shipments').filter((s) => s.zoneId === zoneId);

describe('nombres e ids', () => {
  it('routeCode: Ruta A, B, C… en orden de creación', () => {
    expect([0, 1, 2, 25].map(svc.routeCode)).toEqual(['Ruta A', 'Ruta B', 'Ruta C', 'Ruta Z']);
    expect(svc.routeCode(26)).toBe('Ruta 27');
  });

  it('nextRouteId usa el sufijo -2, -3… si el id ya existe', () => {
    const args = { date: '2026-10-12', zoneId: 'Z1' };
    expect(svc.nextRouteId(args, new Set())).toBe('R-2026-10-12-Z1');
    expect(svc.nextRouteId(args, new Set(['R-2026-10-12-Z1']))).toBe('R-2026-10-12-Z1-2');
    expect(svc.nextRouteId(args, new Set(['R-2026-10-12-Z1', 'R-2026-10-12-Z1-2']))).toBe('R-2026-10-12-Z1-3');
  });
});

