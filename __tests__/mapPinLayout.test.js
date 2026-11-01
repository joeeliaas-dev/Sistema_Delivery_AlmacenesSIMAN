// __tests__/mapPinLayout.test.js  (dueño: P3) — pines encimados en DispatchMap
import { pinLayer, pinOffsets, SPREAD_PX } from '../src/components/mapPinLayout';

const at = (id, lat = 13.69715, lng = -89.23111) => ({ id, lat, lng });

test('dos pedidos en el mismo punto exacto se abren a los lados, a la misma distancia', () => {
  const off = pinOffsets([at('a'), at('b'), at('c', 13.7, -89.2)]);
  expect(Object.keys(off).sort()).toEqual(['a', 'b']);
  expect(off.a).toEqual([-SPREAD_PX, 0]);
  expect(off.b).toEqual([SPREAD_PX, 0]);
});

test('el seleccionado queda en su punto real; los demás del grupo se siguen abriendo', () => {
  const off = pinOffsets([at('a'), at('b'), at('c')], 'a');
  expect(off.a).toBeUndefined();
  expect(off.b).toBeDefined();
  expect(off.c).toBeDefined();
  expect(off.b).not.toEqual(off.c);
});

test('seis en el mismo punto: cada uno queda a un pin (≥ 29 px) de su vecino', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  const off = pinOffsets(ids.map((id) => at(id)));
  ids.forEach((id, i) => {
    const [x1, y1] = off[id];
    const [x2, y2] = off[ids[(i + 1) % ids.length]];
    expect(Math.hypot(x2 - x1, y2 - y1)).toBeGreaterThanOrEqual(29);
  });
});

test('pines a más de ~1 m no se mueven', () => {
  expect(pinOffsets([at('a', 13.69715), at('b', 13.69716)])).toEqual({});
});

test('capas: seleccionado arriba, punto chico abajo', () => {
  expect(pinLayer({ size: 'sm' }, true)).toBe(2);
  expect(pinLayer({}, false)).toBe(1);
  expect(pinLayer({ size: 'sm' }, false)).toBe(0);
});
