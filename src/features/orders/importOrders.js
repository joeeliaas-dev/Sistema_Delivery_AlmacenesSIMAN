// src/features/orders/importOrders.js  (dueño: P1)
// Crea los envíos de las filas validadas (S4-04): por lotes de 400, en estado pendiente
// y con un evento "importado". Las filas rojas no se cargan.
import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';
import { DEFAULT_SHIFT, ROW_STATUS, STATUS } from '../../constants';
import { USE_MOCKS, db } from '../../lib/firebase';
import { mockDb } from '../../mocks';
import { resolveZone } from '../zones/zoneResolver';

const BATCH = 400; // cada envío son 2 escrituras (envío + evento); Firestore acepta 500 por lote
const pad4 = (n) => String(n).padStart(4, '0');
const codeNumber = (id) => Number(/^SIM-(\d+)$/.exec(id)?.[1] ?? 0);

async function existingIds() {
  if (USE_MOCKS) return mockDb.all('shipments').map((s) => s.id);
  return (await getDocs(collection(db, 'shipments'))).docs.map((d) => d.id);
}

/**
 * Todos los números de pedido que ya existen en Trazza, de cualquier fecha (para validateOrders:
 * un pedido repetido entre días distintos también sale rojo).
 * @returns {Promise<string[]>}
 */
export async function listOrderNumbers() {
  const list = USE_MOCKS
    ? mockDb.all('shipments')
    : (await getDocs(collection(db, 'shipments'))).docs.map((d) => d.data());
  return list.map((s) => s.orderNumber).filter(Boolean);
}

/** Documento del envío a partir de una fila validada (con order.location de resolveLocations). */
export function shipmentFromOrder(order, { id, date, now }) {
  const location = order.location?.status
    ? order.location
    : order.location
      ? { ...order.location, status: 'alta', source: 'excel', confidence: 1, label: null }
      : null;
  return {
    code: id,
    orderNumber: order.orderNumber,
    zoneId: resolveZone({ location: location?.lat != null ? location : null, municipio: order.address.municipio }),
    scheduledDate: order.scheduledDate ?? date,
    scheduledTime: order.timeWindow?.from ?? DEFAULT_SHIFT.START,
    timeWindow: order.timeWindow ?? null,
    priority: order.priority,
    customer: order.customer,
    address: order.address,
    location,
    packages: order.packages ?? 1,
    serviceMin: order.serviceMin,
    items: [{ sku: null, name: 'Bultos del pedido', qty: order.packages ?? 1 }],
    status: STATUS.PENDIENTE,
    attempts: 0,
    routeId: null,
    stopSequence: null,
    etaMin: null,
    unassignedReason: null,
    lastEvidence: null,
    lastFailure: null,
    createdAt: now,
    updatedAt: now,
  };
}

const importedEvent = (now) => ({
  kind: 'importado',
  fromStatus: STATUS.PENDIENTE,
  toStatus: STATUS.PENDIENTE,
  at: now,
  driverId: null,
  attempt: 0,
  automatic: true,
});

/**
 * @param {Array<{ order, status }>} validatedRows  salida de resolveLocations (o de validateOrders)
 * @param {{ date?: string }} [opts]  fecha por si una fila no trae la suya
 * @returns {Promise<{ created: number, skipped: number, ids: string[] }>}
 */
export async function importOrders(validatedRows, { date } = {}) {
  const rows = validatedRows.filter((r) => r.status !== ROW_STATUS.ROJA && r.order);
  const skipped = validatedRows.length - rows.length;
  let n = Math.max(399, ...(await existingIds()).map(codeNumber));
  const docs = rows.map((r) => {
    const id = `SIM-${pad4(++n)}`;
    return { id, row: r };
  });

  if (USE_MOCKS) {
    const now = new Date().toISOString();
    for (const { id, row } of docs) {
      mockDb.upsert('shipments', { id, ...shipmentFromOrder(row.order, { id, date, now }) });
      mockDb.add('events', { shipmentId: id, ...importedEvent(now) });
    }
    return { created: docs.length, skipped, ids: docs.map((d) => d.id) };
  }

  const now = new Date().toISOString();
  for (let i = 0; i < docs.length; i += BATCH / 2) {
    const batch = writeBatch(db);
    for (const { id, row } of docs.slice(i, i + BATCH / 2)) {
      batch.set(doc(db, 'shipments', id), shipmentFromOrder(row.order, { id, date, now }));
      batch.set(doc(collection(db, 'shipments', id, 'events')), importedEvent(now));
    }
    await batch.commit();
  }
  return { created: docs.length, skipped, ids: docs.map((d) => d.id) };
}
