// src/features/shipments/shipmentsService.js  (dueño: P1)
// Lecturas de envíos. Solo lectura: todo cambio de estado pasa por statusMachine.js.
// Los listen* devuelven la función para cancelar.
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { STATUS } from '../../constants';
import { combine } from '../../lib/combine';
import { USE_MOCKS, db } from '../../lib/firebase';
import { mockDb } from '../../mocks';

const toDocs = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
// Los arrastrados de días anteriores van primero
const byTime = (a, b) =>
  a.scheduledDate.localeCompare(b.scheduledDate) ||
  a.scheduledTime.localeCompare(b.scheduledTime) ||
  a.code.localeCompare(b.code);

/** Estados que siguen abiertos: un envío así no desaparece al cambiar de día. */
export const OPEN_STATUSES = [STATUS.PENDIENTE, STATUS.ASIGNADO, STATUS.EN_RUTA, STATUS.NO_ENTREGADO];

/** Envío de un día anterior que sigue abierto: se arrastra a la fecha de trabajo. */
export const isCarriedOver = (s, date) => s.scheduledDate < date && OPEN_STATUSES.includes(s.status);
const bySeq = (a, b) => (a.stopSequence ?? 0) - (b.stopSequence ?? 0);
// onError (opcional): recibe un Error con mensaje listo para mostrar si la lectura falla
const readError = (where_, onError) => (err) => {
  console.error(`[shipments] ${where_}:`, err);
  onError?.(new Error('No se pudieron leer los envíos. Revise la conexión e intente de nuevo.'));
};

// Filtro y consultas de listenShipments y getShipmentsOfDay
function shipmentsQuery({ date, zoneId, priority, statuses }) {
  const match = (s) =>
    (s.scheduledDate === date || isCarriedOver(s, date)) &&
    (!zoneId || s.zoneId === zoneId) &&
    (!priority || s.priority === priority) &&
    (!statuses?.length || statuses.includes(s.status));
  // en función: con datos de prueba no hay Firestore
  const clauses = () => [
    where('scheduledDate', '==', date),
    ...(zoneId ? [where('zoneId', '==', zoneId)] : []),
    ...(statuses?.length ? [where('status', 'in', statuses)] : []),
  ];
  return { match, clauses };
}

/**
 * Envíos de una fecha más los de días anteriores que siguen abiertos (pendientes,
 * reintentos y paradas de rutas sin cerrar), ordenados por fecha y hora programada.
 * @param {{ date: string, zoneId?: string, priority?: 'express'|'normal', statuses?: string[] }} filters
 * @param {(shipments: object[]) => void} cb
 * @returns {() => void} cancelar
 */
export function listenShipments({ date, zoneId, priority, statuses }, cb, onError) {
  const { match, clauses } = shipmentsQuery({ date, zoneId, priority, statuses });
  if (USE_MOCKS) return mockDb.listen('shipments', (docs) => docs.filter(match).sort(byTime), cb);
  const onErr = readError('listenShipments', onError);
  // priority, zona y fecha de los abiertos se filtran en el teléfono para no multiplicar índices compuestos
  return combine(
    [
      (next) => onSnapshot(query(collection(db, 'shipments'), ...clauses()), (snap) => next(toDocs(snap)), onErr),
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

/**
 * Envíos de una fecha para el despacho (S4): los de la fecha y los abiertos de días anteriores (N37).
 * @param {string} date  'AAAA-MM-DD'
 * @returns {() => void} cancelar
 */
export const listenShipmentsByDate = (date, cb, onError) => listenShipments({ date }, cb, onError);

/**
 * Los mismos envíos que listenShipments, leídos del servidor de una vez (no la primera respuesta de un
 * listener, que puede venir de la caché local con solo una parte). Para Optimizar día y Generar ruta.
 * @param {{ date: string, zoneId?: string }} filters
 * @returns {Promise<object[]>}
 */
export async function getShipmentsOfDay({ date, zoneId }) {
  const { match, clauses } = shipmentsQuery({ date, zoneId });
  if (USE_MOCKS) return mockDb.all('shipments').filter(match).sort(byTime);
  const [ofDate, open] = await Promise.all([
    getDocs(query(collection(db, 'shipments'), ...clauses())),
    getDocs(query(collection(db, 'shipments'), where('status', 'in', OPEN_STATUSES))),
  ]);
  const byId = new Map([...toDocs(ofDate), ...toDocs(open)].map((s) => [s.id, s]));
  return [...byId.values()].filter(match).sort(byTime);
}

/** Envíos de una ruta en orden de parada (stopSequence). */
export function listenRouteShipments(routeId, cb, onError) {
  if (USE_MOCKS) return mockDb.listen('shipments', (docs) => docs.filter((s) => s.routeId === routeId).sort(bySeq), cb);
  return onSnapshot(
    query(collection(db, 'shipments'), where('routeId', '==', routeId)),
    (snap) => cb(toDocs(snap).sort(bySeq)),
    readError('listenRouteShipments', onError),
  );
}

/**
 * Envíos de una ruta leídos del servidor de una vez (no la primera respuesta de un listener, que puede
 * venir de la caché local incompleta). Para cálculos que reescriben la ruta, como "Pasar a…".
 */
export async function getRouteShipments(routeId) {
  if (USE_MOCKS)
    return mockDb
      .all('shipments')
      .filter((s) => s.routeId === routeId)
      .sort(bySeq);
  const snap = await getDocs(query(collection(db, 'shipments'), where('routeId', '==', routeId)));
  return toDocs(snap).sort(bySeq);
}

/** Un envío por id (el id es el código, ej. "SIM-0419"); null si no existe. */
export async function getShipment(id) {
  if (USE_MOCKS) return mockDb.get('shipments', id);
  const snap = await getDoc(doc(db, 'shipments', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
