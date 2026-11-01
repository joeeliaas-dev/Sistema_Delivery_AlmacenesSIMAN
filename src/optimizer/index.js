// src/optimizer/index.js  (dueño: P2)
// Única puerta al algoritmo: las pantallas y routesService solo llaman a optimizeDay y optimizeRoute.
// Motor principal: Geoapify Route Planner (calles reales, turno, capacidad, ventanas, carga grande).
// Optimizar día (optimización conjunta): UNA llamada al Route Planner con todos los motoristas como agentes; las zonas
// no limitan, se reparte por cercanía. Respaldo: por zona con el algoritmo local de siempre (vecino
// más cercano + 2-opt) y spillOverflow, si Geoapify falla.
import {
  LOCATION_STATUS,
  MAX_ATTEMPTS,
  OPTIMIZER_ENGINE,
  PRIORITY,
  ROUTE_STATUS,
  SIN_ZONA,
  STATUS,
  UNASSIGNED_REASON,
} from '../constants';
import { ROUTING } from '../config/routing';
import { GeoapifyError, geoapifyFetch } from '../lib/geoapify';
import { todayISO } from '../lib/dates';
import { blocksZoneOn } from '../lib/routeDay';
import {
  buildFleetRequest,
  buildRoutePlannerRequest,
  fleetUnassignedReason,
  parseFleetResponse,
  parseRoutePlannerResponse,
  secondsToISO,
  serviceMinOf,
  shiftWindow,
} from './geoapify';
import { haversineKm, optimizeLocal } from './local';

const round2 = (x) => Math.round(x * 100) / 100;
const isExpress = (s) => s.priority === PRIORITY.EXPRESS;
const tieBreak = (a, b) => String(a.code ?? a.id).localeCompare(String(b.code ?? b.id));
const timeOf = (s) => s.timeWindow?.from ?? s.scheduledTime ?? '';
const byTime = (a, b) => String(timeOf(a)).localeCompare(String(timeOf(b))) || tieBreak(a, b);
const byPriorityThenTime = (a, b) => isExpress(b) - isExpress(a) || byTime(a, b);

function pathKm(start, stops, factor) {
  let prev = start,
    sum = 0;
  for (const s of stops) {
    sum += haversineKm(prev, s.location) * factor;
    prev = s.location;
  }
  return sum;
}

/**
 * Línea base del KPI "Km optimizados" (N1): las mismas paradas por hora programada, express primero,
 * en línea recta × factor de calle. Se calcula igual con los dos motores para que sea comparable.
 */
export function baselineKmOf(depot, shipments, circuityFactor = ROUTING.circuityFactor) {
  return round2(pathKm(depot.location, [...shipments].sort(byPriorityThenTime), circuityFactor));
}

/**
 * Algoritmo local (respaldo): primero express y luego normales; dentro de cada grupo, vecino más
 * cercano + 2-opt. El grupo normal arranca desde la última express. Sin calles, horarios ni capacidad.
 *
 * @param {object} args
 * @param {{ location: {lat, lng} }} args.depot
 * @param {Array<{ id, location: {lat, lng}, priority, scheduledTime }>} args.stops  envíos
 * @param {object} [args.options]  sobreescribe ROUTING; además `startAt` (Date o ISO, por defecto ahora)
 * @returns {{
 *   ordered: Array,     // envíos en orden de visita
 *   legs: Array<{ shipmentId, seq, etaMin, kmFromPrev }>,  // misma forma que routes.stops
 *   totalKm: number,    // km del orden optimizado
 *   baselineKm: number, // km por hora programada, respetando express primero
 *   estEnd: string,     // ISO: fin estimado (llegada a la última parada + servicio)
 *   totalMin: number,
 *   skipped: Array,     // envíos que no entraron por maxStops (quedan pendientes)
 *   provider: 'local',
 * }}
 */
export function optimizeLocalRoute({ depot, stops, options = {} }) {
  const cfg = { ...ROUTING, ...options };
  const startAt = new Date(options.startAt ?? Date.now());
  if (!depot?.location) throw new Error('Falta la ubicación del depósito');
  for (const s of stops) {
    if (!Number.isFinite(s?.location?.lat) || !Number.isFinite(s?.location?.lng))
      throw new Error(`El envío ${s?.code ?? s?.id} no tiene ubicación`);
  }

  // Si hay más de maxStops, entran las primeras por prioridad y hora
  const sorted = [...stops].sort(byPriorityThenTime);
  const selected = sorted.slice(0, cfg.maxStops);
  const skipped = sorted.slice(cfg.maxStops);

  // Cada grupo llega ordenado por hora, así el optimizador nunca empeora ese orden
  const express = optimizeLocal({
    depot,
    stops: selected.filter(isExpress),
    circuityFactor: cfg.circuityFactor,
  });
  const lastExpress = express.ordered[express.ordered.length - 1];
  const normal = optimizeLocal({
    depot: lastExpress ?? depot,
    stops: selected.filter((s) => !isExpress(s)),
    circuityFactor: cfg.circuityFactor,
  });
  // Línea base: misma regla (express primero) pero por hora programada; `selected` ya
  // viene en ese orden. Si el optimizado saliera más largo, se usa la línea base.
  const baselineKm = pathKm(depot.location, selected, cfg.circuityFactor);
  const optimized = [...express.ordered, ...normal.ordered];
  const ordered = pathKm(depot.location, optimized, cfg.circuityFactor) <= baselineKm ? optimized : selected;

  // ETA acumulada: llegada a cada parada = viaje + servicio de las paradas anteriores
  let prev = depot.location,
    minutes = 0,
    totalKm = 0;
  const legs = ordered.map((s, i) => {
    const km = haversineKm(prev, s.location) * cfg.circuityFactor;
    totalKm += km;
    minutes += (km / cfg.avgSpeedKmh) * 60;
    const etaMin = Math.round(minutes);
    minutes += options.serviceMinutes ?? (s.serviceMin > 0 ? s.serviceMin : cfg.serviceMinutes);
    prev = s.location;
    return { shipmentId: s.id, seq: i + 1, etaMin, kmFromPrev: round2(km) };
  });

  const totalMin = Math.round(minutes);

  return {
    ordered,
    legs,
    totalKm: round2(totalKm),
    baselineKm: round2(baselineKm),
    estEnd: new Date(startAt.getTime() + totalMin * 60000).toISOString(),
    totalMin,
    skipped,
    provider: 'local',
  };
}

