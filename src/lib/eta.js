// src/lib/eta.js  (dueño: P1)
// ETA que ven el motorista y el despacho (N24). etaMin de cada parada cuenta desde la
// salida de la ruta; aquí se muestra cuánto falta desde la última parada cerrada, para que
// a media ruta la parada 6 no siga diciendo "~1h 10min". Mismo formato en todas las pantallas.
import { STATUS } from '../constants';

const CLOSED = [STATUS.ENTREGADO, STATUS.NO_ENTREGADO, STATUS.DEVUELTO];

/**
 * Minutos que faltan para cada parada de la ruta.
 * Una parada cuenta como cerrada si su envío está cerrado o ya pasó a otra ruta (N4).
 * @param {{ id: string, stops: Array<{ shipmentId, seq, etaMin }> }} route
 * @param {Record<string, object>} shipmentsById
 * @returns {Record<string, number>} shipmentId → minutos (0 o más), solo paradas abiertas
 */
export function remainingEtas(route, shipmentsById) {
  const stops = [...(route?.stops ?? [])].sort((a, b) => a.seq - b.seq);
  const isClosed = (st) => {
    const s = shipmentsById[st.shipmentId];
    return !s || s.routeId !== route.id || CLOSED.includes(s.status);
  };
  const base = stops.filter(isClosed).reduce((max, st) => Math.max(max, st.etaMin ?? 0), 0);
  return Object.fromEntries(
    stops.filter((st) => !isClosed(st)).map((st) => [st.shipmentId, Math.max(0, Math.round((st.etaMin ?? 0) - base))]),
  );
}

/** 6 → "~6 min", 60 → "~1h", 70 → "~1h 10min", 119.6 → "~2h" (formato del prototipo) */
export function formatEta(min) {
  if (min == null || Number.isNaN(min)) return '';
  const m = Math.max(0, Math.round(min)); // primero redondear, luego dividir
  if (m < 60) return `~${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `~${h}h ${rest}min` : `~${h}h`;
}
