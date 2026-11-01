// __tests__/testOrders.test.js  (dueño: P1) — pedidos-prueba-100.xlsx de punta a punta en mocks (S4-05)
import { readFileSync } from 'node:fs';

const file = readFileSync(require.resolve('../assets/pedidos-prueba-100.xlsx'));
let mockDb;

beforeEach(() => {
  jest.resetModules();
  mockDb = require('../src/mocks').mockDb;
});

it('la libreta de prueba usa la misma llave que addressKey', () => {
  const { djb2 } = require('../src/features/geo/normalize');
  for (const a of require('../src/mocks/addresses.json')) expect(a.id).toBe(`${a.phone}_${djb2(a.addressNorm)}`);
});

it('100 filas: 96 se cargan y 4 rojas explicadas; la ubicación sale en capas', async () => {
  const { parseOrdersFile } = require('../src/features/orders/parseOrdersFile');
  const { validateOrders } = require('../src/features/orders/validateOrders');
  const { resolveLocations } = require('../src/features/geo/resolveLocations');
  const { importOrders } = require('../src/features/orders/importOrders');

  const { headers, rows } = await parseOrdersFile(new Uint8Array(file).buffer);
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
  expect(by('confirmada', 'libreta')).toBe(10);
  expect(by('alta', 'excel')).toBe(6);
  expect(by('alta', 'geoapify')).toBe(65);
  expect(by('revisar')).toBe(15);
  expect(located.filter((r) => r.warnings.some((w) => w.includes('fuera de zona')))).toHaveLength(3);

  const before = mockDb.all('shipments').length;
  const { created, skipped } = await importOrders(located);
  expect({ created, skipped }).toEqual({ created: 96, skipped: 4 });
  expect(mockDb.all('shipments')).toHaveLength(before + 96);
  expect(
    mockDb.all('shipments').filter((s) => s.requires?.includes('carga_grande') && s.orderNumber?.startsWith('WEB-9')),
  ).toHaveLength(5);
}, 60000);
