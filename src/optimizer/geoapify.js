// src/optimizer/geoapify.js  (dueño: P2)
// Traductor entre Trazza y Geoapify Route Planner (POST /v1/routeplanner).
// Dos formas de solicitud, con un job por envío:
//   - una ruta (buildRoutePlannerRequest): un agente, el motorista con su vehículo y turno;
//   - optimización conjunta (buildFleetRequest, Optimizar día): todos los motoristas como agentes,
//     Geoapify reparte por cercanía sin mirar zonas, y devuelve una feature por agente.
// Geoapify usa [lng, lat] y tiempos en segundos; aquí los tiempos cuentan desde las 00:00
// del día de entrega (07:00 → 25 200).
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

/** Minutos de servicio del envío: el suyo, o el de su tipo (carga grande o normal). */
export function serviceMinOf(shipment) {
  if (Number.isFinite(shipment.serviceMin) && shipment.serviceMin > 0) return shipment.serviceMin;
  return shipment.requires?.length ? DEFAULT_SERVICE_MIN.CARGA_GRANDE : DEFAULT_SERVICE_MIN.NORMAL;
}

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
 * Un agente: el motorista con su vehículo y turno, saliendo y volviendo al depósito.
 * startSec: salida más tarde que el inicio del turno (ruta de hoy ya empezada).
 */
function agentOf({ driver, vehicle, depot, startSec }) {
  if (!driver?.id) throw new Error('Falta el motorista de la zona');
  const shift = shiftWindow(driver);
  const departure = Number.isFinite(startSec) ? Math.min(Math.max(shift[0], startSec), shift[1]) : shift[0];
  const agent = {
    id: driver.id,
    start_location: lngLat(depot.location),
    end_location: lngLat(depot.location),
    time_windows: [[departure, shift[1]]],
  };
  if (Number.isFinite(vehicle?.maxKg)) agent.delivery_capacity = vehicle.maxKg;
  if (vehicle?.capabilities?.length) agent.capabilities = [...vehicle.capabilities];
  return agent;
}

/**
 * Un job por envío. Orden fijo (por id): los mismos pedidos dan siempre la misma solicitud, y los
 * índices de unassigned_jobs se pueden comparar entre corridas y contra las grabaciones.
 * shift: el turno contra el que se arma la ventana de un express sin ventana propia (N38).
 */
function jobsOf(shipments, shift) {
  const ordered = [...shipments].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return ordered.map((s) => {
    if (!Number.isFinite(s.location?.lat) || !Number.isFinite(s.location?.lng))
      throw new Error(`El envío ${s.code ?? s.id} no tiene ubicación`);
    const job = {
      id: s.id,
      location: lngLat(s.location),
      duration: serviceMinOf(s) * 60,
      priority: s.priority === PRIORITY.EXPRESS ? JOB_PRIORITY.EXPRESS : JOB_PRIORITY.NORMAL,
    };
    const kg = Math.ceil(s.weightKg ?? 0);
    if (kg > 0) job.delivery_amount = kg;
    if (s.requires?.length) job.requirements = [...s.requires];
    const window = jobWindow(s, shift);
    if (window) job.time_windows = [window];
    return job;
  });
}

/**
 * Arma el cuerpo de la solicitud al Route Planner para UNA ruta (un agente): "Generar ruta de esta
 * zona", "Pasar a…" y el respaldo de Optimizar día.
 * @param {{ shipments: object[], driver: object, vehicle: object, depot: { location: {lat,lng} },
 *   startSec?: number }} args  startSec: salida más tarde que el inicio del turno (ruta de hoy ya empezada)
 * @returns {object} cuerpo para geoapifyFetch('/v1/routeplanner', { method: 'POST', body })
 */
export function buildRoutePlannerRequest({ shipments, driver, vehicle, depot, startSec }) {
  if (!depot?.location) throw new Error('Falta la ubicación del depósito');
  const agent = agentOf({ driver, vehicle, depot, startSec });
  return { mode: 'drive', agents: [agent], jobs: jobsOf(shipments, shiftWindow(driver)) };
}

/**
 * Solicitud de la optimización conjunta (Optimizar día): todos los motoristas como agentes y todos
 * los pedidos como jobs; Geoapify reparte por cercanía, sin mirar zonas. Un express sin ventana
 * propia va del primer inicio de turno de la flota a las 12:00 (N38).
 * @param {{ shipments: object[], crew: Array<{ driver: object, vehicle: object|null, startSec?: number }>,
 *   depot: { location: {lat,lng} } }} args  crew: un elemento por agente, en el orden de agents
 * @returns {object} cuerpo para geoapifyFetch('/v1/routeplanner', { method: 'POST', body })
 */
