// __tests__/statusMachine.test.js  (dueño: P1)
// Transiciones permitidas; las escrituras las prueba __integration__/statusMachine.emu.js.
// Firebase se simula en jest.setup.js.
jest.mock('../src/features/evidence/getCurrentGps', () => ({
  getCurrentGps: jest.fn(async () => ({ lat: 13.7035, lng: -89.24, accuracyM: 8 })),
}));

const OK_DELIVERY = { photoUri: 'file:///foto.jpg', signatureBase64: 'data:image/png;base64,AAAA', description: 'Recibió la clienta en la puerta' };
const OK_FAIL = { reason: 'Cliente ausente', photoUri: 'file:///foto.jpg', description: 'Nadie atendió después de tocar' };

let sm, mockDb, STATUS;
beforeEach(() => {
  jest.resetModules(); // base en memoria limpia en cada prueba
  sm = require('../src/features/shipments/statusMachine');
  ({ STATUS } = require('../src/constants'));
});

const get = (id) => mockDb.get('shipments', id);
const eventsOf = (id) => mockDb.all('events').filter((e) => e.shipmentId === id);

describe('canTransition', () => {
  test('sigue el diagrama del plan', () => {
    expect(sm.canTransition('pendiente', 'asignado')).toBe(true);
    expect(sm.canTransition('en_ruta', 'entregado')).toBe(true);
    expect(sm.canTransition('pendiente', 'entregado')).toBe(false);
    expect(sm.canTransition('entregado', 'en_ruta')).toBe(false);
    expect(sm.canTransition('devuelto', 'asignado')).toBe(false);
  });
});

