import { formatEta, remainingEtas } from '../src/lib/eta';
const route = {
  id: 'R-A',
  stops: [
    {
      shipmentId: 'S1',
      seq: 1,
      etaMin: 0,
    },
    {
      shipmentId: 'S2',
      seq: 2,
      etaMin: 0,
    },
    {
      shipmentId: 'S3',
      seq: 3,
      etaMin: 6,
    },
    {
      shipmentId: 'S4',
      seq: 4,
      etaMin: 14,
    },
    {
      shipmentId: 'S5',
      seq: 5,
      etaMin: 70,
    },
  ],
};
const ship = (id, status, routeId = 'R-A') => ({
  id,
  status,
  routeId,
});
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
    const byId = {
      S1: ship('S1', 'entregado'),
      S2: ship('S2', 'entregado'),
      S3: ship('S3', 'en_ruta'),
      S4: ship('S4', 'en_ruta'),
      S5: ship('S5', 'en_ruta'),
    };
    expect(remainingEtas(route, byId)).toEqual({
      S3: 6,
      S4: 14,
      S5: 70,
    });
  });
  test('a media ruta descuenta lo ya recorrido', () => {
    const byId = {
      S1: ship('S1', 'entregado'),
      S2: ship('S2', 'entregado'),
      S3: ship('S3', 'entregado'),
      S4: ship('S4', 'no_entregado'),
      S5: ship('S5', 'en_ruta'),
    };
    expect(remainingEtas(route, byId)).toEqual({
      S5: 56,
    });
  });
  test('un reintento que pasó a otra ruta cuenta como cerrado (N4)', () => {
    const byId = {
      S1: ship('S1', 'entregado'),
      S2: ship('S2', 'entregado'),
      S3: ship('S3', 'asignado', 'R-B'),
      S4: ship('S4', 'en_ruta'),
      S5: ship('S5', 'en_ruta'),
    };
    expect(remainingEtas(route, byId)).toEqual({
      S4: 8,
      S5: 64,
    });
  });
  test('sin ruta devuelve vacío', () => {
    expect(remainingEtas(null, {})).toEqual({});
  });
});
