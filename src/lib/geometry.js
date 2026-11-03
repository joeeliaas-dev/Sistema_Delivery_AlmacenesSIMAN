// src/lib/geometry.js  (dueño: P1)
// Firestore no acepta listas dentro de listas (C32): la línea de una ruta se guarda como
// [{ lat, lng }] y se usa como [[lat, lng]] en el optimizador y en DispatchMap.
const MAX_POINTS = 1500; // ~60 KB por ruta; el documento admite 1 MB

/** [[lat, lng]] → [{ lat, lng }] para guardar en routes.geometry. Recorta puntos si son demasiados. */
export function toStoredGeometry(coords) {
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const step = Math.ceil(coords.length / MAX_POINTS);
  const kept = coords.filter((_, i) => i % step === 0 || i === coords.length - 1);
  return kept.map(([lat, lng]) => ({ lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 }));
}

/** routes.geometry ([{ lat, lng }] o null) → [[lat, lng]] o null, para DispatchMap. */
export function fromStoredGeometry(stored) {
  if (!Array.isArray(stored) || stored.length < 2) return null;
  return stored.map((p) => (Array.isArray(p) ? p : [p.lat, p.lng]));
}
