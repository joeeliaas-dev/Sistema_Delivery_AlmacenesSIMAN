// __tests__/driverOffline.test.js  (dueño: P3) — motorista sin señal: lista y aviso
import { splitStops } from '../src/features/driver/routeMath';
import { failedItems, outboxNotice } from '../src/features/driver/outboxMath';

const route = {
  id: 'R1',
  stops: [
    { shipmentId: 'a', seq: 1, etaMin: 10 },
    { shipmentId: 'b', seq: 2, etaMin: 20 },
    { shipmentId: 'c', seq: 3, etaMin: 30 },
  ],
};
const ship = (id, status = 'en_ruta') => ({ id, status, routeId: 'R1' });

test('una parada guardada en el teléfono cuenta como hecha y se sigue con la siguiente', () => {
  const split = splitStops(route, [ship('a', 'entregado'), ship('b'), ship('c')], new Set(['b']));
  expect(split.next.shipmentId).toBe('c');
  expect(split.done).toBe(2);
  expect(split.completed.find((s) => s.shipmentId === 'b').queued).toBe(true);
  expect(split.completed.find((s) => s.shipmentId === 'a').queued).toBe(false);
});

test('sin bandeja, todo igual que antes', () => {
  const split = splitStops(route, [ship('a'), ship('b'), ship('c')]);
  expect(split.next.shipmentId).toBe('a');
  expect(split.done).toBe(0);
});

test('el aviso de arriba según la señal y lo que falta por enviar', () => {
  const two = { items: [{ error: null }, { error: null }], sending: false };
  expect(outboxNotice({ items: [], sending: false }, true)).toBeNull();
  expect(outboxNotice({ items: [], sending: false }, false).text).toMatch(/^Sin señal\. Lo que registre/);
  expect(outboxNotice(two, false).text).toMatch(/^Sin señal · 2 entregas por enviar/);
  expect(outboxNotice(two, true)).toEqual({ tone: 'info', text: '2 entregas por enviar', canSend: true });
  expect(outboxNotice({ ...two, sending: true }, true).text).toBe('Enviando 2 entregas guardadas…');
  expect(outboxNotice({ items: [{ error: null }], sending: false }, true).text).toBe('1 entrega por enviar');
});

test('las que fallaron por otro motivo se muestran aparte', () => {
  const outbox = {
    items: [
      { id: '1', error: null },
      { id: '2', error: 'El pedido SIM-1 ya no existe' },
    ],
  };
  expect(failedItems(outbox).map((x) => x.id)).toEqual(['2']);
  expect(outboxNotice(outbox, true).text).toBe('1 entrega por enviar');
});
