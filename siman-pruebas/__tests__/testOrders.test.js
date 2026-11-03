// __tests__/testOrders.test.js  (dueño: P1) — pedidos-prueba-100.xlsx: leer, validar y ubicar (S4-05)
import { readFileSync } from 'node:fs';

const file = readFileSync(require.resolve('../assets/pedidos-prueba-100.xlsx'));
let mockDb;

beforeEach(() => {
  jest.resetModules();
});

it('100 filas: 96 se pueden cargar y 4 rojas explicadas; la ubicación sale en capas', async () => {
  const { parseOrdersFile } = require('../src/features/orders/parseOrdersFile');
  const { validateOrders } = require('../src/features/orders/validateOrders');
  const { resolveLocations } = require('../src/features/geo/resolveLocations');

  const { headers, rows: hoja } = await parseOrdersFile(new Uint8Array(file).buffer);
  const rows = require('./simulaciones/excel.cjs').paraManana(hoja);
  expect(headers).toContain('pedido');
  expect(rows).toHaveLength(100);

  const validated = validateOrders(rows);
  const red = validated.filter((r) => r.status === 'roja');
  expect(red).toHaveLength(4);
  expect(red.map((r) => r.errors[0]).join(' | ')).toMatch(/Teléfono 7123-45.*|Falta la fecha|repetido en el archivo/);

  const located = await resolveLocations(validated);
  const by = (status, source) =>
    located.filter((r) => r.order.location?.status === status && (!source || r.order.location.source === source))
      .length;
  expect(by('alta', 'excel')).toBe(6);
  expect(by('alta', 'geoapify')).toBe(75);
  expect(by('revisar')).toBe(15);
  expect(located.filter((r) => r.warnings.some((w) => w.includes('fuera de zona')))).toHaveLength(3);
}, 60000);