/**
 * Línea base comparable para una ruta de Geoapify (KPI "Km optimizados", N1): sus km son por calles
 * reales y con regreso al depósito, la línea base local no. Se miden con la misma métrica local el
 * orden de Geoapify y el orden por hora, y esa proporción se aplica a los km reales. Nunca menor
 * que totalKm (si el orden de Geoapify no acorta en línea recta, el ahorro cuenta como 0).
 */
export function comparableBaselineKm(depot, routedInOrder, realKm, circuityFactor = ROUTING.circuityFactor) {
  const orderKm = pathKm(depot.location, routedInOrder, circuityFactor);
  const byTimeKm = baselineKmOf(depot, routedInOrder, circuityFactor);
  if (!(orderKm > 0) || !(realKm > 0)) return round2(realKm || byTimeKm);
  return round2(realKm * Math.max(1, byTimeKm / orderKm));
}

// ---------- Contrato del Sprint 4 (C31) ----------

/**
 * Hora de salida de la ruta en segundos desde las 00:00 (N12 con turnos): si la ruta es de hoy y
 * estamos dentro del turno, sale ahora (no se planifica hacia el pasado); si no, al inicio del turno.
 */
export function departureSec(date, driver, now = new Date()) {
  const [start, end] = shiftWindow(driver);
  if (date !== todayISO(now)) return start;
  const nowSec = now.getHours() * 3600 + now.getMinutes() * 60;
  return nowSec > start && nowSec < end ? nowSec : start;
}

/** Envíos que pueden entrar a una ruta nueva: pendientes y reintentos con ubicación confiable. */
export const isPlannable = (s) =>
  (s.status === STATUS.PENDIENTE || (s.status === STATUS.NO_ENTREGADO && s.attempts < MAX_ATTEMPTS)) &&
  hasTrustedLocation(s);

/** Ubicación con la que se puede rutear: alta o confirmada (los datos anteriores al S4 no traen status). */
export function hasTrustedLocation(s) {
  const loc = s.location;
  if (!Number.isFinite(loc?.lat) || !Number.isFinite(loc?.lng)) return false;
  return !loc.status || loc.status === LOCATION_STATUS.ALTA || loc.status === LOCATION_STATUS.CONFIRMADA;
}

/**
 * Antes del cálculo local: saca lo que el vehículo no puede llevar, con el mismo criterio que
 * Geoapify (requisito; capacidad llenando primero express y por hora; máximo de paradas).
 */
export function fitToVehicle(shipments, vehicle, maxStops = ROUTING.maxStops) {
  const caps = vehicle?.capabilities ?? [];
  const fits = [];
  const unassigned = [];
  let kg = 0;
  for (const s of [...shipments].sort(byPriorityThenTime)) {
    if ((s.requires ?? []).some((r) => !caps.includes(r))) {
      unassigned.push({ shipmentId: s.id, reason: UNASSIGNED_REASON.REQUISITO });
      continue;
    }
    const w = Math.ceil(s.weightKg ?? 0);
    const full = Number.isFinite(vehicle?.maxKg) && kg + w > vehicle.maxKg;
    if (full || fits.length >= maxStops) {
      unassigned.push({ shipmentId: s.id, reason: UNASSIGNED_REASON.CAPACIDAD });
      continue;
    }
    kg += w;
    fits.push(s);
  }
  return { fits, unassigned };
}

const FALLBACK_REASON = {
  timeout: 'Geoapify no respondió a tiempo',
  quota: 'se acabaron los créditos de Geoapify por hoy',
  offline: 'no hay conexión a internet',
  http: 'Geoapify devolvió un error',
};

/** Aviso para la franja del despacho cuando una zona cae al cálculo local. */
export function fallbackWarning(zoneName, err) {
  const why = FALLBACK_REASON[err?.code] ?? 'Geoapify no pudo calcular la ruta';
  return `${why[0].toUpperCase()}${why.slice(1)}; la ${zoneName} se calculó en el teléfono, sin calles ni horarios.`;
}

function localPlan({ shipments, vehicle, depot, date, startSec }) {
  const { fits, unassigned } = fitToVehicle(shipments, vehicle);
  if (!fits.length) return { stops: [], km: 0, minutes: 0, endISO: null, startISO: null, geometry: null, unassigned };
  const startISO = secondsToISO(date, startSec);
  const r = optimizeLocalRoute({ depot, stops: fits, options: { startAt: startISO, maxStops: Infinity } });
  const start = new Date(startISO).getTime();
  const iso = (min) => secondsToISO(date, startSec + min * 60);
  const byId = Object.fromEntries(fits.map((s) => [s.id, s]));
  return {
    stops: r.legs.map((l) => ({
      shipmentId: l.shipmentId,
      stopSequence: l.seq,
      etaISO: iso(l.etaMin),
      etaMin: l.etaMin,
      serviceMin: serviceMinOf(byId[l.shipmentId]),
      kmFromPrev: l.kmFromPrev,
    })),
    km: r.totalKm,
    minutes: r.totalMin,
    startISO,
    endISO: secondsToISO(date, startSec + (new Date(r.estEnd).getTime() - start) / 1000),
    geometry: null,
    unassigned,
  };
}

/**
 * Ruta de una zona (RoutePlan del contrato). Pide la ruta a Geoapify; si falla, la calcula local.
 * @param {{ shipments: object[], driver: object, vehicle: object|null, depot: object, date: string,
 *   zoneId?: string, zoneName?: string, engine?: 'geoapify'|'local', now?: Date }} args
 *   engine: forzar un motor (pruebas); zoneName: para el aviso
 * @returns {Promise<{ zoneId, driverId, vehicleId, engine, stops: Array<{ shipmentId, stopSequence,
 *   etaISO, etaMin, serviceMin, kmFromPrev }>, km, baselineKm, minutes, startISO, endISO,
 *   geometry: Array<[lat, lng]>|null, unassigned: Array<{ shipmentId, reason }>, warning: string|null }>}
 */
