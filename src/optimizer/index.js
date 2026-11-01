// src/optimizer/index.js  (dueño: P2; depurado el 1 nov)
// Única puerta al cálculo de rutas. Todo lo calcula Geoapify Route Planner: calles reales, turno del
// motorista, ventana de cada cliente y orden de visita. Una ruta por zona, con su motorista.
// Sin cálculo propio: si Geoapify no responde, "Optimizar día" avisa y se vuelve a intentar.
import {
  LOCATION_STATUS,
  MAX_ATTEMPTS,
  PRIORITY,
  ROUTE_STATUS,
  SIN_ZONA,
  STATUS,
  UNASSIGNED_REASON,
} from '../constants';
import { ROUTING } from '../config/routing';
import { geoapifyFetch } from '../lib/geoapify';
import { todayISO } from '../lib/dates';
import { blocksZoneOn } from '../lib/routeDay';
import { buildRoutePlannerRequest, parseRoutePlannerResponse, shiftWindow } from './geoapify';

export const ENGINE = 'geoapify';

const round2 = (x) => Math.round(x * 100) / 100;
const isExpress = (s) => s.priority === PRIORITY.EXPRESS;
const tieBreak = (a, b) => String(a.code ?? a.id).localeCompare(String(b.code ?? b.id));
const timeOf = (s) => s.timeWindow?.from ?? s.scheduledTime ?? '';
const byTime = (a, b) => String(timeOf(a)).localeCompare(String(timeOf(b))) || tieBreak(a, b);
const byPriorityThenTime = (a, b) => isExpress(b) - isExpress(a) || byTime(a, b);

/** Km en línea recta entre dos puntos { lat, lng }. */
export function haversineKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function pathKm(start, stops, factor) {
  let prev = start;
  let sum = 0;
  for (const s of stops) {
    sum += haversineKm(prev, s.location) * factor;
    prev = s.location;
  }
  return sum;
}

/** Línea base del KPI "ahorra X km": las mismas paradas por hora programada, express primero. */
export function baselineKmOf(depot, shipments, circuityFactor = ROUTING.circuityFactor) {
  return round2(pathKm(depot.location, [...shipments].sort(byPriorityThenTime), circuityFactor));
}

/**
 * Línea base comparable con los km por calles de Geoapify: se miden en línea recta el orden de
 * Geoapify y el orden por hora, y esa proporción se aplica a los km reales. Nunca menor que los km reales.
 */
export function comparableBaselineKm(depot, routedInOrder, realKm, circuityFactor = ROUTING.circuityFactor) {
  const orderKm = pathKm(depot.location, routedInOrder, circuityFactor);
  const byTimeKm = baselineKmOf(depot, routedInOrder, circuityFactor);
  if (!(orderKm > 0) || !(realKm > 0)) return round2(realKm || byTimeKm);
  return round2(realKm * Math.max(1, byTimeKm / orderKm));
}

/**
 * Hora de salida en segundos desde las 00:00: si la ruta es de hoy y estamos dentro del turno, sale
 * ahora (no se planifica hacia el pasado); si no, al inicio del turno.
 */
export function departureSec(date, driver, now = new Date()) {
  const [start, end] = shiftWindow(driver);
  if (date !== todayISO(now)) return start;
  const nowSec = now.getHours() * 3600 + now.getMinutes() * 60;
  return nowSec > start && nowSec < end ? nowSec : start;
}

/** Ubicación con la que se puede rutear: alta o confirmada (los datos viejos no traen status). */
export function hasTrustedLocation(s) {
  const loc = s.location;
  if (!Number.isFinite(loc?.lat) || !Number.isFinite(loc?.lng)) return false;
  return !loc.status || loc.status === LOCATION_STATUS.ALTA || loc.status === LOCATION_STATUS.CONFIRMADA;
}

/** Pedidos que pueden entrar a una ruta: pendientes y reintentos, con ubicación confiable. */
export const isPlannable = (s) =>
  (s.status === STATUS.PENDIENTE || (s.status === STATUS.NO_ENTREGADO && s.attempts < MAX_ATTEMPTS)) &&
  hasTrustedLocation(s);

/** Ruta ya iniciada de cada zona (en curso o con alguna parada en camino): zoneId → ruta. */
export function startedRoutesByZone(routes, shipments) {
  const byId = new Map(shipments.map((s) => [s.id, s]));
  const statusOf = (r, st) => {
    const s = byId.get(st.shipmentId);
    return s?.routeId === r.id ? s.status : null;
  };
  const started = new Map();
  for (const r of routes) {
    const stops = r.stops ?? [];
    const open = stops.some((st) => [STATUS.ASIGNADO, STATUS.EN_RUTA].includes(statusOf(r, st)));
    const out = r.status === ROUTE_STATUS.EN_CURSO || stops.some((st) => statusOf(r, st) === STATUS.EN_RUTA);
    if (open && out && r.zoneId) started.set(r.zoneId, r);
  }
  return started;
}

/**
 * Ruta de un motorista con Geoapify (RoutePlan). Si hay más de ROUTING.maxStops pedidos, entran los
 * primeros por prioridad y hora; los demás quedan sin asignar por capacidad.
 * @param {{ shipments: object[], driver: object, depot: object, date: string, zoneId?: string, now?: Date }} args
 * @returns {Promise<{ zoneId, driverId, engine, stops, km, baselineKm, minutes, startISO,
 *   endISO, geometry, unassigned: Array<{ shipmentId, reason }>, warning: null }>}
 * @throws {GeoapifyError} si Geoapify no responde (sin cálculo propio de respaldo)
 */
