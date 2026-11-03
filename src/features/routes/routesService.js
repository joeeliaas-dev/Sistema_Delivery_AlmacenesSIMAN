// src/features/routes/routesService.js  (dueño: P2)
// Rutas del día: lecturas (listen*), createRoute (Generar ruta óptima de una zona),
// createRoutesForDay (Optimizar día, S4-07), moveStop (Pasar a…, S4-08) y startRoute (Iniciar ruta).
// Única puerta para crear o iniciar rutas. No escribe directo: la ruta se guarda junto con
// la asignación de sus envíos en statusMachine (P1, C4 y C5). Los listen* devuelven la función para cancelar.
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { MAX_ATTEMPTS, ROUTE_STATUS, STATUS, UNASSIGNED_REASON } from '../../constants';
import { combine } from '../../lib/combine';
import { blocksZoneOn } from '../../lib/routeDay';
import { toStoredGeometry } from '../../lib/geometry';
import { db } from '../../lib/firebase';
import { ROUTING } from '../../config/routing';
import { hasTrustedLocation, isPlannable, optimizeDay, optimizeRoute } from '../../optimizer';
import { getDepot, listenDrivers, listenZones } from '../catalog/catalogService';
import { assignToRoute, changeStatusMany, replanRoutes } from '../shipments/statusMachine';
import { getShipment, getRouteShipments, getShipmentsOfDay } from '../shipments/shipmentsService';

const CLOSED = [STATUS.ENTREGADO, STATUS.NO_ENTREGADO, STATUS.DEVUELTO];
export const READ_ERROR = 'No se pudo leer la ruta. Revise la conexión e intente de nuevo.';
export const READ_TIMEOUT_MS = 15000;

// C18: como los listen* de P1, onError (opcional) recibe un Error con mensaje listo para mostrar
const readError = (where_, onError) => (err) => {
  console.error(`[routes] ${where_}:`, err);
  onError?.(new Error(READ_ERROR));
};

/** Una lectura del servidor con el mismo mensaje de error que los listen* (C18). */
const readOrFail = (promise) =>
  promise.catch((err) => {
    console.error('[routes] lectura:', err);
    throw new Error(READ_ERROR);
  });

/**
 * Primer valor de un listen* y cancela; así se lee una vez con las mismas funciones del contrato.
 * Rechaza con el error del listen* (C18) o, si no llega nada en 15 s, con READ_ERROR:
 * "Generar ruta óptima" nunca se queda en "Calculando…".
 */
function once(subscribe) {
  return new Promise((resolve, reject) => {
    let cancel = null,
      done = false;
    const finish = (fn, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      fn(value);
      cancel?.();
    };
    const timer = setTimeout(() => finish(reject, new Error(READ_ERROR)), READ_TIMEOUT_MS);
    cancel = subscribe(
      (value) => finish(resolve, value),
      (err) => finish(reject, err instanceof Error ? err : new Error(READ_ERROR)),
    );
    if (done) cancel?.(); // por si el primer valor llegó antes de tener la función para cancelar
  });
}

/** "Ruta A", "Ruta B"… en orden de creación del día (después de la Z: "Ruta 27"). */
export const routeCode = (index) => `Ruta ${index < 26 ? String.fromCharCode(65 + index) : index + 1}`;

/**
 * Siguiente letra libre entre las rutas que se ven en la fecha, incluidas las que vienen de días
 * anteriores (N37): así el 30 oct no hay dos "Ruta A" (la nueva y la que sigue abierta del 29).
 */
export function freeRouteCode(routes) {
  const used = new Set(routes.map((r) => r.code));
  let i = 0;
  while (used.has(routeCode(i))) i++;
  return routeCode(i);
}

