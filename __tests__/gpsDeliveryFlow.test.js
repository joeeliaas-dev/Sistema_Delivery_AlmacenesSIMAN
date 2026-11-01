// __tests__/gpsDeliveryFlow.test.js  (dueño: P3) — S4-14 de punta a punta en mocks:
// la máquina de estados real de P1 entrega SIM-0419 y devuelve el GPS; con menos de 50 m,
// confirmFromDelivery deja la ubicación confirmada (fuente gps_entrega) y la guarda en la libreta.
const mockGps = jest.fn();
jest.mock('../src/features/evidence/getCurrentGps', () => ({ getCurrentGps: (...a) => mockGps(...a) }));

const DELIVERY = {
  photoUri: 'file:///foto.jpg',
  signatureBase64: 'data:image/png;base64,AAAA',
  description: 'Recibió la clienta en la puerta',
};

let sm, mockDb, confirmFromDelivery, lookupAddress;
beforeEach(() => {
  jest.resetModules(); // base en memoria limpia en cada prueba
  sm = require('../src/features/shipments/statusMachine');
  ({ mockDb } = require('../src/mocks'));
  ({ confirmFromDelivery } = require('../src/features/driver/gpsCorrection'));
  ({ lookupAddress } = require('../src/features/geo/addressBook'));
  mockGps.mockReset();
});

const deliver = async () => {
  const shipment = mockDb.get('shipments', 'SIM-0419');
  const result = await sm.changeStatus({ shipment, to: 'entregado', payload: DELIVERY, driverId: 'D2' });
  return { shipment, result, corrected: await confirmFromDelivery(shipment, result.gps) };
};

test('GPS de 12 m: la entrega confirma la casa del cliente y la libreta la recuerda', async () => {
  mockGps.mockResolvedValue({ lat: 13.70352, lng: -89.24011, accuracyM: 12 });
  const { shipment, result, corrected } = await deliver();

  expect(result).toEqual({ status: 'entregado', gps: { lat: 13.70352, lng: -89.24011, accuracyM: 12 } });
  expect(corrected).toBe(true);
  expect(mockDb.get('shipments', 'SIM-0419').location).toMatchObject({
    lat: 13.70352,
    lng: -89.24011,
    status: 'confirmada',
    source: 'gps_entrega',
  });
  // La próxima vez que este cliente aparezca en un Excel, no pasa por la API ni por revisión
  const book = await lookupAddress(shipment.customer.phone, shipment.address);
  expect(book).toMatchObject({ lat: 13.70352, lng: -89.24011 });
});

test('GPS de 80 m: la entrega se guarda pero la ubicación no se toca', async () => {
  mockGps.mockResolvedValue({ lat: 13.71, lng: -89.25, accuracyM: 80 });
  const { shipment, result, corrected } = await deliver();

  expect(result.status).toBe('entregado');
  expect(corrected).toBe(false);
  expect(mockDb.get('shipments', 'SIM-0419').location).toEqual(shipment.location);
  expect(await lookupAddress(shipment.customer.phone, shipment.address)).toBeNull();
});

test('sin GPS (permiso negado): la entrega se guarda y no se corrige nada', async () => {
  mockGps.mockResolvedValue(null);
  const { result, corrected } = await deliver();
  expect(result).toEqual({ status: 'entregado', gps: null });
  expect(corrected).toBe(false);
});
