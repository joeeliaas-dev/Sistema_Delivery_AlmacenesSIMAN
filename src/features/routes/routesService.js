// src/features/routes/routesService.js  (dueño: P2)
// Rutas del día: lecturas (listen*) y startRoute (Iniciar ruta). Las rutas llegan ya asignadas.
// No escribe directo: el cambio de estado va por statusMachine (P1, C4 y C5). Los listen* devuelven la función para cancelar.
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { ROUTE_STATUS, STATUS } from '../../constants';
import { combine } from '../../lib/combine';
import { USE_MOCKS, db } from '../../lib/firebase';
import { mockDb } from '../../mocks';
import { changeStatusMany } from '../shipments/statusMachine';

const CLOSED = [STATUS.ENTREGADO, STATUS.NO_ENTREGADO, STATUS.DEVUELTO];
export const READ_ERROR = 'No se pudo leer la ruta. Revise la conexión e intente de nuevo.';
export const READ_TIMEOUT_MS = 15000;

// C18: como los listen* de P1, onError (opcional) recibe un Error con mensaje listo para mostrar
const readError = (where_, onError) => (err) => {
  console.error(`[routes] ${where_}:`, err);
  onError?.(new Error(READ_ERROR));
};

/**
 * Primer valor de un listen* y cancela; así se lee una vez con las mismas funciones del contrato.
 * Rechaza con el error del listen* (C18) o, si no llega nada en 15 s, con READ_ERROR:
 * "Iniciar ruta" nunca se queda esperando.
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
  if (USE_MOCKS) return mockDb.listen('routes', (docs) => docs.find((r) => r.id === routeId) ?? null, cb);
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
  if (USE_MOCKS)
    return combine(
      [
        (next) => mockDb.listen('routes', (docs) => docs, next),
        (next) => mockDb.listen('shipments', (docs) => docs, next),
      ],
      merge,
      cb,
    );
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
 * La ruta de un motorista en una fecha (un motorista por zona → una ruta abierta por día).
 * Si tiene varias (la anterior ya cerrada), entrega la más reciente. Si no tiene ruta en la
 * fecha pero le quedó una sin terminar de un día anterior, entrega esa.
 * @param {{ driverId: string, date: string }} filters
 * @param {(route: object|null) => void} cb  null si el motorista no tiene ruta en esa fecha
 * @param {(err: Error) => void} [onError]  mensaje listo para mostrar (C18)
 * @returns {() => void} cancelar
 */
export function listenDriverRoute({ driverId, date }, cb, onError) {
  // createdAt es ISO en mocks y Timestamp en Firestore
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