export async function optimizeRoute({ shipments, driver, vehicle, depot, date, zoneId, zoneName, engine, now }) {
  if (!depot?.location) throw new Error('Falta la ubicación del depósito');
  const startSec = departureSec(date, driver, now);
  const base = {
    zoneId: zoneId ?? driver?.zoneId ?? null,
    driverId: driver?.id ?? null,
    vehicleId: vehicle?.id ?? null,
  };
  const finish = (plan, used, warning = null) => {
    const byId = Object.fromEntries(shipments.map((s) => [s.id, s]));
    const routed = plan.stops.map((st) => byId[st.shipmentId]).filter(Boolean);
    const baselineKm =
      used === OPTIMIZER_ENGINE.GEOAPIFY ? comparableBaselineKm(depot, routed, plan.km) : baselineKmOf(depot, routed);
    return { ...base, engine: used, ...plan, baselineKm, warning };
  };
  if (!shipments.length)
    return finish(localPlan({ shipments, vehicle, depot, date, startSec }), OPTIMIZER_ENGINE.LOCAL);

  if (engine !== OPTIMIZER_ENGINE.LOCAL) {
    // El máximo de paradas por ruta vale con los dos motores: entran las primeras por prioridad y hora
    const sorted = [...shipments].sort(byPriorityThenTime);
    const sent = sorted.length > ROUTING.maxStops ? sorted.slice(0, ROUTING.maxStops) : shipments;
    const overflow = sorted
      .slice(ROUTING.maxStops)
      .map((s) => ({ shipmentId: s.id, reason: UNASSIGNED_REASON.CAPACIDAD }));
    try {
      const request = buildRoutePlannerRequest({ shipments: sent, driver, vehicle, depot, startSec });
      const response = await geoapifyFetch('/v1/routeplanner', { method: 'POST', body: request });
      const plan = parseRoutePlannerResponse(response, { request, shipments: sent, vehicle, date });
      return finish({ ...plan, unassigned: [...plan.unassigned, ...overflow] }, OPTIMIZER_ENGINE.GEOAPIFY);
    } catch (err) {
      // Cualquier falla (API, red, créditos o respuesta inesperada) cae al cálculo local de esa zona
      if (!(err instanceof GeoapifyError)) console.error('[optimizer] respuesta de Geoapify inesperada:', err);
      const plan = localPlan({ shipments, vehicle, depot, date, startSec });
      return finish(plan, OPTIMIZER_ENGINE.LOCAL, fallbackWarning(zoneName ?? `zona ${base.zoneId}`, err));
    }
  }
  return finish(localPlan({ shipments, vehicle, depot, date, startSec }), OPTIMIZER_ENGINE.LOCAL);
}

/**
 * Ruta abierta y ya iniciada de cada zona (en curso, o con alguna parada en camino), según los envíos.
 * @returns {Map<string, object>} zoneId → ruta
 */
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

// Hasta dónde se manda un pedido a la ruta de otra zona (km en línea recta a su parada más cercana)
const SPILL_MAX_KM = 8;

/**
 * Lo que no cupo en el vehículo de su zona (peso, paradas o carga grande) pasa a otra ruta del día
 * con espacio y el requisito, la más cercana, o a un motorista libre (zona sin pedidos). Solo se
 * recalculan las rutas que reciben pedidos; si el recálculo no los mete, siguen sin asignar.
 * @returns {Promise<object[]>} los planes, con `spilled` (cuántos recibió cada uno)
 */
async function spillOverflow({ plans, byZone, drivers, vehicles, depot, date, engine, now, zoneName, startedByZone }) {
  const byId = new Map([...byZone.values()].flat().map((s) => [s.id, s]));
  const SPILL = [UNASSIGNED_REASON.CAPACIDAD, UNASSIGNED_REASON.REQUISITO];
  const overflow = plans
    .flatMap((p) => p.unassigned.filter((u) => SPILL.includes(u.reason)).map((u) => byId.get(u.shipmentId)))
    .filter(Boolean)
    .sort(byPriorityThenTime);
  if (!overflow.length) return plans;

  const vehicleOf = (d) => vehicles.find((v) => v.id === d?.vehicleId) ?? null;
  const receivers = plans.map((p) => {
    const driver = drivers.find((d) => d.id === p.driverId) ?? null;
    const list = p.stops.map((st) => byId.get(st.shipmentId)).filter(Boolean);
    return { plan: p, zoneId: p.zoneId, driver, vehicle: vehicleOf(driver), list, extras: [] };
  });
  // Motoristas sin pedidos en su zona (y cuya ruta no salió): también pueden recibir
  for (const d of drivers) {
    if (d.active === false || !d.zoneId || byZone.has(d.zoneId) || startedByZone.has(d.zoneId)) continue;
    if (receivers.some((r) => r.zoneId === d.zoneId)) continue;
    receivers.push({ plan: null, zoneId: d.zoneId, driver: d, vehicle: vehicleOf(d), list: [], extras: [] });
  }

  const kgOf = (list) => list.reduce((sum, s) => sum + Math.ceil(s.weightKg ?? 0), 0);
  const distance = (s, r) => {
    const points = [...r.list, ...r.extras].map((x) => x.location);
    if (!points.length) return haversineKm(depot.location, s.location);
    return Math.min(...points.map((p) => haversineKm(p, s.location)));
  };
  for (const s of overflow) {
    const fits = receivers.filter((r) => {
      if (!r.vehicle || r.zoneId === s.zoneId) return false;
      if ((s.requires ?? []).some((req) => !(r.vehicle.capabilities ?? []).includes(req))) return false;
      const all = [...r.list, ...r.extras];
      if (all.length >= ROUTING.maxStops) return false;
      if (Number.isFinite(r.vehicle.maxKg) && kgOf(all) + Math.ceil(s.weightKg ?? 0) > r.vehicle.maxKg) return false;
      return !all.length || distance(s, r) <= SPILL_MAX_KM;
    });
    if (!fits.length) continue;
    const best = fits.reduce((a, b) => (distance(s, b) < distance(s, a) ? b : a));
    best.extras.push(s);
  }

  const placed = new Set();
  const replans = await Promise.all(
    receivers.map(async (r) => {
      if (!r.extras.length) return r.plan;
      const extraIds = new Set(r.extras.map((s) => s.id));
      const p = await optimizeRoute({
        shipments: [...r.list, ...r.extras],
        driver: r.driver,
        vehicle: r.vehicle,
        depot,
        date,
        zoneId: r.zoneId,
        zoneName: zoneName(r.zoneId),
        engine,
        now,
      });
      const got = p.stops.filter((st) => extraIds.has(st.shipmentId));
      got.forEach((st) => placed.add(st.shipmentId));
      // Los recibidos que no entraron siguen como sin asignar en el plan de su zona, no aquí. Y los sin
      // asignar PROPIOS de esta zona (no iban en r.list, así que el recálculo no los ve) se conservan:
      // antes se perdían y esos pedidos quedaban fuera de la cuenta (ni en ruta ni sin asignar)
      const own = (r.plan?.unassigned ?? []).filter((u) => !p.stops.some((st) => st.shipmentId === u.shipmentId));
      const fresh = p.unassigned.filter(
        (u) => !extraIds.has(u.shipmentId) && !own.some((o) => o.shipmentId === u.shipmentId),
      );
      return { ...p, unassigned: [...own, ...fresh], spilled: got.length };
    }),
  );
  return replans
    .filter((p) => p && (p.stops.length || p.unassigned.length || plans.includes(p)))
    .map((p) => ({ ...p, unassigned: p.unassigned.filter((u) => !placed.has(u.shipmentId)) }));
}

