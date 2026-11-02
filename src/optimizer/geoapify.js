// src/optimizer/geoapify.js  (dueño: P2; depurado el 1 nov)
// Traductor entre Trazza y Geoapify Route Planner (POST /v1/routeplanner): una ruta por zona,
// un agente (el motorista con su turno, saliendo y volviendo al depósito) y un job por pedido.
// Geoapify usa [lng, lat] y tiempos en segundos; aquí los tiempos cuentan desde las 00:00 del día.
import { DEFAULT_SERVICE_MIN, DEFAULT_SHIFT, PRIORITY, UNASSIGNED_REASON } from '../constants';

/** Mediodía: fin de la ventana de un express que no trae ventana propia (N38). */
export const EXPRESS_DEADLINE = '12:00';
/** Prioridad de Geoapify (0 a 100): si no caben todos, deja fuera primero los normales. */
export const JOB_PRIORITY = { EXPRESS: 100, NORMAL: 50 };

/** "07:30" → 27 000 segundos desde las 00:00. Lanza si el texto no es HH:MM. */
export function toSeconds(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? '').trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Error(`Hora inválida: ${hhmm}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60;
}

const lngLat = (p) => [p.lng, p.lat];

/** Turno del motorista en segundos, con DEFAULT_SHIFT si le falta. */
export function shiftWindow(driver) {
  return [toSeconds(driver?.shiftStart ?? DEFAULT_SHIFT.START), toSeconds(driver?.shiftEnd ?? DEFAULT_SHIFT.END)];
}

/** Minutos de servicio del pedido: el suyo, o el de siempre. */
export const serviceMinOf = (shipment) =>
  Number.isFinite(shipment.serviceMin) && shipment.serviceMin > 0 ? shipment.serviceMin : DEFAULT_SERVICE_MIN;

/**
 * Ventana del job en segundos, o null si puede llegar a cualquier hora del turno.
 * Con ventana propia se usa esa. Un express sin ventana va del inicio del turno a las 12:00 (N38).
 */
export function jobWindow(shipment, shift) {
  const tw = shipment.timeWindow;
  if (tw?.from && tw?.to) return [toSeconds(tw.from), toSeconds(tw.to)];
  if (shipment.priority === PRIORITY.EXPRESS) {
    const deadline = toSeconds(EXPRESS_DEADLINE);
    if (shift[0] < deadline) return [shift[0], deadline];
  }
  return null;
}

/**
 * Cuerpo de la solicitud al Route Planner para UNA ruta. Los jobs van en orden fijo (por id): los
 * mismos pedidos dan siempre la misma solicitud.
 * @param {{ shipments: object[], driver: object, depot: { location: {lat,lng} }, startSec?: number }} args
 *   startSec: salida más tarde que el inicio del turno (una ruta de hoy que se arma a media jornada)
 */
export function buildRoutePlannerRequest({ shipments, driver, depot, startSec }) {
  if (!depot?.location) throw new Error('Falta la ubicación del depósito');
  if (!driver?.id) throw new Error('Falta el motorista de la zona');
  const shift = shiftWindow(driver);
  const departure = Number.isFinite(startSec) ? Math.min(Math.max(shift[0], startSec), shift[1]) : shift[0];
  const agent = {
    id: driver.id,
    start_location: lngLat(depot.location),
    end_location: lngLat(depot.location),
    time_windows: [[departure, shift[1]]],
  };
  const jobs = [...shipments]
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map((s) => {
      if (!Number.isFinite(s.location?.lat) || !Number.isFinite(s.location?.lng))
        throw new Error(`El envío ${s.code ?? s.id} no tiene ubicación`);
      const job = {
        id: s.id,
        location: lngLat(s.location),
        duration: serviceMinOf(s) * 60,
        priority: s.priority === PRIORITY.EXPRESS ? JOB_PRIORITY.EXPRESS : JOB_PRIORITY.NORMAL,
      };
      const window = jobWindow(s, shift);
      if (window) job.time_windows = [window];
      return job;
    });
  return { mode: 'drive', agents: [agent], jobs };
}

// ---------- Respuesta ----------

/** El Salvador no tiene horario de verano: siempre UTC−6. */
export const TZ_OFFSET = '-06:00';
const round2 = (x) => Math.round(x * 100) / 100;
const pad = (n) => String(n).padStart(2, '0');

/** "2026-10-29" + 25 503 s → "2026-10-29T07:05:03-06:00" (pasada la medianoche, el día siguiente) */
export function secondsToISO(date, seconds) {
  const total = Math.max(0, Math.round(seconds));
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + Math.floor(total / 86400));
  const s = total % 86400;
  return `${day.toISOString().slice(0, 10)}T${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}${TZ_OFFSET}`;
}

/** MultiLineString de Geoapify ([lng, lat] por tramos) → una sola línea [[lat, lng]], sin puntos repetidos. */
export function flattenGeometry(geometry) {
  const lines =
    geometry?.type === 'MultiLineString'
      ? geometry.coordinates
      : geometry?.type === 'LineString'
        ? [geometry.coordinates]
        : [];
  const out = [];
  for (const line of lines)
    for (const [lng, lat] of line) {
      const last = out[out.length - 1];
      if (!last || last[0] !== lat || last[1] !== lng) out.push([lat, lng]);
    }
  return out.length > 1 ? out : null;
}

/**
 * Traduce la respuesta del Route Planner. Todo lo enviado que no vuelve en la ruta queda sin asignar
 * por horario (no alcanza el turno o su ventana), lo liste Geoapify o no: ningún pedido se pierde.
 * @param {object} response  FeatureCollection de Geoapify
 * @param {{ request: object, shipments: object[], date: string }} ctx
 * @returns {{ stops: Array<{ shipmentId, stopSequence, etaISO, etaMin, serviceMin, kmFromPrev }>,
 *   km, minutes, startISO, endISO, geometry: Array<[lat, lng]>|null, unassigned: Array<{ shipmentId, reason }> }}
 */
export function parseRoutePlannerResponse(response, { request, shipments, date }) {
  if (!Array.isArray(response?.features)) throw new Error('Respuesta del Route Planner sin features');
  const known = new Set(shipments.map((s) => s.id));
  const jobs = request?.jobs ?? [];
  const feature = response.features.find((f) => (f.properties?.agent_index ?? 0) === 0) ?? null;
  const p = feature?.properties ?? {};
  if (feature && !Array.isArray(p.actions)) throw new Error('Respuesta del Route Planner sin acciones');
  const actions = [...(p.actions ?? [])].sort((a, b) => a.index - b.index);
  const start = actions.find((a) => a.type === 'start');
  const end = actions.find((a) => a.type === 'end');
  const departure = start?.start_time ?? p.start_time ?? 0;
  // Distancia de cada tramo: legs[i] llega al waypoint de la acción
  const legKm = new Map((p.legs ?? []).map((l) => [l.to_waypoint_index, (l.distance ?? 0) / 1000]));
  const stops = actions
    .filter((a) => a.type === 'job')
    .map((a, i) => ({
      shipmentId: a.job_id ?? jobs[a.job_index]?.id,
      stopSequence: i + 1,
      etaISO: secondsToISO(date, a.start_time),
      etaMin: Math.round((a.start_time - departure) / 60),
      serviceMin: Math.round((a.duration ?? 0) / 60),
      kmFromPrev: round2(legKm.get(a.waypoint_index) ?? 0),
    }));
  const routed = new Set(stops.map((st) => st.shipmentId));
  const unassigned = jobs
    .filter((j) => known.has(j.id) && !routed.has(j.id))
    .map((j) => ({ shipmentId: j.id, reason: UNASSIGNED_REASON.VENTANA }));
  return {
    stops,
    km: round2((p.distance ?? 0) / 1000),
    minutes: Math.round((p.time ?? 0) / 60),
    startISO: feature ? secondsToISO(date, departure) : null,
    endISO: end ? secondsToISO(date, end.start_time) : p.end_time ? secondsToISO(date, p.end_time) : null,
    geometry: flattenGeometry(feature?.geometry),
    unassigned,
  };
}
