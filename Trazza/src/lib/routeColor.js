// src/lib/routeColor.js  (dueño: P1)
// Color de una ruta según su letra (Ruta A, B…): el mismo en el mapa del despacho y en el teléfono
// del motorista, sin guardarlo en Firestore. "Ruta 27" en adelante sigue la cuenta.
import { routeColors } from '../theme/colors';

/** Posición de la ruta por su código: 'Ruta A' → 0, 'Ruta B' → 1, 'Ruta 27' → 26; null si no se reconoce. */
export function routeIndex(code) {
  const m = /^Ruta\s+(?:([A-Z])|(\d+))$/.exec(String(code ?? '').trim());
  if (!m) return null;
  return m[1] ? m[1].charCodeAt(0) - 65 : Number(m[2]) - 1;
}

/**
 * @param {{ code?: string }|null} route
 * @param {string[]} [palette]
 * @param {number} [fallback]  posición a usar si el código no se reconoce (p. ej. su orden en la lista)
 */
export function routeColorOf(route, palette = routeColors, fallback = 0) {
  const i = routeIndex(route?.code) ?? fallback;
  return palette[((i % palette.length) + palette.length) % palette.length];
}