export async function optimizeRoute({ shipments, driver, depot, date, zoneId, now }) {
  if (!depot?.location) throw new Error('Falta la ubicación del depósito');
  const base = { zoneId: zoneId ?? driver?.zoneId ?? null, driverId: driver?.id ?? null, engine: ENGINE };
  if (!shipments.length)
    return {
      ...base,
      stops: [],
      km: 0,
      baselineKm: 0,
      minutes: 0,
      startISO: null,
      endISO: null,
      geometry: null,
      unassigned: [],
      warning: null,
    };
  const sorted = [...shipments].sort(byPriorityThenTime);
  const sent = sorted.slice(0, ROUTING.maxStops);
  const overflow = sorted
    .slice(ROUTING.maxStops)
    .map((s) => ({ shipmentId: s.id, reason: UNASSIGNED_REASON.CAPACIDAD }));
  const request = buildRoutePlannerRequest({
    shipments: sent,
    driver,
    depot,
    startSec: departureSec(date, driver, now),
  });
  const response = await geoapifyFetch('/v1/routeplanner', { method: 'POST', body: request });
  const plan = parseRoutePlannerResponse(response, { request, shipments: sent, date });
  const byId = Object.fromEntries(sent.map((s) => [s.id, s]));
  const routed = plan.stops.map((st) => byId[st.shipmentId]).filter(Boolean);
  return {
    ...base,
    ...plan,
    unassigned: [...plan.unassigned, ...overflow],
    baselineKm: comparableBaselineKm(depot, routed, plan.km),
    warning: null,
  };
}

/**
 * Plan del día: una ruta por zona con su motorista activo, todas a la vez. Entran pendientes,
 * reintentos y los asignados a rutas de ESE día que aún no salen (se rehacen); sin ubicación
 * confiable quedan sin asignar con motivo. Una zona cuya ruta ya salió no se toca (ni se le pregunta
 * a Geoapify) y sus pendientes esperan otra ruta.
 * @param {{ date: string, shipments: object[], drivers: object[], depot: object, zones?: object[],
 *   routes?: object[], now?: Date }} args
 * @returns {Promise<{ engine, warnings: string[], plans: object[], unassigned: Array<{ shipmentId, reason }> }>}
 */
export async function optimizeDay({ date, shipments, drivers, depot, zones = [], routes = [], now }) {
  const warnings = [];
  const unassigned = [];
  const byZone = new Map();
  const zoneName = (id) => zones.find((z) => z.id === id)?.name ?? `zona ${id}`;
  const replaceable = new Set(
    routes.filter((r) => r.status === ROUTE_STATUS.ASIGNADA && r.date === date).map((r) => r.id),
  );
  const startedByZone = startedRoutesByZone(
    routes.filter((r) => blocksZoneOn(r, date, todayISO(now))),
    shipments,
  );
  for (const [zoneId, r] of startedByZone)
    warnings.push(`${zoneName(zoneId)} ya salió con la ${r.code}; no se cambió.`);

  for (const s of shipments) {
    const open =
      s.status === STATUS.PENDIENTE ||
      (s.status === STATUS.NO_ENTREGADO && s.attempts < MAX_ATTEMPTS) ||
      (s.status === STATUS.ASIGNADO && replaceable.has(s.routeId));
    if (!open || startedByZone.has(s.zoneId)) continue;
    if (!hasTrustedLocation(s) || !s.zoneId || s.zoneId === SIN_ZONA) {
      unassigned.push({ shipmentId: s.id, reason: UNASSIGNED_REASON.SIN_UBICACION });
      continue;
    }
    if (!byZone.has(s.zoneId)) byZone.set(s.zoneId, []);
    byZone.get(s.zoneId).push(s);
  }

  const jobs = [...byZone.entries()].map(([zoneId, list]) => {
    const driver = drivers.find((d) => d.zoneId === zoneId && d.active !== false);
    if (!driver) {
      warnings.push(`La ${zoneName(zoneId)} no tiene motorista activo: sus ${list.length} pedidos quedan pendientes.`);
      return null;
    }
    return optimizeRoute({ shipments: list, driver, depot, date, zoneId, now });
  });
  let plans;
  try {
    plans = (await Promise.all(jobs)).filter(Boolean);
  } catch (err) {
    throw new Error(`Geoapify no pudo calcular las rutas (${err.message}). Intente de nuevo en un momento.`);
  }
  plans.sort((a, b) => String(a.zoneId).localeCompare(String(b.zoneId)));
  for (const p of plans) unassigned.push(...p.unassigned);

  const noRoom = unassigned.filter((u) => u.reason !== UNASSIGNED_REASON.SIN_UBICACION).length;
  if (noRoom)
    warnings.push(
      `${noRoom === 1 ? '1 pedido no cabe' : `${noRoom} pedidos no caben`} en su ruta (máximo ${ROUTING.maxStops} ` +
        'paradas o fuera del turno del motorista): use "Pasar a…" para darles otra ruta.',
    );
  return { engine: ENGINE, warnings, plans, unassigned };
}
