// src/components/mapPinLayout.js (dueño: P3)
// Cálculos de dibujo de DispatchMap (web y teléfono), sin cambiar la interfaz del mapa:
// - pinOffsets: pines en el mismo punto exacto (misma calle sin número) se abren en un círculo
//   de unos píxeles para que se puedan tocar todos. Solo cambia el dibujo, no lat/lng; el pin
//   seleccionado queda en su punto real (se arrastra desde ahí).
// - pinLayer: el seleccionado arriba, los puntos chicos (size 'sm') abajo, para que su área
//   táctil transparente no tape a los pines de ruta.

export const SPREAD_PX = 16;
const keyOf = (p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;

/**
 * @param {Array<{ id, lat, lng }>} pins  con lat/lng válidos
 * @param {string} [selectedId]
 * @returns {Record<string, [number, number]>}  desplazamiento [dx, dy] en píxeles, solo de los que se mueven
 */
export function pinOffsets(pins, selectedId, radius = SPREAD_PX) {
  const groups = new Map();
  for (const p of pins) groups.set(keyOf(p), [...(groups.get(keyOf(p)) ?? []), p]);
  const out = {};
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    // Con más pines el círculo crece, para que dos vecinos queden a ~30 px (un pin) uno del otro
    const r = Math.max(radius, Math.ceil(15 / Math.sin(Math.PI / group.length)));
    group.forEach((p, i) => {
      if (p.id === selectedId) return;
      const angle = Math.PI + (2 * Math.PI * i) / group.length; // el primero a la izquierda
      out[p.id] = [Math.round(r * Math.cos(angle)) || 0, Math.round(r * Math.sin(angle)) || 0];
    });
  }
  return out;
}

/** Capa de dibujo: 2 seleccionado, 1 pin normal, 0 punto chico. */
export const pinLayer = (pin, selected) => (selected ? 2 : pin.size === 'sm' ? 0 : 1);
