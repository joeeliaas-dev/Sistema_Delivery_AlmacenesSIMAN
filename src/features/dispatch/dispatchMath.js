// src/features/dispatch/dispatchMath.js  (dueño: P2)
// Cálculos puros del Centro de despacho, sin React ni Firestore, para probarlos con Jest.
import {
  LOCATION_STATUS,
  MAX_ATTEMPTS,
  PRIORITY,
  ROUTE_STATUS,
  SIN_ZONA,
  STATUS,
  UNASSIGNED_REASON,
} from '../../constants';
import { ROUTING } from '../../config/routing';
import { fromStoredGeometry } from '../../lib/geometry';

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** "Martes 6 de octubre · Turno matutino" a partir de "2026-10-06" y la hora actual. */
export function dateShiftLabel(dateISO, now = new Date()) {
  const [y, m, d] = dateISO.split('-').map(Number);
  const day = new Date(y, m - 1, d);
  const h = now.getHours();
  const shift = h < 12 ? 'matutino' : h < 18 ? 'vespertino' : 'nocturno';
  return `${DAYS[day.getDay()]} ${d} de ${MONTHS[m - 1]} · Turno ${shift}`;
}

/** "2026-10-08" → "8 oct" (envíos arrastrados de días anteriores). */
export function shortDate(dateISO) {
  const [, m, d] = dateISO.split('-').map(Number);
  return `${d} ${MONTHS[m - 1].slice(0, 3)}`;
}

