import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { STATUS } from '../../constants';
import { combine } from '../../lib/combine';
import { USE_MOCKS, db } from '../../lib/firebase';
import { mockDb } from '../../mocks';
const toDocs = (snap) =>
  snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));
const byTime = (a, b) =>
  a.scheduledDate.localeCompare(b.scheduledDate) ||
  a.scheduledTime.localeCompare(b.scheduledTime) ||
  a.code.localeCompare(b.code);
export const OPEN_STATUSES = [STATUS.PENDIENTE, STATUS.ASIGNADO, STATUS.EN_RUTA, STATUS.NO_ENTREGADO];
export const isCarriedOver = (s, date) => s.scheduledDate < date && OPEN_STATUSES.includes(s.status);
const bySeq = (a, b) => (a.stopSequence ?? 0) - (b.stopSequence ?? 0);
const readError = (where_, onError) => (err) => {
  console.error(`[shipments] ${where_}:`, err);
  onError?.(new Error('No se pudieron leer los envíos. Revise la conexión e intente de nuevo.'));
};
export function listenShipments({ date, zoneId, priority, statuses }, cb, onError) {
  const match = (s) =>
    (s.scheduledDate === date || isCarriedOver(s, date)) &&
    (!zoneId || s.zoneId === zoneId) &&
    (!priority || s.priority === priority) &&
    (!statuses?.length || statuses.includes(s.status));
  if (USE_MOCKS) return mockDb.listen('shipments', (docs) => docs.filter(match).sort(byTime), cb);
  const clauses = [where('scheduledDate', '==', date)];
  if (zoneId) clauses.push(where('zoneId', '==', zoneId));
  if (statuses?.length) clauses.push(where('status', 'in', statuses));
  const onErr = readError('listenShipments', onError);
  return combine(
    [
      (next) => onSnapshot(query(collection(db, 'shipments'), ...clauses), (snap) => next(toDocs(snap)), onErr),
      (next) =>
        onSnapshot(
          query(collection(db, 'shipments'), where('status', 'in', OPEN_STATUSES)),
          (snap) => next(toDocs(snap)),
          onErr,
        ),
    ],
    (ofDate, open) => {
      const byId = new Map([...ofDate, ...open].map((s) => [s.id, s]));
      return [...byId.values()].filter(match).sort(byTime);
    },
    cb,
  );
}
export function listenRouteShipments(routeId, cb, onError) {
  if (USE_MOCKS) return mockDb.listen('shipments', (docs) => docs.filter((s) => s.routeId === routeId).sort(bySeq), cb);
  return onSnapshot(
    query(collection(db, 'shipments'), where('routeId', '==', routeId)),
    (snap) => cb(toDocs(snap).sort(bySeq)),
    readError('listenRouteShipments', onError),
  );
}
export async function getShipment(id) {
  if (USE_MOCKS) return mockDb.get('shipments', id);
  const snap = await getDoc(doc(db, 'shipments', id));
  return snap.exists()
    ? {
        id: snap.id,
        ...snap.data(),
      }
    : null;
}
