// __tests__/outbox.test.js  (dueño: P1) — bandeja de salida del motorista sin señal
jest.mock('../src/features/shipments/statusMachine', () => ({ changeStatus: jest.fn() }));
jest.mock('../src/features/shipments/shipmentsService', () => ({
  getShipment: jest.fn(async (id) => ({ id, code: id, status: 'en_ruta' })),
}));

let outbox, changeStatus;
beforeEach(() => {
  jest.resetModules();
  outbox = require('../src/lib/outbox');
  ({ changeStatus } = require('../src/features/shipments/statusMachine'));
});
const payload = { photoUri: 'data:image/jpeg;base64,AA', signatureBase64: 'data:image/png;base64,AA', description: 'Recibió' };

it('isOfflineError reconoce la falta de señal', () => {
  expect(outbox.isOfflineError({ code: 'unavailable' })).toBe(true);
  expect(outbox.isOfflineError(new Error('Failed to get document because the client is offline.'))).toBe(true);
  expect(outbox.isOfflineError(new Error('No se puede pasar de asignado a entregado'))).toBe(false);
});

it('guarda, y al volver la señal envía y vacía la bandeja', async () => {
  await outbox.queueStatusChange({ shipmentId: 'SIM-1', code: 'SIM-1', to: 'entregado', payload, driverId: 'D1' });
  expect(outbox.queuedShipmentIds().has('SIM-1')).toBe(true);
  changeStatus.mockResolvedValueOnce({ status: 'entregado' });
  expect(await outbox.flushOutbox()).toEqual({ sent: 1, failed: 0 });
  expect(changeStatus).toHaveBeenCalledWith(expect.objectContaining({ to: 'entregado', payload, driverId: 'D1' }));
  expect(outbox.queuedShipmentIds().size).toBe(0);
});

it('sin señal todavía: no pierde nada; otro error queda en el item y se puede quitar', async () => {
  await outbox.queueStatusChange({ shipmentId: 'SIM-2', code: 'SIM-2', to: 'entregado', payload, driverId: 'D1' });
  changeStatus.mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'unavailable' }));
  expect(await outbox.flushOutbox()).toEqual({ sent: 0, failed: 0 });
  expect(outbox.queuedShipmentIds().has('SIM-2')).toBe(true);
  changeStatus.mockRejectedValueOnce(new Error('El envío SIM-2 cambió de estado en otro dispositivo.'));
  expect(await outbox.flushOutbox()).toEqual({ sent: 0, failed: 1 });
  const [item] = outbox.outboxItems();
  expect(item).toMatchObject({ shipmentId: 'SIM-2', error: 'El envío SIM-2 cambió de estado en otro dispositivo.' });
  expect(await outbox.flushOutbox()).toEqual({ sent: 0, failed: 0 }); // con error no se reintenta solo
  outbox.discardQueued(item.id);
  expect(outbox.outboxItems()).toEqual([]);
});

it('si el envío se cortó por tiempo pero llegó igual, no se repite: sale de la bandeja', async () => {
  const { getShipment } = require('../src/features/shipments/shipmentsService');
  await outbox.queueStatusChange({ shipmentId: 'SIM-3', code: 'SIM-3', to: 'entregado', payload, driverId: 'D1' });
  getShipment.mockResolvedValueOnce({ id: 'SIM-3', code: 'SIM-3', status: 'entregado' });
  expect(await outbox.flushOutbox()).toEqual({ sent: 1, failed: 0 });
  expect(changeStatus).not.toHaveBeenCalled();
  expect(outbox.outboxItems()).toEqual([]);
});