/** R-{date}-{zoneId}; si ya existe, -2, -3… */
export function nextRouteId({ date, zoneId }, existingIds) {
  const base = `R-${date}-${zoneId}`;
  if (!existingIds.has(base)) return base;
  let n = 2;
  while (existingIds.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/**
 * Una ruta está abierta si alguna de sus paradas sigue en ella sin cerrar.
 * Un envío que ya pasó a otra ruta (reintento) no la mantiene abierta.
 */
export function isRouteOpen(route, shipmentsById) {
  return route.stops.some((st) => {
    const s = shipmentsById[st.shipmentId];
    return s && s.routeId === route.id && !CLOSED.includes(s.status);
  });
}

/**
 * Una ruta por id (ej. "R-2026-10-12-Z2").
 * @param {string} routeId
 * @param {(route: object|null) => void} cb  null si no existe
 * @param {(err: Error) => void} [onError]  mensaje listo para mostrar (C18)
 * @returns {() => void} cancelar
 */
export function listenRoute(routeId, cb, onError) {
  return onSnapshot(
    doc(db, 'routes', routeId),
    (snap) => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    readError('listenRoute', onError),
  );
}

const OPEN_ROUTE_STATUSES = [ROUTE_STATUS.ASIGNADA, ROUTE_STATUS.EN_CURSO];
const ON_ROUTE = [STATUS.ASIGNADO, STATUS.EN_RUTA];

/**
 * Rutas de la fecha más las de días anteriores con paradas todavía en ruta
 * (asignado o en_ruta): una ruta sin terminar no desaparece al cambiar de día.
 */
export function withCarriedRoutes(routes, shipments, date) {
  const busy = new Set(shipments.filter((s) => ON_ROUTE.includes(s.status)).map((s) => s.routeId));
  return routes.filter((r) => r.date === date || (r.date < date && busy.has(r.id)));
}

/**
 * Todas las rutas de una fecha y las de días anteriores sin terminar
 * (Centro de despacho: nombre de ruta en cada tarjeta).
 * @param {{ date: string }} filters
 * @param {(routes: object[]) => void} cb  ordenadas por zona
 * @param {(err: Error) => void} [onError]  mensaje listo para mostrar (C18)
 * @returns {() => void} cancelar
 */
export function listenRoutes({ date }, cb, onError) {
  const byZone = (a, b) => a.zoneId.localeCompare(b.zoneId) || a.id.localeCompare(b.id);
  const merge = (routes, shipments) => withCarriedRoutes(routes, shipments, date).sort(byZone);
  const onErr = readError('listenRoutes', onError);
  const toDocs = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return combine(
    [
      (next) => onSnapshot(query(collection(db, 'routes'), where('date', '==', date)), (s) => next(toDocs(s)), onErr),
      (next) =>
        onSnapshot(
          query(collection(db, 'routes'), where('status', 'in', OPEN_ROUTE_STATUSES)),
          (s) => next(toDocs(s)),
          onErr,
        ),
      (next) =>
        onSnapshot(query(collection(db, 'shipments'), where('status', 'in', ON_ROUTE)), (s) => next(toDocs(s)), onErr),
    ],
    (ofDate, open, shipments) => {
      const byId = new Map([...ofDate, ...open].map((r) => [r.id, r]));
      return merge([...byId.values()], shipments);
    },
    cb,
  );
}

/**
 * Las mismas rutas que listenRoutes, leídas del servidor de una vez (el primer aviso de un listener puede
 * venir de la caché local con solo una parte): las que se reemplazan y sus letras salen de aquí.
 * @param {string} date
 * @returns {Promise<object[]>}
 */
export async function getRoutesOfDay(date) {
  const byZone = (a, b) => a.zoneId.localeCompare(b.zoneId) || a.id.localeCompare(b.id);
  const toDocs = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const [ofDate, open, onRoute] = await Promise.all([
    getDocs(query(collection(db, 'routes'), where('date', '==', date))),
    getDocs(query(collection(db, 'routes'), where('status', 'in', OPEN_ROUTE_STATUSES))),
    getDocs(query(collection(db, 'shipments'), where('status', 'in', ON_ROUTE))),
  ]);
  const byId = new Map([...toDocs(ofDate), ...toDocs(open)].map((r) => [r.id, r]));
  return withCarriedRoutes([...byId.values()], toDocs(onRoute), date).sort(byZone);
}

/**
 * La ruta de un motorista en una fecha (un motorista por zona → una ruta abierta por día).
 * Si tiene varias (la anterior ya cerrada), entrega la más reciente. Si no tiene ruta en la
 * fecha pero le quedó una sin terminar de un día anterior, entrega esa.
 * @param {{ driverId: string, date: string }} filters
 * @param {(route: object|null) => void} cb  null si el motorista no tiene ruta en esa fecha
 * @param {(err: Error) => void} [onError]  mensaje listo para mostrar (C18)
 * @returns {() => void} cancelar
 */
export function listenDriverRoute({ driverId, date }, cb, onError) {
  // createdAt es Timestamp de Firestore (o ISO en una ruta vieja)
  const ms = (v) => (typeof v?.toMillis === 'function' ? v.toMillis() : Date.parse(v) || 0);
  const latest = (list) => list.sort((a, b) => ms(b.createdAt) - ms(a.createdAt))[0] ?? null;
  return listenRoutes(
    { date },
    (routes) => {
      const mine = routes.filter((r) => r.driverId === driverId);
      cb(latest(mine.filter((r) => r.date === date)) ?? latest(mine));
    },
    onError,
  );
}

// ---------- Guardar planes del optimizador ----------

/** Firestore no acepta listas dentro de listas (C32): la línea se guarda como [{ lat, lng }], recortada a 1 500 puntos. */
export const geometryToDoc = (g) => toStoredGeometry(g);
/** Línea de la ruta para DispatchMap ([[lat, lng]]); vive en dispatchMath (cálculo puro). */
export { routeGeometry } from '../dispatch/dispatchMath';

/** Paradas del plan en la forma de routes.stops (seq/etaMin de siempre + etaISO y serviceMin). */
export const planStops = (plan) =>
  plan.stops.map((st) => ({
    shipmentId: st.shipmentId,
    seq: st.stopSequence,
    etaMin: st.etaMin,
    etaISO: st.etaISO,
    serviceMin: st.serviceMin,
    kmFromPrev: st.kmFromPrev ?? 0,
  }));

/** Documento de la ruta a partir de un RoutePlan (campos del Sprint 1 + motor, vehículo y línea por calles). */
export function routeDocFromPlan(plan, { code, date }) {
  return {
    code,
    date,
    zoneId: plan.zoneId,
    driverId: plan.driverId,
    status: ROUTE_STATUS.ASIGNADA,
    engine: plan.engine,
    stops: planStops(plan),
    totalKm: plan.km,
    baselineKm: plan.baselineKm,
    minutes: plan.minutes,
    estEnd: plan.endISO,
    geometry: geometryToDoc(plan.geometry),
  };
}

/** La ruta ya salió: está en curso o alguna de sus paradas va en ruta. */
export function isRouteStarted(route, shipmentsById) {
  if (route.status === ROUTE_STATUS.EN_CURSO) return true;
  return route.stops.some((st) => {
    const s = shipmentsById[st.shipmentId];
    return s?.routeId === route.id && s.status === STATUS.EN_RUTA;
  });
}

/** Lee una vez lo que necesita el optimizador para una fecha (y, si se pide, solo una zona). */
async function readDay(date, zoneId) {
  const [zones, drivers, shipments, routes, depot] = await Promise.all([
    once((cb, onErr) => listenZones(cb, onErr)),
    once((cb, onErr) => listenDrivers(cb, onErr)),
    readOrFail(getShipmentsOfDay({ date, zoneId })),
    readOrFail(getRoutesOfDay(date)),
    getDepot().catch(() => null), // sin depósito se avisa con su propio mensaje
  ]);
  if (!depot) throw new Error('Falta el depósito de salida');
  return { zones, drivers, shipments, routes, depot };
}

/**
 * Generar ruta óptima de UNA zona ("Generar ruta de esta zona" del despacho), con Geoapify.
 * Guarda routes/{id} y pasa los envíos a asignado con assignToRoute (P1); lo que no cabe queda
 * pendiente con su unassignedReason, en la misma escritura (C30).
 * @param {{ zoneId: string, date: string }} args
 * @returns {Promise<{ routeId: string, skipped: Array<{ shipmentId, reason }>, engine: string,
 *   warning: string|null }>} skipped: pedidos que no entraron, con su motivo (C20)
 */
export async function createRoute({ zoneId, date }) {
  const { zones, drivers, shipments, routes, depot } = await readDay(date, zoneId);

  const zone = zones.find((z) => z.id === zoneId);
  if (!zone) throw new Error(`No existe la zona ${zoneId}`);
  const driver = drivers.find((d) => d.id === zone.driverId) ?? drivers.find((d) => d.zoneId === zoneId);
  if (!zone.driverId || !driver) throw new Error(`La zona ${zone.name} no tiene motorista`);
  if (driver.active === false) throw new Error(`${driver.name ?? driver.id} está de baja: no se puede generar su ruta`);

  const shipmentsById = Object.fromEntries(shipments.map((s) => [s.id, s]));
  // Bloquea una ruta abierta de este día, o una ya iniciada de un día anterior (no la de otro día sin salir)
  if (
    routes.some(
      (r) =>
        r.zoneId === zoneId &&
        isRouteOpen(r, shipmentsById) &&
        (r.date === date || (isRouteStarted(r, shipmentsById) && blocksZoneOn(r, date))),
    )
  )
    throw new Error('La zona ya tiene una ruta abierta hoy');

  const candidates = shipments.filter(isPlannable);
  if (!candidates.length) throw new Error('No hay envíos pendientes en esta zona');

  const plan = await optimizeRoute({ shipments: candidates, driver, depot, date, zoneId });
  if (!plan.stops.length) {
    await assignToRoute({ routeId: null, stops: [], unassigned: plan.unassigned });
    throw new Error(`Ningún pedido de la ${zone.name} entra en el turno de ${driver.name ?? driver.id}`);
  }

  const routeId = nextRouteId({ date, zoneId }, new Set(routes.map((r) => r.id)));
  const route = routeDocFromPlan(plan, { code: freeRouteCode(routes), date });
  // Ruta, asignación y motivos de lo que no cupo en una sola escritura: si algo falla no se guarda nada.
  // El error de statusMachine sale tal cual (mensaje listo para mostrar).
  await assignToRoute({ routeId, stops: route.stops, driverId: driver.id, route, unassigned: plan.unassigned });
  return { routeId, skipped: plan.unassigned, engine: plan.engine, warning: plan.warning };
}

/**
 * Guarda el plan del día (Optimizar día, S4-07): una ruta por zona, con N3/N4.
 * - Zona sin ruta abierta (o con la anterior cerrada): crea R-{fecha}-{zona} (o -2, -3…) con assignToRoute.
 * - Zona con ruta que todavía no sale ('asignada'): la reemplaza con replanRoutes (C33), conservando su
 *   id y su letra; lo que ya no entra vuelve a pendiente con su motivo.
 * - Zona con ruta ya iniciada: se salta y se avisa.
 * Cada zona se guarda en una sola escritura: ruta + estados + unassignedReason (C30, C33).
 * @param {string} date
 * @param {{ plans: object[], unassigned: Array<{ shipmentId, reason }> }} dayPlan  lo que devuelve optimizeDay
 * @returns {Promise<{ routeIds: string[], replaced: string[], warnings: string[], unassigned: number }>}
 *   unassigned: cuántos pedidos quedaron escritos con motivo (no cuenta los de zonas saltadas)
 */
export async function createRoutesForDay(date, dayPlan) {
  const [zones, shipments, routes] = await Promise.all([
    once((cb, onErr) => listenZones(cb, onErr)),
    readOrFail(getShipmentsOfDay({ date })),
    readOrFail(getRoutesOfDay(date)),
  ]);
  const shipmentsById = Object.fromEntries(shipments.map((s) => [s.id, s]));
  const zoneName = (id) => zones.find((z) => z.id === id)?.name ?? `zona ${id}`;
  const ids = new Set(routes.map((r) => r.id));
  const shown = [...routes]; // las de la fecha y las abiertas de días anteriores: sus letras ya están usadas
  const routeIds = [];
  const replaced = [];
  const warnings = [];
  const skippedZones = new Set();
  // Un pedido puede pasar a la ruta de otra zona (spillOverflow): esa ruta no lo suelta al reescribirse
  const planned = new Set(dayPlan.plans.flatMap((p) => p.stops.map((st) => st.shipmentId)));
  let written = 0;

  for (const plan of dayPlan.plans) {
    // Una ruta ya iniciada (de este día o de uno anterior) bloquea la zona; solo se reemplaza la ruta
    // sin salir de ESTE día: las de otros días no se tocan (antes se reescribía la del día anterior)
    // La ruta del motorista (optimización conjunta: un motorista puede llevar pedidos de varias zonas, y
    // dos motoristas pueden tener la misma zona); sin motorista en el plan, la de la zona como antes
    const mine = (r) => (plan.driverId ? r.driverId === plan.driverId : r.zoneId === plan.zoneId);
    const open = routes.filter((r) => mine(r) && isRouteOpen(r, shipmentsById));
    const started = open.find((r) => isRouteStarted(r, shipmentsById) && blocksZoneOn(r, date));
    if (started) {
      skippedZones.add(plan.zoneId);
      warnings.push(`${zoneName(plan.zoneId)} ya salió con la ${started.code}; no se cambió.`);
      continue;
    }
    const current = open.find((r) => r.date === date) ?? null;
    if (!plan.stops.length) {
      // Sin paradas ahora: su ruta sin salir se vacía en la limpieza de abajo (antes quedaba con paradas
      // que ya llevan otras rutas)
      if (current) {
        if (plan.unassigned.length) await assignToRoute({ routeId: null, stops: [], unassigned: plan.unassigned });
        written += plan.unassigned.length;
        continue;
      }
      if (plan.unassigned.length) await assignToRoute({ routeId: null, stops: [], unassigned: plan.unassigned });
      written += plan.unassigned.length;
      warnings.push(`Ningún pedido de la ${zoneName(plan.zoneId)} entra en el turno de su motorista.`);
      continue;
    }

    if (current) {
      // Reemplazo de una ruta que no ha salido: misma id y misma letra
      const route = routeDocFromPlan(plan, { code: current.code, date: current.date });
      const kept = new Set(route.stops.map((st) => st.shipmentId));
      const released = current.stops
        .map((st) => st.shipmentId)
        .filter(
          (id) =>
            !kept.has(id) &&
            !planned.has(id) &&
            shipmentsById[id]?.routeId === current.id &&
            shipmentsById[id]?.status === STATUS.ASIGNADO,
        );
      await replanRoutes({
        routes: [{ routeId: current.id, route, stops: route.stops }],
        released,
        unassigned: plan.unassigned,
        driverId: plan.driverId,
      });
      routeIds.push(current.id);
      replaced.push(current.id);
      written += plan.unassigned.length;
      continue;
    }

    const routeId = nextRouteId({ date, zoneId: plan.zoneId }, ids);
    ids.add(routeId);
    const route = routeDocFromPlan(plan, { code: freeRouteCode(shown), date });
    shown.push(route);
    // Si trae un pedido que ya estaba en otra ruta (pasó de zona), se guarda como reemplazo
    const fromOther = route.stops.some((st) => shipmentsById[st.shipmentId]?.status === STATUS.ASIGNADO);
    if (fromOther)
      await replanRoutes({
        routes: [{ routeId, route, stops: route.stops }],
        unassigned: plan.unassigned,
        driverId: plan.driverId,
      });
    else
      await assignToRoute({ routeId, stops: route.stops, driverId: plan.driverId, route, unassigned: plan.unassigned });
    routeIds.push(routeId);
    written += plan.unassigned.length;
  }

  // Limpieza: una ruta de ESTE día que no ha salido y no se reescribió (su motorista no recibió paradas,
  // está ausente o su vehículo en taller) queda vacía; lo suyo que nadie tomó vuelve a pendiente con motivo
  const reasonOf = new Map(dayPlan.unassigned.map((u) => [u.shipmentId, u.reason]));
  const handled = new Set(routeIds);
  const cleaned = new Set();
  for (const r of routes) {
    if (r.date !== date || r.status !== ROUTE_STATUS.ASIGNADA || handled.has(r.id) || !(r.stops ?? []).length) continue;
    if (dayPlan.failedZones?.includes(r.zoneId)) continue; // Geoapify no respondió: su ruta se queda como estaba
    if (isRouteStarted(r, shipmentsById)) continue;
    const released = r.stops
      .map((st) => st.shipmentId)
      .filter(
        (id) =>
          !planned.has(id) && shipmentsById[id]?.routeId === r.id && shipmentsById[id]?.status === STATUS.ASIGNADO,
      );
    const empty = { stops: [], totalKm: 0, baselineKm: 0, minutes: 0, estEnd: null, geometry: null };
    await replanRoutes({
      routes: [{ routeId: r.id, route: empty, stops: [] }],
      released,
      unassigned: released.map((id) => ({ shipmentId: id, reason: reasonOf.get(id) ?? UNASSIGNED_REASON.CAPACIDAD })),
      driverId: r.driverId,
    });
    released.forEach((id) => cleaned.add(id));
    written += released.length;
    warnings.push(`La ${r.code} quedó sin paradas: sus pedidos los llevan otras rutas o no caben.`);
  }

  // Lo que no llegó a ninguna zona (sin ubicación confiable o fuera de zona) también lleva su motivo
  const inPlans = new Set(dayPlan.plans.flatMap((p) => p.unassigned.map((u) => u.shipmentId)));
  const loose = dayPlan.unassigned.filter(
    (u) =>
      !inPlans.has(u.shipmentId) &&
      !cleaned.has(u.shipmentId) &&
      shipmentsById[u.shipmentId] &&
      shipmentsById[u.shipmentId].status !== STATUS.ASIGNADO &&
      !skippedZones.has(shipmentsById[u.shipmentId].zoneId),
  );
  if (loose.length) await assignToRoute({ routeId: null, stops: [], unassigned: loose });
  written += loose.length;

  return { routeIds, replaced, warnings, unassigned: written };
}

/**
 * "Optimizar día" de punta a punta (botón del despacho): lee la fecha, pide a Geoapify una ruta por zona
 * y la guarda con createRoutesForDay. Las rutas de ese día que no han salido se rehacen.
 * @param {string} date
 * @returns {Promise<{ routeIds: string[], replaced: string[], warnings: string[], engine: string, unassigned: number }>}
 */
export async function optimizeAndSaveDay(date) {
  const { zones, drivers, shipments, routes, depot } = await readDay(date);
  const day = await optimizeDay({ date, shipments, drivers, depot, zones, routes });
  const saved = await createRoutesForDay(date, day);
  return {
    routeIds: saved.routeIds,
    replaced: saved.replaced,
    warnings: [...day.warnings, ...saved.warnings],
    engine: day.engine,
    unassigned: saved.unassigned,
  };
}

// ---------- Mover una parada (S4-08) ----------

/** Una ruta leída del servidor (no la primera respuesta de un listener, que puede venir de la caché). */
async function readRoute(id) {
  const snap = await getDoc(doc(db, 'routes', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

const REASON_TEXT = {
  capacidad: 'la ruta ya lleva el máximo de paradas',
  ventana: 'no alcanza su horario o el turno del motorista',
  sin_ubicacion: 'no tiene ubicación confirmada',
};

/**
 * Pasa una parada (o un pedido sin asignar) a otra ruta y reoptimiza SOLO las rutas tocadas
 * (S4-08): la de destino con el pedido, y la de origen sin él. Las demás no cambian.
 * No procede si la ruta destino (o la de origen) ya inició, ni si Geoapify no lo puede meter (máximo de
 * paradas u horario): en ese caso lanza un Error con el motivo, listo para mostrar.
 * Todo se guarda en una escritura con replanRoutes (C33).
 * @param {string} shipmentId
 * @param {string} toRouteId
 * @returns {Promise<{ routeIds: string[], warnings: string[], dropped: Array<{ shipmentId, reason }> }>}
 */
export async function moveStop(shipmentId, toRouteId) {
  const [drivers, depot, shipment, toRoute] = await Promise.all([
    once((cb, onErr) => listenDrivers(cb, onErr)),
    getDepot().catch(() => null),
    getShipment(shipmentId),
    readRoute(toRouteId), // del servidor: un listener puede responder primero con la caché
  ]);
  if (!depot) throw new Error('Falta el depósito de salida');
  if (!shipment) throw new Error(`No existe el envío ${shipmentId}`);
  if (!toRoute) throw new Error(`No existe la ruta ${toRouteId}`);
  if (shipment.routeId === toRouteId) throw new Error(`${shipment.code} ya está en la ${toRoute.code}`);
  const movable =
    shipment.status === STATUS.ASIGNADO ||
    shipment.status === STATUS.PENDIENTE ||
    (shipment.status === STATUS.NO_ENTREGADO && shipment.attempts < MAX_ATTEMPTS);
  if (!movable) throw new Error(`${shipment.code} no se puede mover: está ${shipment.status.replace('_', ' ')}`);
  if (!hasTrustedLocation(shipment))
    throw new Error(`${shipment.code} no tiene ubicación confirmada: revísela primero`);

  const fromRoute = shipment.status === STATUS.ASIGNADO && shipment.routeId ? await readRoute(shipment.routeId) : null;
  const [toList, fromList] = await Promise.all([
    getRouteShipments(toRouteId),
    fromRoute ? getRouteShipments(fromRoute.id) : Promise.resolve([]),
  ]);
  const byId = Object.fromEntries([...toList, ...fromList].map((s) => [s.id, s]));
  for (const r of [toRoute, fromRoute].filter(Boolean)) {
    if (r.status !== ROUTE_STATUS.ASIGNADA || isRouteStarted(r, byId))
      throw new Error(`La ${r.code} ya inició: no se le pueden mover paradas`);
  }

  const driverOf = (r) => drivers.find((d) => d.id === r.driverId) ?? null;
  const onTo = toList.filter((s) => s.routeId === toRouteId && s.id !== shipment.id);
  if (onTo.length >= ROUTING.maxStops)
    throw new Error(`${shipment.code} no entra en la ${toRoute.code}: ${REASON_TEXT.capacidad}`);
  const plan = (r, list) =>
    optimizeRoute({ shipments: list, driver: driverOf(r), depot, date: r.date, zoneId: r.zoneId });
  const [toPlan, fromPlan] = await Promise.all([
    plan(toRoute, [...onTo, shipment]),
    fromRoute
      ? plan(
          fromRoute,
          fromList.filter((s) => s.routeId === fromRoute.id && s.id !== shipment.id),
        )
      : null,
  ]);
  if (!toPlan.stops.some((st) => st.shipmentId === shipment.id)) {
    const why = toPlan.unassigned.find((u) => u.shipmentId === shipment.id)?.reason;
    throw new Error(
      `${shipment.code} no entra en la ${toRoute.code}: ${REASON_TEXT[why] ?? 'el optimizador lo dejó fuera'}`,
    );
  }

  const routesToSave = [{ r: toRoute, p: toPlan }, ...(fromRoute ? [{ r: fromRoute, p: fromPlan }] : [])];
  // Una ruta de origen que queda sin paradas no se guarda vacía: sus envíos ya salieron de ella
  const saveable = routesToSave.filter(({ p }) => p.stops.length);
  const docs = saveable.map(({ r, p }) => {
    const route = routeDocFromPlan(p, { code: r.code, date: r.date });
    return { routeId: r.id, route, stops: route.stops };
  });
  // Lo que el reoptimizado ya no pudo meter vuelve a pendiente con su motivo
  const placed = new Set(docs.flatMap((d) => d.stops.map((st) => st.shipmentId)));
  const dropped = routesToSave.flatMap(({ p }) => p.unassigned).filter((u) => !placed.has(u.shipmentId));
  // Los que estaban en una de las rutas tocadas y ya no están en ninguna vuelven a pendiente (sin huérfanos)
  const touched = new Set(routesToSave.map(({ r }) => r.id));
  const released = Object.values(byId)
    .filter((s) => touched.has(s.routeId) && s.status === STATUS.ASIGNADO && !placed.has(s.id) && s.id !== shipment.id)
    .map((s) => s.id);
  for (const id of released)
    if (!dropped.some((u) => u.shipmentId === id))
      dropped.push({ shipmentId: id, reason: UNASSIGNED_REASON.CAPACIDAD });

  await replanRoutes({ routes: docs, released, unassigned: dropped, driverId: toRoute.driverId });
  const warnings = [...new Set(routesToSave.map(({ p }) => p.warning).filter(Boolean))];
  if (fromRoute && !fromPlan.stops.length) warnings.push(`La ${fromRoute.code} quedó sin paradas.`);
  return { routeIds: docs.map((d) => d.routeId), warnings, dropped };
}

/**
 * Iniciar ruta (Vista motorista): todas sus paradas pasan a en_ruta y la ruta a en_curso.
 * @param {string} routeId
 * @param {string} driverId
 * @returns {Promise<{ count: number }>} paradas que salieron
 */
export async function startRoute(routeId, driverId) {
  const route = await once((cb, onErr) => listenRoute(routeId, cb, onErr));
  if (!route) throw new Error(`No existe la ruta ${routeId}`);
  if (route.status === ROUTE_STATUS.EN_CURSO) throw new Error(`La ${route.code} ya está en curso`);

  // Paradas a en_ruta y ruta a en_curso en la misma escritura
  return changeStatusMany({
    shipmentIds: route.stops.map((st) => st.shipmentId),
    to: STATUS.EN_RUTA,
    driverId,
    routeStatus: { routeId, status: ROUTE_STATUS.EN_CURSO },
  });
}