export function buildFleetRequest({ shipments, crew, depot }) {
  if (!depot?.location) throw new Error('Falta la ubicación del depósito');
  if (!crew?.length) throw new Error('No hay motoristas para repartir los pedidos');
  const agents = crew.map((c) => agentOf({ ...c, depot }));
  const shifts = crew.map((c) => shiftWindow(c.driver));
  const fleetShift = [Math.min(...shifts.map((s) => s[0])), Math.max(...shifts.map((s) => s[1]))];
  return { mode: 'drive', agents, jobs: jobsOf(shipments, fleetShift) };
}

// ---------- Respuesta ----------

/** El Salvador no tiene horario de verano: siempre UTC−6. */
export const TZ_OFFSET = '-06:00';
const round2 = (x) => Math.round(x * 100) / 100;
const pad = (n) => String(n).padStart(2, '0');

/** "2026-10-29" + 25 503 s → "2026-10-29T07:05:03-06:00" */
export function secondsToISO(date, seconds) {
  const total = Math.max(0, Math.round(seconds));
  // Pasada la medianoche sigue el día siguiente (no "T24:…", que no es una fecha válida)
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
 * Motivo de un pedido que el Route Planner no pudo meter (N41):
 * requisito → el vehículo no tiene lo que pide; capacidad → pesa más que lo que queda libre
 * (maxKg − kg ya asignados); ventana → ninguna de las dos.
 */
export function unassignedReason(shipment, vehicle, assignedKg = 0) {
  const caps = vehicle?.capabilities ?? [];
  if ((shipment.requires ?? []).some((r) => !caps.includes(r))) return UNASSIGNED_REASON.REQUISITO;
  if (Number.isFinite(vehicle?.maxKg) && Math.ceil(shipment.weightKg ?? 0) > vehicle.maxKg - assignedKg)
    return UNASSIGNED_REASON.CAPACIDAD;
  return UNASSIGNED_REASON.VENTANA;
}

/**
 * Traduce la respuesta del Route Planner (una zona, un agente).
 * @param {object} response  FeatureCollection de Geoapify
 * @param {{ request: object, shipments: object[], vehicle: object, date: string }} ctx
 *   request: la solicitud enviada (los índices de unassigned_jobs apuntan a sus jobs)
 * @returns {{ stops: Array<{ shipmentId, stopSequence, etaISO, etaMin, serviceMin, kmFromPrev }>,
 *   km: number, minutes: number, startISO: string|null, endISO: string|null,
 *   geometry: Array<[number, number]>|null, unassigned: Array<{ shipmentId, reason }> }}
 */
export function parseRoutePlannerResponse(response, { request, shipments, vehicle, date }) {
  const byId = Object.fromEntries(shipments.map((s) => [s.id, s]));
  const jobs = request?.jobs ?? [];
  const features = featuresOf(response);
  const feature = features.find((f) => (f.properties?.agent_index ?? 0) === 0) ?? null;
  const { assignedJobs, ...plan } = planOfFeature(feature, jobs, date);
  const stops = plan.stops;

  // Lo que quedó fuera, con su motivo comparado contra lo libre del vehículo (N41)
  const assignedKg = stops.reduce((sum, st) => sum + Math.ceil(byId[st.shipmentId]?.weightKg ?? 0), 0);
  const unassigned = listedUnassigned(response, jobs, byId).map((id) => ({
    shipmentId: id,
    reason: unassignedReason(byId[id], vehicle, assignedKg),
  }));
  // Todo lo enviado que no vuelve en la ruta queda sin asignar, lo liste Geoapify o no (sin ruta para
  // el agente, o una respuesta que lo omite): así ningún pedido queda "asignado" fuera de las paradas
  const listed = new Set([...unassigned.map((u) => u.shipmentId), ...assignedJobs]);
  for (const j of jobs)
    if (byId[j.id] && !listed.has(j.id))
      unassigned.push({ shipmentId: j.id, reason: unassignedReason(byId[j.id], vehicle, feature ? assignedKg : 0) });

  return { ...plan, unassigned };
}

// Forma mínima: si no la cumple, quien llama cae al cálculo local en vez de dejar todo sin asignar
function featuresOf(response) {
  if (!Array.isArray(response?.features)) throw new Error('Respuesta del Route Planner sin features');
  return response.features;
}

/** Ids que Geoapify lista en issues.unassigned_jobs (índices de los jobs enviados). */
function listedUnassigned(response, jobs, byId) {
  const issues = response?.properties?.issues ?? {};
  return (issues.unassigned_jobs ?? []).map((i) => jobs[i]?.id).filter((id) => id && byId[id]);
}

/**
 * La ruta de UN agente (una feature) en la forma del RoutePlan: paradas con ETA, km, minutos, salida,
 * fin y línea por calles. Sin feature (el agente no recibió nada), una ruta vacía.
 */
function planOfFeature(feature, jobs, date) {
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

  return {
    stops,
    assignedJobs: stops.map((st) => st.shipmentId),
    km: round2((p.distance ?? 0) / 1000),
    minutes: Math.round((p.time ?? 0) / 60),
    startISO: feature ? secondsToISO(date, departure) : null,
    endISO: end ? secondsToISO(date, end.start_time) : p.end_time ? secondsToISO(date, p.end_time) : null,
    geometry: flattenGeometry(feature?.geometry),
  };
}

/**
 * Motivo de un pedido que la optimización conjunta no pudo meter en NINGUNA ruta:
 * requisito → ningún vehículo de la flota tiene lo que pide; capacidad → en todos los que podrían
 * llevarlo ya no queda peso libre (o ya llevan maxStops paradas); ventana → había espacio, no hora.
 * @param {object} shipment
 * @param {Array<{ vehicle: object|null, kg: number, stops: number }>} loads  lo que lleva cada agente
 */
export function fleetUnassignedReason(shipment, loads, maxStops = Infinity) {
  const capable = loads.filter((l) =>
    (shipment.requires ?? []).every((r) => (l.vehicle?.capabilities ?? []).includes(r)),
  );
  if (!capable.length) return UNASSIGNED_REASON.REQUISITO;
  const w = Math.ceil(shipment.weightKg ?? 0);
  const room = capable.some(
    (l) => l.stops < maxStops && (!Number.isFinite(l.vehicle?.maxKg) || w <= l.vehicle.maxKg - l.kg),
  );
  return room ? UNASSIGNED_REASON.VENTANA : UNASSIGNED_REASON.CAPACIDAD;
}

/**
 * Traduce la respuesta de la optimización conjunta (varios agentes).
 * @param {object} response  FeatureCollection de Geoapify: una feature por agente con ruta
 * @param {{ request: object, shipments: object[], crew: Array<{ driver: object, vehicle: object|null }>,
 *   date: string, maxStops?: number }} ctx  crew: en el orden de request.agents
 * @returns {{ plans: Array<{ agentIndex: number, stops, km, minutes, startISO, endISO, geometry }>,
 *   unassigned: Array<{ shipmentId, reason }> }}  una entrada en plans por agente (vacía si no recibió nada)
 */
export function parseFleetResponse(response, { request, shipments, crew, date, maxStops = Infinity }) {
  const byId = Object.fromEntries(shipments.map((s) => [s.id, s]));
  const jobs = request?.jobs ?? [];
  const features = featuresOf(response);
  const seen = new Set();
  const plans = crew.map((c, agentIndex) => {
    const feature = features.find((f) => f.properties?.agent_index === agentIndex) ?? null;
    const { assignedJobs, ...plan } = planOfFeature(feature, jobs, date);
    // Un pedido en dos rutas (respuesta rara): se queda en la primera
    const stops = plan.stops.filter((st) => byId[st.shipmentId] && !seen.has(st.shipmentId));
    stops.forEach((st, i) => {
      seen.add(st.shipmentId);
      st.stopSequence = i + 1;
    });
    return { agentIndex, ...plan, stops };
  });

  // Motivo de lo que no entró, contra lo que lleva cada vehículo de la flota
  const loads = crew.map((c, i) => ({
    vehicle: c.vehicle ?? null,
    kg: plans[i].stops.reduce((sum, st) => sum + Math.ceil(byId[st.shipmentId]?.weightKg ?? 0), 0),
    stops: plans[i].stops.length,
  }));
  const left = new Set(listedUnassigned(response, jobs, byId));
  // Lo enviado que no vuelve en ninguna ruta también queda sin asignar (huérfanos no)
  for (const j of jobs) if (byId[j.id] && !seen.has(j.id)) left.add(j.id);
  const unassigned = [...left]
    .filter((id) => !seen.has(id))
    .map((id) => ({ shipmentId: id, reason: fleetUnassignedReason(byId[id], loads, maxStops) }));
  return { plans, unassigned };
}