/**
 * Plan del día POR ZONA (respaldo local de Optimizar día, y el cálculo de antes de la optimización conjunta): una ruta por
 * zona con motorista, en paralelo, y spillOverflow para lo que no cupo en el vehículo de su zona.
 * Solo entran pendientes y reintentos con ubicación alta o confirmada; los demás vuelven en
 * `unassigned` con motivo `sin_ubicacion`.
 * @param {{ date: string, shipments: object[], drivers: object[], vehicles: object[], depot: object,
 *   zones?: object[], routes?: object[], engine?: 'geoapify'|'local', now?: Date, spill?: boolean }} args
 *   spill: false para no repartir lo que no cupo por cercanía (el híbrido lo reparte con Geoapify)
 *   routes: rutas de la fecha; los envíos de las que siguen 'asignada' se vuelven a planificar
 * @returns {Promise<{ engine: 'geoapify'|'local', warnings: string[], plans: object[],
 *   unassigned: Array<{ shipmentId, reason }> }>}
 */
export async function optimizeDayByZone({
  date,
  shipments,
  drivers,
  vehicles,
  depot,
  zones = [],
  routes = [],
  engine,
  now,
  spill = true,
}) {
  const warnings = [];
  const unassigned = [];
  const byZone = new Map();
  // Rutas que todavía no salen (S4-07): sus envíos vuelven a entrar al cálculo y la ruta se reemplaza
  // Solo las de ESTE día: una ruta sin salir de otro día (p. ej. la de hoy al optimizar mañana) no se toca
  const replaceable = new Set(
    routes.filter((r) => r.status === ROUTE_STATUS.ASIGNADA && r.date === date).map((r) => r.id),
  );
  // Zonas cuya ruta ya salió y sigue abierta: no se cambian, así que ni se le pregunta a Geoapify
  // (ahorra créditos). Sus pendientes quedan sin motivo y el despacho los muestra en "Esperan otra ruta".
  // Solo las que ocupan la zona ESE día: la ruta en curso de hoy no bloquea mañana (C45)
  const startedByZone = startedRoutesByZone(
    routes.filter((r) => blocksZoneOn(r, date, todayISO(now))),
    shipments,
  );
  const zoneName = (id) => zones.find((z) => z.id === id)?.name ?? `zona ${id}`;
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
    const vehicle = vehicles.find((v) => v.id === driver.vehicleId) ?? null;
    if (!vehicle)
      warnings.push(`${driver.name ?? driver.id} no tiene vehículo asignado: su ruta sale sin límite de peso.`);
    return optimizeRoute({
      shipments: list,
      driver,
      vehicle,
      depot,
      date,
      zoneId,
      zoneName: zoneName(zoneId),
      engine,
      now,
    });
  });

  // Orden por zona: las letras de ruta (Ruta A, B…) salen en el mismo orden cada vez
  let plans = (await Promise.all(jobs)).filter(Boolean);
  // spill: false en el híbrido, que reparte lo que no cupo con Geoapify en vez de por cercanía
  if (spill)
    plans = await spillOverflow({
      plans,
      byZone,
      drivers,
      vehicles,
      depot,
      date,
      engine,
      now,
      zoneName,
      startedByZone,
    });
  plans.sort((a, b) => String(a.zoneId).localeCompare(String(b.zoneId)));
  const moved = plans.reduce((n, p) => n + (p.spilled ?? 0), 0);
  if (moved)
    warnings.push(
      moved === 1
        ? '1 pedido que no cabía en el vehículo de su zona pasó a la ruta con espacio más cercana.'
        : `${moved} pedidos que no cabían en el vehículo de su zona pasaron a la ruta con espacio más cercana.`,
    );
  for (const p of plans) {
    if (p.warning) warnings.push(p.warning);
    unassigned.push(...p.unassigned);
  }
  // Lo que sigue sin entrar después de repartir entre zonas: la flota del día no alcanza
  const noRoom = unassigned.filter((u) =>
    [UNASSIGNED_REASON.CAPACIDAD, UNASSIGNED_REASON.REQUISITO].includes(u.reason),
  ).length;
  if (noRoom)
    warnings.push(
      `${noRoom === 1 ? '1 pedido no cabe' : `${noRoom} pedidos no caben`} en ningún vehículo: todas las rutas van llenas ` +
        `(peso del vehículo o ${ROUTING.maxStops} paradas por ruta). Agregue un vehículo o páselos a otro día.`,
    );
  const allGeoapify = plans.length > 0 && plans.every((p) => p.engine === OPTIMIZER_ENGINE.GEOAPIFY);
  return { engine: allGeoapify ? OPTIMIZER_ENGINE.GEOAPIFY : OPTIMIZER_ENGINE.LOCAL, warnings, plans, unassigned };
}

