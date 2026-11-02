// src/config/routing.js  (dueño: P2)
// Supuestos de arranque, no medidos; se ajustan con los tiempos reales de los eventos.
export const ROUTING = {
  circuityFactor: 1.35, // multiplica la línea recta para aproximar la distancia por calle
  avgSpeedKmh: 20, // velocidad urbana promedio para la ETA
  serviceMinutes: 8, // por parada: estacionar, entregar, foto y firma
  maxStops: 25, // paradas máximas por ruta
};
