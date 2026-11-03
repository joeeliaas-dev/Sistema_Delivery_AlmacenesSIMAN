// __tests__/contractS4.test.js  (dueño: P1) — validar el Excel y la geometría que se guarda en Firestore
import { todayISO } from '../src/lib/dates';

const today = todayISO();
const tomorrow = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return todayISO(d);
})();
let mockDb;

beforeEach(() => {
  jest.resetModules();
});

const row = (over = {}) => ({
  __row: 2,
  Pedido: 'WEB-1',
  Cliente: 'Ana Pérez',
  Teléfono: '7012-3456',
  Dirección: 'Calle La Mascota 26, Colonia Escalón',
  Municipio: 'San Salvador',
  Fecha: tomorrow,
  ...over,
});

describe('validateOrders (S4-01)', () => {
  const { validateOrders } = require('../src/features/orders/validateOrders');

  it('fila buena: normaliza encabezados y teléfono', () => {
    const [r] = validateOrders([row({ Municipio: 'San Salvador Centro' })]);
    expect(r.status).toBe('verde');
    expect(r.order).toMatchObject({
      orderNumber: 'WEB-1',
      customer: { phone: '+50370123456' },
      scheduledDate: tomorrow,
    });
  });

  it('teléfono, fecha pasada, repetido y municipio desconocido', () => {
    const rows = validateOrders(
      [
        row({ Teléfono: '7123-45' }),
        row({ Pedido: 'WEB-2', Fecha: '2020-01-01' }),
        row({ Pedido: 'WEB-3' }),
        row({ Pedido: 'WEB-3' }),
        row({ Pedido: 'WEB-4', Municipio: 'Narnia' }),
        row({ Pedido: 'WEB-5' }),
      ],
      { existingOrderIds: ['WEB-5'] },
    );
    expect(rows[0].errors[0]).toBe('Teléfono 7123-45: debe tener 8 dígitos y empezar con 2, 6 o 7');
    expect(rows[1].errors[0]).toMatch('no puede ser anterior a hoy');
    expect(rows[2].status).not.toBe('roja');
    expect(rows[3].errors[0]).toMatch('repetido en el archivo');
    expect(rows[4].status).toBe('amarilla');
    expect(rows[5].errors[0]).toMatch('ya existe');
  });

  it('bultos y servicio por defecto', () => {
    const [r] = validateOrders([row({ bultos: 3 })]);
    expect(r.order).toMatchObject({ packages: 3, serviceMin: 5 });
    expect(r.order).not.toHaveProperty('weightKg');
  });
});

describe('geometría de rutas en Firestore (C32)', () => {
  const { fromStoredGeometry, toStoredGeometry } = require('../src/lib/geometry');

  it('ida y vuelta sin listas anidadas', () => {
    const coords = [
      [13.7, -89.2],
      [13.71, -89.21],
    ];
    const stored = toStoredGeometry(coords);
    expect(stored).toEqual([
      { lat: 13.7, lng: -89.2 },
      { lat: 13.71, lng: -89.21 },
    ]);
    expect(fromStoredGeometry(stored)).toEqual(coords);
    expect(toStoredGeometry(null)).toBeNull();
  });

  it('recorta a 1500 puntos y conserva el último', () => {
    const coords = Array.from({ length: 4000 }, (_, i) => [13.7 + i / 1e5, -89.2]);
    const stored = toStoredGeometry(coords);
    expect(stored.length).toBeLessThanOrEqual(1501);
    expect(stored.at(-1).lat).toBeCloseTo(13.7 + 3999 / 1e5, 6);
  });
});

