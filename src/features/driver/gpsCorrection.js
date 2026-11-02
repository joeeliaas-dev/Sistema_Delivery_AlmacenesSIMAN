// src/features/driver/gpsCorrection.js (dueño: P3)
// S4-14: al entregar, si el GPS fue preciso (menos de 50 m) y la ubicación del envío no estaba
// confirmada, se confirma con el punto del GPS (confirmLocation de P1, fuente 'gps_entrega').
// Así el pedido queda con la casa real del cliente (C53: sin libreta). Si falla, el motorista no ve nada: solo consola.
import { LOCATION_SOURCE, LOCATION_STATUS } from '../../constants';
import { confirmLocation } from '../geo/confirmLocation';

export const GPS_MAX_ACCURACY_M = 50;

/** ¿Se debe corregir la ubicación del envío con este GPS? */
export function shouldConfirmFromGps(shipment, gps) {
  if (!gps || !Number.isFinite(gps.lat) || !Number.isFinite(gps.lng)) return false;
  if (!Number.isFinite(gps.accuracyM) || gps.accuracyM >= GPS_MAX_ACCURACY_M) return false;
  return shipment?.location?.status !== LOCATION_STATUS.CONFIRMADA;
}

/** Corrige la ubicación si corresponde. Nunca lanza: la entrega ya se guardó. */
export async function confirmFromDelivery(shipment, gps) {
  if (!shouldConfirmFromGps(shipment, gps)) return false;
  try {
    await confirmLocation(shipment.id, { lat: gps.lat, lng: gps.lng }, LOCATION_SOURCE.GPS_ENTREGA);
    return true;
  } catch (err) {
    console.warn('[entrega] no se pudo corregir la ubicación con el GPS:', err?.message ?? err);
    return false;
  }
}
