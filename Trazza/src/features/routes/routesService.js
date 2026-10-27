import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { ROUTE_STATUS, STATUS } from '../../constants';
import { combine } from '../../lib/combine';
import { USE_MOCKS, db } from '../../lib/firebase';
import { mockDb } from '../../mocks';
import { optimizeRoute } from '../../optimizer';
import { getDepot, listenZones } from '../catalog/catalogService';
import { isRoutable } from '../dispatch/dispatchMath';
import { assignToRoute, changeStatusMany } from '../shipments/statusMachine';
import { listenShipments } from '../shipments/shipmentsService';
const CLOSED = [STATUS.ENTREGADO, STATUS.NO_ENTREGADO, STATUS.DEVUELTO];
export const READ_ERROR = 'No se pudo leer la ruta. Revise la conexión e intente de nuevo.';
export const READ_TIMEOUT_MS = 15000;
const readError = (where_, onError) => (err) => {
  console.error(`[routes] ${where_}:`, err);
  onError?.(new Error(READ_ERROR));
};
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
    if (done) cancel?.();
  });
}
export function routeStartAt(date, now = new Date()) {
  const [y, m, d] = date.split('-').map(Number);
  const at = (h) => new Date(y, m - 1, d, h, 0, 0, 0);
  return now >= at(7) && now <= at(18) ? now : at(8);
}
export const routeCode = (index) => `Ruta ${index < 26 ? String.fromCharCode(65 + index) : index + 1}`;
export function nextRouteId({ date, zoneId }, existingIds) {
  const base = `R-${date}-${zoneId}`;
  if (!existingIds.has(base)) return base;
  let n = 2;
  while (existingIds.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
export function isRouteOpen(route, shipmentsById) {
  return route.stops.some((st) => {
    const s = shipmentsById[st.shipmentId];
    return s && s.routeId === route.id && !CLOSED.includes(s.status);
  });
}
export function listenRoute(routeId, cb, onError) {
  if (USE_MOCKS) return mockDb.listen('routes', (docs) => docs.find((r) => r.id === routeId) ?? null, cb);
  return onSnapshot(
    doc(db, 'routes', routeId),
    (snap) =>
      cb(
        snap.exists()
          ? {
              id: snap.id,
              ...snap.data(),
            }
          : null,
      ),
    readError('listenRoute', onError),
  );
}
const OPEN_ROUTE_STATUSES = [ROUTE_STATUS.ASIGNADA, ROUTE_STATUS.EN_CURSO];
const ON_ROUTE = [STATUS.ASIGNADO, STATUS.EN_RUTA];
export function withCarriedRoutes(routes, shipments, date) {
  const busy = new Set(shipments.filter((s) => ON_ROUTE.includes(s.status)).map((s) => s.routeId));
  return routes.filter((r) => r.date === date || (r.date < date && busy.has(r.id)));
}
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
  const toDocs = (snap) =>
    snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));
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
export function listenDriverRoute({ driverId, date }, cb, onError) {
  const ms = (v) => (typeof v?.toMillis === 'function' ? v.toMillis() : Date.parse(v) || 0);
  const latest = (list) => list.sort((a, b) => ms(b.createdAt) - ms(a.createdAt))[0] ?? null;
  return listenRoutes(
    {
      date,
    },
    (routes) => {
      const mine = routes.filter((r) => r.driverId === driverId);
      cb(latest(mine.filter((r) => r.date === date)) ?? latest(mine));
    },
    onError,
  );
}
export async function createRoute({ zoneId, date }) {
  const [zones, zoneShipments, routes, depot] = await Promise.all([
    once((cb, onErr) => listenZones(cb, onErr)),
    once((cb, onErr) =>
      listenShipments(
        {
          date,
          zoneId,
        },
        cb,
        onErr,
      ),
    ),
    once((cb, onErr) =>
      listenRoutes(
        {
          date,
        },
        cb,
        onErr,
      ),
    ),
    getDepot().catch(() => null),
  ]);
  const zone = zones.find((z) => z.id === zoneId);
  if (!zone) throw new Error(`No existe la zona ${zoneId}`);
  if (!zone.driverId) throw new Error(`La zona ${zone.name} no tiene motorista`);
  if (!depot) throw new Error('Falta el depósito de salida');
  const shipmentsById = Object.fromEntries(zoneShipments.map((s) => [s.id, s]));
  if (routes.some((r) => r.zoneId === zoneId && isRouteOpen(r, shipmentsById)))
    throw new Error('La zona ya tiene una ruta abierta hoy');
  const candidates = zoneShipments.filter(isRoutable);
  if (!candidates.length) throw new Error('No hay envíos pendientes en esta zona');
  const plan = optimizeRoute({
    depot,
    stops: candidates,
    options: {
      startAt: routeStartAt(date),
    },
  });
  const routeId = nextRouteId(
    {
      date,
      zoneId,
    },
    new Set(routes.map((r) => r.id)),
  );
  const route = {
    code: routeCode(routes.filter((r) => r.date === date).length),
    date,
    zoneId,
    driverId: zone.driverId,
    status: ROUTE_STATUS.ASIGNADA,
    stops: plan.legs,
    totalKm: plan.totalKm,
    baselineKm: plan.baselineKm,
    estEnd: plan.estEnd,
  };
  await assignToRoute({
    routeId,
    stops: plan.legs,
    driverId: zone.driverId,
    route,
  });
  return {
    routeId,
    skipped: plan.skipped,
  };
}
export async function startRoute(routeId, driverId) {
  const route = await once((cb, onErr) => listenRoute(routeId, cb, onErr));
  if (!route) throw new Error(`No existe la ruta ${routeId}`);
  if (route.status === ROUTE_STATUS.EN_CURSO) throw new Error(`La ${route.code} ya está en curso`);
  return changeStatusMany({
    shipmentIds: route.stops.map((st) => st.shipmentId),
    to: STATUS.EN_RUTA,
    driverId,
    routeStatus: {
      routeId,
      status: ROUTE_STATUS.EN_CURSO,
    },
  });
}
