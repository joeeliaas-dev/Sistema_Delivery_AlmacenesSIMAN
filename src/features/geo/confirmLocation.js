// src/features/geo/confirmLocation.js  (dueño: P1)
// Fija la ubicación de un pedido: el despacho mueve el pin en "Revisar ubicaciones", o el motorista la
// corrige con el GPS al entregar. Queda "confirmada" y, si el pedido sigue pendiente, recalcula su zona.
import { LOCATION_SOURCE, LOCATION_STATUS, STATUS } from '../../constants';
import { NOW, commitOps } from '../../lib/writer';
import { getShipment } from '../shipments/shipmentsService';
import { resolveZone } from '../zones/zoneResolver';

/**
 * @param {string} shipmentId
 * @param {{ lat: number, lng: number }} point
 * @param {'despacho'|'gps_entrega'} [source]
 * @returns {Promise<{ zoneId: string }>}
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
  await commitOps([{ kind: 'update', col: 'shipments', id: shipmentId, data }]);
  return { zoneId };
}