/** Suma días a una fecha "2026-10-08" sin pasar por UTC. */
export function addDays(dateISO, days) {
  const [y, m, d] = dateISO.split('-').map(Number);
  const t = new Date(y, m - 1, d + days);
  const pad = (n) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

/** Un no entregado con un solo intento fallido espera su reintento en la siguiente ruta. */
export const isRetry = (s) => s.status === STATUS.NO_ENTREGADO && s.attempts < MAX_ATTEMPTS;

/** Envíos que entran a "Generar ruta óptima": pendientes y reintentos. */
export const isRoutable = (s) => s.status === STATUS.PENDIENTE || isRetry(s);

/**
 * Contadores del prototipo:
 *   Pendientes = sin ruta (pendiente) + reintentos por programar
 *   En ruta    = asignado + en_ruta
 *   Entregados = entregado
 */
export function countByStage(shipments) {
  const c = { pendientes: 0, enRuta: 0, entregados: 0 };
  for (const s of shipments) {
    if (isRoutable(s)) c.pendientes++;
    else if (s.status === STATUS.ASIGNADO || s.status === STATUS.EN_RUTA) c.enRuta++;
    else if (s.status === STATUS.ENTREGADO) c.entregados++;
  }
  return c;
}

/** Filtro Todos / Express / Normal: 'todos' no filtra. */
export const matchesPriority = (filter) => (s) => filter === 'todos' || s.priority === filter;

/** Separa los envíos sin zona para mostrarlos aparte. */
export function splitByZone(shipments) {
  const zoned = [],
    noZone = [];
  for (const s of shipments) (s.zoneId === SIN_ZONA ? noZone : zoned).push(s);
  return { zoned, noZone };
}

/** Artículos totales de un envío (suma de cantidades). */
export const itemCount = (s) => (s.items ?? []).reduce((sum, it) => sum + (it.qty ?? 1), 0);

/** "Jorge Martínez" → "Jorge M." */
export function shortName(name = '') {
  const [first, second] = name.trim().split(/\s+/);
  return second ? `${first} ${second[0]}.` : (first ?? '');
}

/** "Ruta A - Jorge M." o null si el envío no tiene ruta. */
export function assignmentLabel(shipment, routesById, driversById) {
  if (!shipment.routeId) return null;
  const route = routesById[shipment.routeId];
  if (!route) return 'Ruta asignada';
  const driver = driversById[route.driverId];
  return driver ? `${route.code} - ${shortName(driver.name)}` : route.code;
}

/** "SIM-0419" → "0419" para etiquetas cortas en el mapa. */
export const shortCode = (code = '') => code.replace(/^SIM-/, '');

/** Paradas para RouteMap: { id, location, label, priority, status, title, subtitle }. */
export function toMapStops(shipments, { numbered = false } = {}) {
  return shipments.map((s, i) => ({
    id: s.id,
    location: s.location,
    label: numbered ? String(s.stopSequence ?? i + 1) : shortCode(s.code),
    priority: s.priority ?? PRIORITY.NORMAL,
    status: s.status,
    title: s.customer?.name ?? s.code,
    subtitle: [s.code, s.scheduledTime].filter(Boolean).join(' · '),
  }));
}

/** La ruta más reciente de una zona (la última creada; las anteriores ya se cerraron). */
export function latestZoneRoute(routes, zoneId) {
  const ms = (v) => (typeof v?.toMillis === 'function' ? v.toMillis() : Date.parse(v) || 0);
  return routes.filter((r) => r.zoneId === zoneId).sort((a, b) => ms(b.createdAt) - ms(a.createdAt))[0] ?? null;
}

/** Hora local "12:20" de un ISO (estEnd). */
export function formatClock(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Km optimizados del prototipo 2: baselineKm − totalKm, nunca negativo. */
export const savedKm = (route) => Math.max(0, (route?.baselineKm ?? 0) - (route?.totalKm ?? 0));

/**
 * KPI "Km optimizados" (prototipo 2): suma de baselineKm − totalKm de las rutas del día.
 * @returns {{ km: number, pct: number }}  pct = % de distancia ahorrada (0–100)
 */
export function kmOptimized(routes) {
  let base = 0,
    total = 0;
  for (const r of routes) {
    base += r.baselineKm ?? 0;
    total += Math.min(r.totalKm ?? 0, r.baselineKm ?? 0);
  }
  const km = routes.reduce((sum, r) => sum + savedKm(r), 0);
  return { km, pct: base > 0 ? ((base - total) / base) * 100 : 0 };
}

const CLOSED = [STATUS.ENTREGADO, STATUS.NO_ENTREGADO, STATUS.DEVUELTO];

/**
 * Progreso de una ruta para el seguimiento: una fila por parada en el orden de la ruta.
 * Una parada cuyo envío pasó a otra ruta (reintento) cuenta como cerrada en esta.
 * @returns {{ rows: Array<{ seq, etaMin, shipmentId, shipment, closed, moved }>, done, total, percent, open }}
 */
export function routeProgress(route, shipmentsById) {
  const rows = (route?.stops ?? []).map((st) => {
    const shipment = shipmentsById[st.shipmentId] ?? null;
    const moved = !shipment || shipment.routeId !== route.id;
    return { ...st, shipment, moved, closed: moved || CLOSED.includes(shipment.status) };
  });
  const done = rows.filter((r) => r.closed).length;
  const total = rows.length;
  return { rows, done, total, percent: total ? Math.round((done / total) * 100) : 0, open: done < total };
}

/** Estado visible de la ruta: Completada (todas cerradas), En curso o Asignada. */
export function routeStageLabel(route, progress) {
  if (progress.total && !progress.open) return 'Completada';
  return route?.status === ROUTE_STATUS.EN_CURSO ? 'En curso' : 'Asignada';
}

// ---------- Sprint 4 · despacho con mapa, rutas por color y sin asignar (S4-09) ----------

/** Motivo de un pedido sin asignar, en palabras del despachador. */
export const REASON_LABEL = {
  [UNASSIGNED_REASON.CAPACIDAD]: 'La ruta ya lleva 25 paradas',
  [UNASSIGNED_REASON.VENTANA]: 'No alcanza su horario',
  [UNASSIGNED_REASON.SIN_UBICACION]: 'Sin ubicación confirmada',
};

/**
 * Motor que calculó la ruta, como se muestra en la lista de rutas. Con la API apagada (mocks) responde
 * el Geoapify de prueba: se dice "(prueba)" para que nadie lo tome por un cálculo real.
 */
export const engineLabel = (engine, { live = true } = {}) => (live ? 'Geoapify' : 'Geoapify (prueba)');

const OPEN = [STATUS.PENDIENTE, STATUS.NO_ENTREGADO];
const REVIEW = [LOCATION_STATUS.REVISAR, LOCATION_STATUS.SIN_UBICACION];

/** Pedido abierto cuya ubicación hay que revisar antes de rutearlo (botón "Revisar ubicaciones (n)"). */
export const needsLocationReview = (s) =>
  [STATUS.PENDIENTE, STATUS.NO_ENTREGADO].includes(s.status) && REVIEW.includes(s.location?.status);

/** Pedidos que el optimizador dejó fuera, con su motivo (panel "Sin asignar"): primero los que necesitan otro vehículo. */
export function unassignedOf(shipments) {
  const order = Object.keys(REASON_LABEL);
  return shipments
    .filter((s) => OPEN.includes(s.status) && !s.routeId && s.unassignedReason)
    .sort(
      (a, b) =>
        order.indexOf(a.unassignedReason) - order.indexOf(b.unassignedReason) ||
        String(a.code ?? a.id).localeCompare(String(b.code ?? b.id)),
    );
}

/**
 * Pedidos abiertos, sin ruta y sin motivo, de una zona cuya ruta ya salió: "Optimizar día" no toca
 * esa zona (no se cambia una ruta en camino), así que esperan otra ruta. Uno por zona, con la ruta.
 * @returns {Array<{ zoneId, route, shipments: object[] }>}
 */
export function waitingOf(shipments, routes, shipmentsById) {
  const started = new Map();
  const stillOut = (r) =>
    (r.stops ?? []).some((st) => [STATUS.ASIGNADO, STATUS.EN_RUTA].includes(shipmentsById[st.shipmentId]?.status));
  for (const r of routes) if (!routeNotStarted(r, shipmentsById) && stillOut(r)) started.set(r.zoneId, r);
  const groups = new Map();
  for (const s of shipments) {
    if (!OPEN.includes(s.status) || s.routeId || s.unassignedReason || !started.has(s.zoneId)) continue;
    if (!groups.has(s.zoneId)) groups.set(s.zoneId, { zoneId: s.zoneId, route: started.get(s.zoneId), shipments: [] });
    groups.get(s.zoneId).shipments.push(s);
  }
  return [...groups.values()];
}

/**
 * La cuenta de "sin asignar" que usan el resumen y el panel: los que tienen motivo más los que esperan
 * otra ruta; `carried` dice cuántos de ellos vienen de días anteriores (N37).
 */
export function unassignedCount(unassigned, waiting, date) {
  const list = [...unassigned, ...waiting.flatMap((g) => g.shipments)];
  return {
    total: list.length,
    waiting: list.length - unassigned.length,
    carried: list.filter((s) => s.scheduledDate < date).length,
  };
}

/** Un color por ruta (routeColors de P3), estable para la misma lista de rutas. */
export function routeColorMap(routes, palette) {
  return Object.fromEntries(routes.map((r, i) => [r.id, palette[i % palette.length]]));
}

/** Línea de la ruta guardada ([{lat,lng}] en Firestore, C32) como [[lat, lng]]; null si no hay. */
export const routeGeometry = (route) => fromStoredGeometry(route?.geometry);

/**
 * Líneas para DispatchMap: por calles si la ruta trae geometry; si no (cálculo local), recta y
 * punteada del depósito a las paradas en orden.
 */
export function toDispatchRoutes(routes, shipmentsById, depot, colorsById) {
  return routes
    .map((r) => {
      const geometry = routeGeometry(r);
      if (geometry) return { id: r.id, color: colorsById[r.id], coords: geometry, dashed: false };
      const stops = [...(r.stops ?? [])]
        .sort((a, b) => a.seq - b.seq)
        .map((st) => shipmentsById[st.shipmentId]?.location)
        .filter((l) => Number.isFinite(l?.lat) && Number.isFinite(l?.lng));
      const start = depot?.location ? [[depot.location.lat, depot.location.lng]] : [];
      const coords = [...start, ...stops.map((l) => [l.lat, l.lng])];
      return { id: r.id, color: colorsById[r.id], coords, dashed: true };
    })
    .filter((r) => r.coords.length > 1);
}

/**
 * Pines para DispatchMap: con ruta, el color de su ruta y su número de parada; entregados en
 * verde; sin ruta, naranja (pendiente) o rojo (sin asignar con motivo).
 */
export function toDispatchPins(shipments, colorsById, { pending, unassigned, delivered, fallback }) {
  return shipments
    .filter((s) => Number.isFinite(s.location?.lat) && Number.isFinite(s.location?.lng))
    .map((s) => {
      const routed = s.routeId && colorsById[s.routeId];
      let color = fallback;
      if (s.status === STATUS.ENTREGADO) color = delivered;
      else if (routed) color = colorsById[s.routeId];
      else if (s.unassignedReason) color = unassigned;
      else if (OPEN.includes(s.status)) color = pending;
      return {
        id: s.id,
        lat: s.location.lat,
        lng: s.location.lng,
        color,
        label: routed && s.stopSequence ? String(s.stopSequence) : '',
        draggable: false,
        title: [s.code, s.customer?.name].filter(Boolean).join(' · '),
        size: routed ? undefined : 'sm', // fuera de ruta: punto chico, misma área táctil (C37)
      };
    });
}

const MOVABLE = [STATUS.PENDIENTE, STATUS.ASIGNADO];
const trusted = (s) =>
  Number.isFinite(s.location?.lat) &&
  (!s.location.status || [LOCATION_STATUS.ALTA, LOCATION_STATUS.CONFIRMADA].includes(s.location.status));
const routeNotStarted = (r, shipmentsById) =>
  r.status === ROUTE_STATUS.ASIGNADA &&
  !(r.stops ?? []).some((st) => shipmentsById[st.shipmentId]?.status === STATUS.EN_RUTA);

/**
 * Rutas a las que se puede pasar un pedido (menú "Pasar a…", S4-08): las de la fecha que todavía
 * no salen, menos la suya. Ninguna si el pedido no se puede mover, no tiene ubicación confiable o
 * su ruta ya salió. (El requisito y la capacidad del vehículo los valida moveStop con su motivo.)
 */
export function moveTargets(shipment, routes, shipmentsById, date) {
  if (!shipment || !trusted(shipment)) return [];
  const movable = MOVABLE.includes(shipment.status) || isRetry(shipment);
  if (!movable) return [];
  const current = shipment.status === STATUS.ASIGNADO ? routes.find((r) => r.id === shipment.routeId) : null;
  if (current && !routeNotStarted(current, shipmentsById)) return [];
  return routes.filter((r) => r.date === date && r.id !== shipment.routeId && routeNotStarted(r, shipmentsById));
}

/**
 * Destinos de "Pasar a…": las rutas que ya llevan el máximo de paradas van al final y se marcan (`full`).
 * @returns {Array<{ route: object, full: boolean }>}
 */
export function rankMoveTargets(shipment, targets) {
  const marked = targets.map((route) => ({ route, full: (route.stops ?? []).length >= ROUTING.maxStops }));
  return [...marked.filter((t) => !t.full), ...marked.filter((t) => t.full)];
}

/** Línea para un pedido cuya ruta ya salió (por eso no hay "Pasar a…"); null si no aplica. */
export function moveLockedNote(shipment, routes, shipmentsById) {
  if (!shipment?.routeId || ![STATUS.ASIGNADO, STATUS.EN_RUTA].includes(shipment.status)) return null;
  const route = routes.find((r) => r.id === shipment.routeId);
  return route && !routeNotStarted(route, shipmentsById) ? 'Su ruta ya salió: no se puede pasar a otra' : null;
}

/** Los que ya no entraron al reoptimizar tras "Pasar a…", nombrando hasta 3; '' si ninguno. */
export function droppedNote(dropped, shipmentsById) {
  if (!dropped?.length) return '';
  const codes = dropped.map((u) => shipmentsById[u.shipmentId]?.code ?? u.shipmentId);
  const named = codes.slice(0, 3).join(', ') + (codes.length > 3 ? ` y ${codes.length - 3} más` : '');
  return codes.length === 1
    ? `1 pedido ya no entró y quedó en Sin asignar: ${named}.`
    : `${codes.length} pedidos ya no entraron y quedaron en Sin asignar: ${named}.`;
}