// ---------- Optimización conjunta (Optimizar día con Geoapify) ----------

/**
 * Límite de un llamado normal al Route Planner: 300 coordenadas distintas entre depósito y pedidos.
 * Se deja una para el depósito.
 */
export const MAX_FLEET_JOBS = 299;

const firstName = (driver) => (driver?.name ?? driver?.id ?? '').split(' ')[0];

/** Aviso cuando la optimización conjunta no se pudo hacer y el día sale por zona, en el teléfono. */
export function fleetFallbackWarning(err) {
  const why = FALLBACK_REASON[err?.code] ?? 'Geoapify no pudo calcular las rutas';
  return `${why[0].toUpperCase()}${why.slice(1)}; las rutas se calcularon en el teléfono, por zona, sin calles ni horarios.`;
}

/** Rondas como máximo de la optimización conjunta: cada una es UNA llamada a Geoapify con la flota. */
export const MAX_FLEET_ROUNDS = 3;

const kgOf = (list) => list.reduce((sum, s) => sum + Math.ceil(s.weightKg ?? 0), 0);

/**
 * Plan del día por RONDAS de optimización conjunta: los motoristas libres como agentes y los pedidos
 * planificables como jobs. Geoapify reparte por cercanía (las zonas no limitan) y devuelve una ruta por
 * agente; cada plan lleva el zoneId de su motorista solo para mostrar.
 *   - Ronda 1: toda la flota. Geoapify no tiene un máximo de paradas por agente y a veces carga todo en
 *     pocos vehículos grandes y deja motos sin usar (issues.unassigned_agents). La ruta que se pase de
 *     maxStops se recorta (entran las primeras por prioridad y hora) y se vuelve a pedir sola.
 *   - Rondas 2 y 3: lo recortado y lo que no cupo por capacidad, solo con los motoristas que siguen
 *     con espacio (los que no se usaron, y los que tienen menos de maxStops paradas con sus kg libres).
 *     Si a un motorista que ya tenía ruta le tocan pedidos nuevos, se junta todo y se pide sola su ruta
 *     (optimizeRoute) para ordenarla entera. Se para cuando una ronda no mete nada nuevo.
 *   - El motorista cuya ruta ya salió no entra como agente; los pedidos de su zona sí entran al reparto.
 *   - Lo que no entra vuelve en `unassigned` con su motivo contra TODA la flota, y también en un plan,
 *     para que createRoutesForDay lo escriba igual que antes.
 * Lanza si falla la ronda 1: optimizeDay cae entonces al cálculo por zona. Si falla una ronda
 * posterior, queda lo de las rondas anteriores.
 */
