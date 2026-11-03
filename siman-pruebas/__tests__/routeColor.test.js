// __tests__/routeColor.test.js  (dueño: P1) — el color de la ruta sale de su letra, igual en despacho y motorista
import { routeColorOf, routeIndex } from '../src/lib/routeColor';
import { routeColorMap } from '../src/features/dispatch/dispatchMath';
import { routeColors } from '../src/theme/colors';

it('routeIndex: A → 0, B → 1, "Ruta 27" → 26, y null si no se reconoce', () => {
  expect(routeIndex('Ruta A')).toBe(0);
  expect(routeIndex('Ruta B')).toBe(1);
  expect(routeIndex('Ruta 27')).toBe(26);
  expect(routeIndex('Otra cosa')).toBeNull();
});

it('la Ruta A tiene el mismo color en cualquier orden de la lista', () => {
  const a = { id: 'x', code: 'Ruta A' };
  const b = { id: 'y', code: 'Ruta B' };
  expect(routeColorMap([b, a], routeColors).x).toBe(routeColorOf(a));
  expect(routeColorMap([a, b], routeColors).x).toBe(routeColors[0]);
  expect(routeColorOf({ code: 'Ruta 9' })).toBe(routeColors[0]); // da la vuelta a la paleta
  expect(routeColorMap([{ id: 'z' }], routeColors).z).toBe(routeColors[0]); // sin código: su orden
});
