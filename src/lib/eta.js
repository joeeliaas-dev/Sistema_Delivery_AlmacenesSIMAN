// src/lib/eta.js  (dueño: P1)
// ETA que ven el motorista y el despacho (N24). etaMin de cada parada cuenta desde la
// salida de la ruta; aquí se muestra cuánto falta desde la última parada cerrada, para que
// a media ruta la parada 6 no siga diciendo "~1h 10min". Mismo formato en todas las pantallas.
import { ROUTE_STATUS, STATUS } from '../constants';

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

/**
 * Minutos que faltan para terminar la ruta: llegada a la última parada abierta + su servicio.
 * Sale de remainingEtas, igual que "Llega 10:42", así "Fin" y "Llega" no se contradicen a media ruta.
 * @returns {number|null} null si no quedan paradas abiertas
 */
export function remainingEndMin(route, shipmentsById, defaultServiceMin = 8) {
  const etas = remainingEtas(route, shipmentsById);
  const open = (route?.stops ?? []).filter((st) => st.shipmentId in etas);
  if (!open.length) return null;
  const last = open.reduce((a, b) => (etas[b.shipmentId] >= etas[a.shipmentId] ? b : a));
  const service = last.serviceMin ?? shipmentsById[last.shipmentId]?.serviceMin ?? defaultServiceMin;
  return etas[last.shipmentId] + service;
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

const clock = (date) =>
  Number.isNaN(date.getTime())
    ? null
    : `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
const toDate = (v) => (v && typeof v.toDate === 'function' ? v.toDate() : new Date(v));

/** La ruta ya salió: está en curso o alguna de sus paradas va en camino. */
export function routeHasStarted(route, shipmentsById) {
  if (route?.status === ROUTE_STATUS.EN_CURSO) return true;
  return (route?.stops ?? []).some((st) => {
    const s = shipmentsById[st.shipmentId];
    return s?.routeId === route.id && s.status === STATUS.EN_RUTA;
  });
}

/**
 * Todas las horas que se muestran de una ruta, con UNA regla para el despacho y el teléfono (C42):
 *   - sin salir: lo planeado (route.estEnd y el etaISO de cada parada);
 *   - ya salió: en vivo desde ahora (remainingEndMin y remainingEtas).
 * @returns {{ live: boolean, end: string|null, stops: Record<string, string> }}  horas "HH:MM";
 *   end null si no hay hora (o ya no quedan paradas); stops solo trae las paradas abiertas con hora
 */
export function routeTimes(route, shipmentsById, now = new Date()) {
  const live = routeHasStarted(route, shipmentsById);
  if (live) {
    const at = (min) => clock(new Date(now.getTime() + Math.max(0, Math.round(min)) * 60000));
    const endMin = remainingEndMin(route, shipmentsById);
    const etas = remainingEtas(route, shipmentsById);
    return {
      live,
      end: endMin == null ? null : at(endMin),
      stops: Object.fromEntries(Object.entries(etas).map(([id, min]) => [id, at(min)])),
    };
  }
  const open = remainingEtas(route, shipmentsById); // solo para saber cuáles siguen abiertas
  const stops = {};
  for (const st of route?.stops ?? []) {
    if (!(st.shipmentId in open) || !st.etaISO) continue;
    const c = clock(toDate(st.etaISO));
    if (c) stops[st.shipmentId] = c;
  }
  return { live, end: route?.estEnd ? clock(toDate(route.estEnd)) : null, stops };
}