async function optimizeDayFleet({ date, shipments, drivers, vehicles, depot, zones = [], routes = [], now }) {
  if (!depot?.location) throw new Error('Falta la ubicación del depósito');
  const warnings = [];
  const unassigned = [];
  const zoneName = (id) => zones.find((z) => z.id === id)?.name ?? `zona ${id}`;
  const replaceable = new Set(
    routes.filter((r) => r.status === ROUTE_STATUS.ASIGNADA && r.date === date).map((r) => r.id),
  );
  // Quien ya salió y sigue en ruta ESE día no recibe pedidos nuevos (los pedidos de su zona sí se reparten)
  const started = startedRoutesByZone(
    routes.filter((r) => blocksZoneOn(r, date, todayISO(now))),
    shipments,
  );
  const busy = new Map([...started.values()].filter((r) => r.driverId).map((r) => [r.driverId, r]));
  for (const [driverId, r] of busy) {
    const driver = drivers.find((d) => d.id === driverId);
    warnings.push(`${firstName(driver) || driverId} sigue en ruta (${r.code}): no recibe pedidos nuevos.`);
  }

  const pool = [];
  for (const s of shipments) {
    const open =
      s.status === STATUS.PENDIENTE ||
      (s.status === STATUS.NO_ENTREGADO && s.attempts < MAX_ATTEMPTS) ||
      (s.status === STATUS.ASIGNADO && replaceable.has(s.routeId));
    if (!open) continue;
    if (!hasTrustedLocation(s) || !s.zoneId || s.zoneId === SIN_ZONA)
      unassigned.push({ shipmentId: s.id, reason: UNASSIGNED_REASON.SIN_UBICACION });
    else pool.push(s);
  }

  const crew = drivers
    .filter((d) => d.active !== false && d.zoneId && !busy.has(d.id))
    .map((driver) => {
      const vehicle = vehicles.find((v) => v.id === driver.vehicleId) ?? null;
      if (!vehicle)
        warnings.push(`${driver.name ?? driver.id} no tiene vehículo asignado: su ruta sale sin límite de peso.`);
      return { driver, vehicle, startSec: departureSec(date, driver, now) };
    });
  if (!crew.length) {
    if (pool.length) warnings.push(`No hay motoristas libres: los ${pool.length} pedidos quedan pendientes.`);
    return { engine: OPTIMIZER_ENGINE.GEOAPIFY, warnings, plans: [], unassigned, rounds: 0 };
  }
  const crewOf = new Map(crew.map((c) => [c.driver.id, c]));

  // Lo que no puede entrar en ningún caso (paradas de toda la flota o límite de coordenadas)
  const sorted = [...pool].sort(byPriorityThenTime);
  const limit = Math.min(crew.length * ROUTING.maxStops, MAX_FLEET_JOBS);
  const byId = Object.fromEntries(pool.map((s) => [s.id, s]));
  const left = sorted.slice(limit).map((s) => ({ shipmentId: s.id, reason: UNASSIGNED_REASON.CAPACIDAD }));

  // Ruta de cada motorista: driverId → { list: sus pedidos, plan: RoutePlan }
  const held = new Map();
  const planOf = (c, rp, list) => ({
    zoneId: c.driver.zoneId ?? null,
    driverId: c.driver.id,
    vehicleId: c.vehicle?.id ?? null,
    engine: OPTIMIZER_ENGINE.GEOAPIFY,
    stops: rp.stops,
    km: rp.km,
    // "ahorra X km": línea base de la ruta con SUS paradas, comparable con los km por calles
    baselineKm: comparableBaselineKm(depot, list, rp.km),
    minutes: rp.minutes,
    startISO: rp.startISO,
    endISO: rp.endISO,
    geometry: rp.geometry,
    unassigned: [],
    warning: null,
  });
  // Deja la ruta del motorista con `list`: tal cual la devolvió la ronda (rp) si no pasa de maxStops;
  // si se pasa, o junta pedidos de dos rondas, se recorta y se pide sola. Devuelve lo que no entró.
  async function settle(c, list, rp) {
    if (rp && list.length <= ROUTING.maxStops) {
      held.set(c.driver.id, { list, plan: planOf(c, rp, list) });
      return [];
    }
    const keep = [...list].sort(byPriorityThenTime).slice(0, ROUTING.maxStops);
    const keepIds = new Set(keep.map((s) => s.id));
    const out = list
      .filter((s) => !keepIds.has(s.id))
      .map((s) => ({ shipmentId: s.id, reason: UNASSIGNED_REASON.CAPACIDAD }));
    const single = await optimizeRoute({
      shipments: keep,
      driver: c.driver,
      vehicle: c.vehicle,
      depot,
      date,
      zoneId: c.driver.zoneId,
      zoneName: zoneName(c.driver.zoneId),
      now,
    });
    const lost = new Set(single.unassigned.map((u) => u.shipmentId));
    held.set(c.driver.id, { list: keep.filter((s) => !lost.has(s.id)), plan: { ...single, unassigned: [] } });
    return [...out, ...single.unassigned];
  }

  let candidates = sorted.slice(0, limit);
  let rounds = 0;
  for (let round = 1; round <= MAX_FLEET_ROUNDS && candidates.length; round++) {
    // Ronda 1: toda la flota. Después, quien sigue con espacio, con la capacidad que le queda
    const members =
      round === 1
        ? crew
        : crew.flatMap((c) => {
            const h = held.get(c.driver.id);
            if (!h) return [c];
            const freeKg = Number.isFinite(c.vehicle?.maxKg) ? c.vehicle.maxKg - kgOf(h.list) : Infinity;
            if (h.list.length >= ROUTING.maxStops || freeKg <= 0) return [];
            return [{ ...c, vehicle: c.vehicle ? { ...c.vehicle, maxKg: freeKg } : null }];
          });
    if (!members.length) break;

    let parsed;
    try {
      const request = buildFleetRequest({ shipments: candidates, crew: members, depot });
      const response = await geoapifyFetch('/v1/routeplanner', { method: 'POST', body: request });
      parsed = parseFleetResponse(response, {
        request,
        shipments: candidates,
        crew: members,
        date,
        maxStops: ROUTING.maxStops,
      });
      rounds = round;
    } catch (err) {
      if (round === 1) throw err;
      if (!(err instanceof GeoapifyError)) console.error('[optimizer] ronda de la optimización conjunta fallida:', err);
      warnings.push(`La ronda ${round} del reparto no se pudo calcular: lo que no cupo queda sin asignar.`);
      break;
    }

    const retry = [];
    let added = 0;
    const outs = await Promise.all(
      parsed.plans
        .filter((rp) => rp.stops.length)
        .map((rp) => {
          const c = crewOf.get(members[rp.agentIndex].driver.id); // con su vehículo completo
          const prev = held.get(c.driver.id)?.list ?? [];
          const fresh = rp.stops.map((st) => byId[st.shipmentId]);
          added += fresh.length;
          return settle(c, [...prev, ...fresh], prev.length ? null : rp);
        }),
    );
    for (const out of outs) retry.push(...out);
    // En la ronda 1 el motivo ya es contra toda la flota: requisito y ventana no se reintentan
    for (const u of parsed.unassigned)
      if (round === 1 && u.reason !== UNASSIGNED_REASON.CAPACIDAD) left.push(u);
      else retry.push(u);
    candidates = [...new Set(retry.map((u) => u.shipmentId))].map((id) => byId[id]).filter(Boolean);
    if (round > 1 && !added) break; // esta ronda no metió nada nuevo
  }

  // Lo que sigue sin entrar: motivo contra lo que lleva cada vehículo de la flota al final
  const loads = crew.map((c) => {
    const list = held.get(c.driver.id)?.list ?? [];
    return { vehicle: c.vehicle, kg: kgOf(list), stops: list.length };
  });
  for (const s of candidates)
    left.push({ shipmentId: s.id, reason: fleetUnassignedReason(s, loads, ROUTING.maxStops) });

  const plans = [...held.values()].map((h) => h.plan).filter((p) => p.stops.length);
  // Cada sin asignar va también a un plan, para que createRoutesForDay lo escriba con su motivo: al de
  // la zona de la ruta sin salir que hoy lo lleva (esa ruta lo suelta al rehacerse), o al de su zona
  plans.sort(
    (a, b) => String(a.zoneId).localeCompare(String(b.zoneId)) || String(a.driverId).localeCompare(String(b.driverId)),
  );
  const holderZone = new Map(routes.filter((r) => replaceable.has(r.id)).map((r) => [r.id, r.zoneId]));
  for (const u of left) {
    const s = byId[u.shipmentId];
    const zoneId = holderZone.get(s?.routeId) ?? s?.zoneId;
    const home = plans.find((p) => p.zoneId === zoneId) ?? plans.find((p) => p.zoneId === s?.zoneId);
    if (home) home.unassigned.push(u);
  }
  unassigned.push(...left);
  for (const p of plans) if (p.warning) warnings.push(p.warning);

  const noRoom = left.filter((u) =>
    [UNASSIGNED_REASON.CAPACIDAD, UNASSIGNED_REASON.REQUISITO].includes(u.reason),
  ).length;
  // "Todas las rutas van llenas" solo si de verdad se usaron todos los vehículos
  const idle = crew.filter((c) => !plans.some((p) => p.driverId === c.driver.id));
  if (noRoom) {
    const head = `${noRoom === 1 ? '1 pedido no cabe' : `${noRoom} pedidos no caben`} en ningún vehículo: `;
    warnings.push(
      idle.length
        ? `${head}${idle.map((c) => firstName(c.driver)).join(' y ')} ${idle.length === 1 ? 'quedó' : 'quedaron'} ` +
            'sin ruta porque lo que falta no les cabe (peso, carga grande u horario). Páselos a otro día.'
        : `${head}todas las rutas van llenas (peso del vehículo o ${ROUTING.maxStops} paradas por ruta). ` +
            'Agregue un vehículo o páselos a otro día.',
    );
  }
  const allGeoapify = plans.every((p) => p.engine === OPTIMIZER_ENGINE.GEOAPIFY);
  return {
    engine: allGeoapify ? OPTIMIZER_ENGINE.GEOAPIFY : OPTIMIZER_ENGINE.LOCAL,
    warnings,
    plans,
    unassigned,
    rounds,
  };
}

