// __tests__/eta.test.js  (dueño: P1)
import { formatEta, remainingEtas } from '../src/lib/eta';

const route = {
  id: 'R-A',
  stops: [
    { shipmentId: 'S1', seq: 1, etaMin: 0 },
    { shipmentId: 'S2', seq: 2, etaMin: 0 },
    { shipmentId: 'S3', seq: 3, etaMin: 6 },
    { shipmentId: 'S4', seq: 4, etaMin: 14 },
    { shipmentId: 'S5', seq: 5, etaMin: 70 },
  ],
};
const ship = (id, status, routeId = 'R-A') => ({ id, status, routeId });

describe('formatEta', () => {
  test.each([
    [6, '~6 min'],
    [0, '~0 min'],
    [60, '~1h'],
    [70, '~1h 10min'],
    [119.6, '~2h'],
    [-3, '~0 min'],
    [null, ''],
  ])('%p → %p', (min, text) => expect(formatEta(min)).toBe(text));
});

describe('remainingEtas', () => {
  test('al inicio coincide con etaMin (Ruta A: 6 y 14 min, como el prototipo)', () => {
    const byId = { S1: ship('S1', 'entregado'), S2: ship('S2', 'entregado'), S3: ship('S3', 'en_ruta'), S4: ship('S4', 'en_ruta'), S5: ship('S5', 'en_ruta') };
    expect(remainingEtas(route, byId)).toEqual({ S3: 6, S4: 14, S5: 70 });
  });

  test('a media ruta descuenta lo ya recorrido', () => {
    const byId = { S1: ship('S1', 'entregado'), S2: ship('S2', 'entregado'), S3: ship('S3', 'entregado'), S4: ship('S4', 'no_entregado'), S5: ship('S5', 'en_ruta') };
    expect(remainingEtas(route, byId)).toEqual({ S5: 56 });
  });

  test('un reintento que pasó a otra ruta cuenta como cerrado (N4)', () => {
    const byId = { S1: ship('S1', 'entregado'), S2: ship('S2', 'entregado'), S3: ship('S3', 'asignado', 'R-B'), S4: ship('S4', 'en_ruta'), S5: ship('S5', 'en_ruta') };
    expect(remainingEtas(route, byId)).toEqual({ S4: 8, S5: 64 });
  });

  test('sin ruta devuelve vacío', () => {
    expect(remainingEtas(null, {})).toEqual({});
  });
});

describe('remainingEndMin (Fin en vivo, 30 oct)', () => {
  const { remainingEndMin, remainingEtas } = require('../src/lib/eta');
  const route = {
    id: 'R',
    stops: [
      { shipmentId: 'a', seq: 1, etaMin: 10, serviceMin: 5 },
      { shipmentId: 'b', seq: 2, etaMin: 30, serviceMin: 5 },
      { shipmentId: 'c', seq: 3, etaMin: 55, serviceMin: 20 },
    ],
  };
  const ship = (id, status) => ({ id, routeId: 'R', status });

  it('cuenta desde la última cerrada, como "Llega": llegada a la última abierta + su servicio', () => {
    const byId = { a: ship('a', 'entregado'), b: ship('b', 'en_ruta'), c: ship('c', 'en_ruta') };
    expect(remainingEtas(route, byId).c).toBe(45);
    expect(remainingEndMin(route, byId)).toBe(65);
  });

  it('sin paradas abiertas: null', () => {
    const byId = { a: ship('a', 'entregado'), b: ship('b', 'entregado'), c: ship('c', 'devuelto') };
    expect(remainingEndMin(route, byId)).toBeNull();
  });
});

describe('routeTimes: una sola regla de horas para despacho y teléfono (C42)', () => {
  const { routeTimes } = require('../src/lib/eta');
  const now = new Date(2026, 9, 30, 21, 0);
  const route = (status) => ({
    id: 'R',
    status,
    estEnd: new Date(2026, 9, 31, 8, 1).toISOString(),
    stops: [
      { shipmentId: 'a', seq: 1, etaMin: 10, serviceMin: 5, etaISO: new Date(2026, 9, 31, 7, 10).toISOString() },
      { shipmentId: 'b', seq: 2, etaMin: 40, serviceMin: 5, etaISO: new Date(2026, 9, 31, 7, 40).toISOString() },
    ],
  });
  const ship = (id, status) => ({ id, routeId: 'R', status });

  it('sin salir: fin y paradas planeados', () => {
    const t = routeTimes(route('asignada'), { a: ship('a', 'asignado'), b: ship('b', 'asignado') }, now);
    expect(t).toEqual({ live: false, end: '08:01', stops: { a: '07:10', b: '07:40' } });
  });

  it('ya salió: fin y paradas en vivo desde ahora, y el fin es la última llegada + su servicio', () => {
    const t = routeTimes(route('en_curso'), { a: ship('a', 'entregado'), b: ship('b', 'en_ruta') }, now);
    expect(t).toEqual({ live: true, end: '21:35', stops: { b: '21:30' } });
  });

  it('una parada en camino basta para contar como salida, aunque la ruta diga asignada', () => {
    expect(routeTimes(route('asignada'), { a: ship('a', 'en_ruta'), b: ship('b', 'en_ruta') }, now).live).toBe(true);
  });
});
