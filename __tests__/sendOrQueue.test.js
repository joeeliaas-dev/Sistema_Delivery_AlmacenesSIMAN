// __tests__/sendOrQueue.test.js  (dueño: P3) — motorista sin señal: enviar o guardar en el teléfono
jest.mock('../src/lib/outbox', () => ({
  queueStatusChange: jest.fn(async () => ({ id: 'x' })),
  isOfflineError: (err) => /sin conexión|offline/i.test(err?.message ?? ''),
}));
import { queueStatusChange } from '../src/lib/outbox';
import { sendOrQueue } from '../src/features/driver/sendOrQueue';

const change = { shipmentId: 's1', code: 'SIM-1', to: 'entregado', payload: {}, driverId: 'D1' };
beforeEach(() => queueStatusChange.mockClear());

test('sin conexión se guarda de una vez, sin intentar enviar', async () => {
  const send = jest.fn();
  await expect(sendOrQueue({ online: false, send, change })).resolves.toEqual({ queued: true });
  expect(send).not.toHaveBeenCalled();
  expect(queueStatusChange).toHaveBeenCalledWith(change);
});

test('con conexión se envía', async () => {
  const send = jest.fn(async () => ({ status: 'entregado' }));
  await expect(sendOrQueue({ online: true, send, change })).resolves.toEqual({
    queued: false,
    result: { status: 'entregado' },
  });
  expect(queueStatusChange).not.toHaveBeenCalled();
});

test('si el envío falla por la señal, se guarda', async () => {
  const send = jest.fn(async () => {
    throw new Error('Sin conexión a internet');
  });
  await expect(sendOrQueue({ online: true, send, change })).resolves.toEqual({ queued: true });
  expect(queueStatusChange).toHaveBeenCalledTimes(1);
});

test('otro error no se guarda: sigue hacia la pantalla', async () => {
  const send = jest.fn(async () => {
    throw new Error('El pedido ya fue entregado');
  });
  await expect(sendOrQueue({ online: true, send, change })).rejects.toThrow('El pedido ya fue entregado');
  expect(queueStatusChange).not.toHaveBeenCalled();
});