// ---------- Híbrido: por zona, y lo que no cupo lo reparte Geoapify ----------

const NO_ROOM = [UNASSIGNED_REASON.CAPACIDAD, UNASSIGNED_REASON.REQUISITO];

/** Aviso de lo que no cabe en ningún vehículo; no dice "todas las rutas van llenas" si quedó uno sin usar. */
function noRoomWarning(count, idleDrivers) {
  const head = `${count === 1 ? '1 pedido no cabe' : `${count} pedidos no caben`} en ningún vehículo: `;
  return idleDrivers.length
    ? `${head}${idleDrivers.map(firstName).join(' y ')} ${idleDrivers.length === 1 ? 'quedó' : 'quedaron'} ` +
        'sin ruta porque lo que falta no les cabe (peso, carga grande u horario). Páselos a otro día.'
    : `${head}todas las rutas van llenas (peso del vehículo o ${ROUTING.maxStops} paradas por ruta). ` +
        'Agregue un vehículo o páselos a otro día.';
}

/**
 * Plan del día HÍBRIDO, para compararlo con los otros dos (P1 lo conecta al interruptor):
 *   (a) por zona, como siempre (rutas compactas), pero SIN pasar lo que no cupo por cercanía;
 *   (b) UNA llamada conjunta solo con lo que quedó por capacidad o requisito, y solo los vehículos
 *       con espacio (kg libres y menos de maxStops paradas), incluidos los motoristas sin pedidos;
 *   (c) cada motorista que recibe pedidos vuelve a pedir su ruta sola (optimizeRoute) para ordenarla
 *       entera; lo que ese recálculo deja fuera queda sin asignar.
 * Es el "pasar lo que no cabe" de spillOverflow, pero decidido por Geoapify. Si la llamada (b)
 * falla, queda lo de (a) con un aviso. Mismos argumentos y resultado que optimizeDay.
 */
