// src/features/geo/addressBook.js  (dueño: P1)
// Libreta de direcciones (S4-03): addresses/{teléfono}_{hash}. Una ubicación confirmada
// por el despacho o por el GPS de la entrega se reutiliza y no vuelve a pasar por la API.
import { doc, getDoc, increment } from 'firebase/firestore';
import { LOCATION_SOURCE, LOCATION_STATUS, STATUS } from '../../constants';
import { USE_MOCKS, db } from '../../lib/firebase';
import { NOW, commitOps } from '../../lib/writer';
import { mockDb } from '../../mocks';
import { getShipment } from '../shipments/shipmentsService';
import { resolveZone } from '../zones/zoneResolver';
import { addressKey, addressNorm, phone8 } from './normalize';

/** Entrada de la libreta para un cliente y dirección, o null. */
export async function lookupAddress(phone, address) {
  const id = addressKey(phone, address);
  if (USE_MOCKS) return mockDb.get('addresses', id);
  const snap = await getDoc(doc(db, 'addresses', id));
  return snap.exists() ? { id, ...snap.data() } : null;
}

/** Suma 1 a `uses` de una entrada (cuando un pedido nuevo la reutiliza). */
export async function touchAddress(id) {
  if (USE_MOCKS) {
    const cur = mockDb.get('addresses', id);
    if (cur) mockDb.upsert('addresses', { id, uses: (cur.uses ?? 0) + 1 });
    return;
  }
  await commitOps([{ kind: 'set', col: 'addresses', id, data: { uses: increment(1) } }]);
}

/**
 * Marca la ubicación del envío como confirmada y la guarda en la libreta, en una sola escritura.
 * Si el envío sigue pendiente y el punto cae en otra zona, también se corrige su zona.
 * @param {string} shipmentId
 * @param {{ lat: number, lng: number }} point
 * @param {'despacho'|'gps_entrega'} [source]
 * @returns {Promise<{ addressId: string, zoneId: string }>}
 */
export async function confirmLocation(shipmentId, { lat, lng }, source = LOCATION_SOURCE.DESPACHO) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('Ubicación inválida');
  const s = await getShipment(shipmentId);
  if (!s) throw new Error(`No existe el envío ${shipmentId}`);

  const location = {
    lat,
    lng,
    status: LOCATION_STATUS.CONFIRMADA,
    source,
    confidence: 1,
    label: s.location?.label ?? null,
  };
  const data = { location, updatedAt: NOW };
  const zoneId = s.status === STATUS.PENDIENTE ? resolveZone({ location, municipio: s.address?.municipio }) : s.zoneId;
  if (zoneId !== s.zoneId) data.zoneId = zoneId;

  const addressId = addressKey(s.customer?.phone, s.address ?? {});
  const prev = await lookupAddress(s.customer?.phone, s.address ?? {});
  await commitOps([
    { kind: 'update', col: 'shipments', id: shipmentId, data },
    {
      kind: 'set',
      col: 'addresses',
      id: addressId,
      data: {
        phone: phone8(s.customer?.phone),
        addressNorm: addressNorm(s.address ?? {}),
        lat,
        lng,
        source,
        confirmedAt: NOW,
        uses: prev?.uses ?? 1,
      },
    },
  ]);
  return { addressId, zoneId };
}
