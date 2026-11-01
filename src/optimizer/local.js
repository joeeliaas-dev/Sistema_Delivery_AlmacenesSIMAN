// src/optimizer/local.js  (dueño: P2)
// Vecino más cercano + 2-opt sobre distancia en línea recta × factor de calle.
// Recorrido abierto: sale de la bodega y no regresa.
const R = 6371; // radio de la Tierra en km
const toRad = (d) => (d * Math.PI) / 180;

export function haversineKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function buildMatrix(points, factor) {
  return points.map((p) => points.map((q) => haversineKm(p, q) * factor));
}

// Suma de tramos consecutivos de un recorrido (índices sobre la matriz)
export function tourKm(tour, m) {
  let sum = 0;
  for (let i = 1; i < tour.length; i++) sum += m[tour[i - 1]][tour[i]];
  return sum;
}

// points[0] es el punto de salida; devuelve índices en orden de visita
function nearestNeighbor(m) {
  const n = m.length,
    visited = new Set([0]),
    tour = [0];
  while (tour.length < n) {
    const last = tour[tour.length - 1];
    let best = -1;
    for (let j = 1; j < n; j++) {
      if (!visited.has(j) && (best === -1 || m[last][j] < m[last][best])) best = j;
    }
    visited.add(best);
    tour.push(best);
  }
  return tour;
}

// 2-opt para recorrido abierto: también prueba invertir el tramo final (k = último)
function twoOpt(tour, m) {
  const n = tour.length;
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < n - 1; i++) {
      for (let k = i + 1; k < n; k++) {
        const a = tour[i - 1],
          b = tour[i],
          c = tour[k];
        const d = k + 1 < n ? tour[k + 1] : null;
        const delta = m[a][c] - m[a][b] + (d === null ? 0 : m[b][d] - m[c][d]);
        if (delta < -1e-9) {
          tour.splice(i, k - i + 1, ...tour.slice(i, k + 1).reverse());
          improved = true;
        }
      }
    }
  }
  return tour;
}

// Ordena `stops` saliendo de `depot.location`. Prueba dos arranques (vecino más
// cercano y el orden recibido) y se queda con el más corto, así el resultado
// nunca es peor que el orden en que llegaron las paradas.
export function optimizeLocal({ depot, stops, circuityFactor = 1.35 }) {
  const points = [depot.location, ...stops.map((s) => s.location)];
  const m = buildMatrix(points, circuityFactor);
  const identity = points.map((_, i) => i);
  const candidates = [twoOpt(nearestNeighbor(m), m), twoOpt(identity, m)];
  const tour = candidates.reduce((best, t) => (tourKm(t, m) < tourKm(best, m) ? t : best));
  const ordered = tour.slice(1).map((idx) => stops[idx - 1]);
  return { ordered, totalKm: tourKm(tour, m), provider: 'local' };
}