export async function optimizeDayHybrid(args) {
  const { date, shipments, drivers, vehicles, depot, zones = [], routes = [], engine, now } = args;
  const day = await optimizeDayByZone({ ...args, spill: false });
  const byId = Object.fromEntries(shipments.map((s) => [s.id, s]));
  const zoneName = (id) => zones.find((z) => z.id === id)?.name ?? `zona ${id}`;
  const warnings = day.warnings.filter((w) => !/no caben? en ningún vehículo/.test(w));
  const listOf = (p) => (p?.stops ?? []).map((st) => byId[st.shipmentId]).filter(Boolean);
  const kgOfList = (list) => list.reduce((sum, s) => sum + Math.ceil(s.weightKg ?? 0), 0);

  // Motoristas que pueden recibir: activos, con zona, y cuya ruta no salió (igual que por zona)
  const started = startedRoutesByZone(
    routes.filter((r) => blocksZoneOn(r, date, todayISO(now))),
    shipments,
  );
  const busy = new Set([...started.values()].map((r) => r.driverId));
  const crew = drivers
    .filter((d) => d.active !== false && d.zoneId && !started.has(d.zoneId) && !busy.has(d.id))
    .map((driver) => ({
      driver,
      vehicle: vehicles.find((v) => v.id === driver.vehicleId) ?? null,
      startSec: departureSec(date, driver, now),
    }));
  const planOf = new Map(day.plans.filter((p) => p.driverId).map((p) => [p.driverId, p]));
  // Cada uno con lo que le queda: kg libres como capacidad; fuera los que ya van en maxStops
  const members = crew.flatMap((c) => {
    const list = listOf(planOf.get(c.driver.id));
    const freeKg = Number.isFinite(c.vehicle?.maxKg) ? c.vehicle.maxKg - kgOfList(list) : Infinity;
    if (list.length >= ROUTING.maxStops || freeKg <= 0) return [];
    return [{ ...c, vehicle: c.vehicle ? { ...c.vehicle, maxKg: freeKg } : null }];
  });
  const leftovers = day.unassigned.filter((u) => NO_ROOM.includes(u.reason)).map((u) => byId[u.shipmentId]);

  // De qué motorista viene cada sin asignar (para que createRoutesForDay lo escriba con su plan)
  const originOf = new Map();
  for (const p of day.plans) for (const u of p.unassigned) originOf.set(u.shipmentId, p.driverId);

  let finalPlans = day.plans;
  const lost = [];
  let shared = false; // si Geoapify repartió lo que no cupo (si no, los motivos quedan como por zona)
  if (leftovers.length && members.length) {
    try {
      const request = buildFleetRequest({ shipments: leftovers, crew: members, depot });
      const response = await geoapifyFetch('/v1/routeplanner', { method: 'POST', body: request });
      const parsed = parseFleetResponse(response, {
        request,
        shipments: leftovers,
        crew: members,
        date,
        maxStops: ROUTING.maxStops,
      });
      shared = true;
      const replaced = new Map();
      await Promise.all(
        parsed.plans
          .filter((rp) => rp.stops.length)
          .map(async (rp) => {
            const c = crew.find((x) => x.driver.id === members[rp.agentIndex].driver.id); // vehículo completo
            const prevPlan = planOf.get(c.driver.id);
            const all = [...listOf(prevPlan), ...rp.stops.map((st) => byId[st.shipmentId])];
            const keep = [...all].sort(byPriorityThenTime).slice(0, ROUTING.maxStops);
            const keepIds = new Set(keep.map((s) => s.id));
            for (const s of all)
              if (!keepIds.has(s.id)) {
                lost.push({ shipmentId: s.id, reason: UNASSIGNED_REASON.CAPACIDAD });
                originOf.set(s.id, c.driver.id);
              }
            const single = await optimizeRoute({
              shipments: keep,
              driver: c.driver,
              vehicle: c.vehicle,
              depot,
              date,
              zoneId: c.driver.zoneId,
              zoneName: zoneName(c.driver.zoneId),
              engine,
              now,
            });
            for (const u of single.unassigned) {
              lost.push(u);
              originOf.set(u.shipmentId, c.driver.id);
            }
            replaced.set(c.driver.id, { ...single, unassigned: [] });
          }),
      );
      finalPlans = [
        ...day.plans.map((p) => replaced.get(p.driverId) ?? p),
        ...[...replaced].filter(([id]) => !planOf.has(id)).map(([, p]) => p),
      ];
      for (const p of replaced.values()) if (p.warning) warnings.push(p.warning);
    } catch (err) {
      if (!(err instanceof GeoapifyError)) console.error('[optimizer] reparto híbrido fallido:', err);
      warnings.push('No se pudo repartir con Geoapify lo que no cupo en su zona: queda sin asignar.');
    }
  }

  // Sin asignar al final: lo de (a) que no se colocó, más lo que los recálculos dejaron fuera; el
  // motivo de "no cabe" se mide contra lo que lleva cada vehículo de la flota al final
  const routed = new Set(finalPlans.flatMap((p) => p.stops.map((st) => st.shipmentId)));
  const moved = leftovers.filter((s) => routed.has(s.id)).length;
  const loads = crew.map((c) => {
    const list = listOf(finalPlans.find((p) => p.driverId === c.driver.id));
    return { vehicle: c.vehicle, kg: kgOfList(list), stops: list.length };
  });
  const seen = new Set();
  const unassigned = [];
  for (const u of [...day.unassigned, ...lost]) {
    if (routed.has(u.shipmentId) || seen.has(u.shipmentId)) continue;
    seen.add(u.shipmentId);
    const s = byId[u.shipmentId];
    const reason =
      shared && NO_ROOM.includes(u.reason) && s ? fleetUnassignedReason(s, loads, ROUTING.maxStops) : u.reason;
    unassigned.push({ shipmentId: u.shipmentId, reason });
  }
  // Cada sin asignar que venía en un plan vuelve al plan de ese motorista (o al de su zona); los que
  // no venían en ninguno (sin ubicación) quedan solo en unassigned, como por zona
  const plans = finalPlans.map((p) => ({ ...p, unassigned: [] }));
  for (const u of unassigned) {
    const from = originOf.get(u.shipmentId);
    if (!from) continue;
    const home = plans.find((p) => p.driverId === from) ?? plans.find((p) => p.zoneId === byId[u.shipmentId]?.zoneId);
    if (home) home.unassigned.push(u);
  }
  const kept = plans
    .filter((p) => p.stops.length || p.unassigned.length)
    .sort((a, b) => String(a.zoneId).localeCompare(String(b.zoneId)));

  if (moved)
    warnings.push(
      moved === 1
        ? '1 pedido que no cabía en el vehículo de su zona pasó a otra ruta.'
        : `${moved} pedidos que no cabían en el vehículo de su zona pasaron a otra ruta.`,
    );
  const noRoom = unassigned.filter((u) => NO_ROOM.includes(u.reason)).length;
  if (noRoom) {
    const idle = crew.filter((c) => !kept.some((p) => p.driverId === c.driver.id && p.stops.length));
    warnings.push(
      noRoomWarning(
        noRoom,
        idle.map((c) => c.driver),
      ),
    );
  }
  const allGeoapify = kept.length > 0 && kept.every((p) => p.engine === OPTIMIZER_ENGINE.GEOAPIFY);
  return {
    engine: allGeoapify ? OPTIMIZER_ENGINE.GEOAPIFY : OPTIMIZER_ENGINE.LOCAL,
    warnings,
    plans: kept,
    unassigned,
    moved,
  };
}

/**
 * Plan del día (DayPlan del contrato). Con Geoapify, la optimización conjunta por rondas: una ruta por
 * motorista libre, repartiendo por cercanía. Si Geoapify falla (o con engine 'local'), por zona en el teléfono
 * con spillOverflow, como antes.
 * Solo entran pendientes y reintentos con ubicación alta o confirmada; los demás vuelven en
 * `unassigned` con motivo `sin_ubicacion`.
 * @param {{ date: string, shipments: object[], drivers: object[], vehicles: object[], depot: object,
 *   zones?: object[], routes?: object[], engine?: 'geoapify'|'local', now?: Date }} args
 *   routes: rutas de la fecha; los envíos de las que siguen 'asignada' se vuelven a planificar
 * @returns {Promise<{ engine: 'geoapify'|'local', warnings: string[], plans: object[],
 *   unassigned: Array<{ shipmentId, reason }> }>}
 */
export async function optimizeDay(args) {
  if (args.engine === OPTIMIZER_ENGINE.LOCAL) return optimizeDayByZone(args);
  try {
    return await optimizeDayFleet(args);
  } catch (err) {
    // Cualquier falla (API, red, créditos o respuesta inesperada): el día sale por zona, en el teléfono
    if (!(err instanceof GeoapifyError)) console.error('[optimizer] optimización conjunta fallida:', err);
    const day = await optimizeDayByZone({ ...args, engine: OPTIMIZER_ENGINE.LOCAL });
    return { ...day, warnings: [fleetFallbackWarning(err), ...day.warnings] };
  }
}
