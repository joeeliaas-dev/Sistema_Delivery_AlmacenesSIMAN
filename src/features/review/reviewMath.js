// src/features/review/reviewMath.js (dueño: P3)
// Cálculos puros de Revisar ubicaciones (S4-12). La pantalla no decide la confianza (N40):
// solo lee location.status que dejó resolveLocations de P1.
import { LOCATION_STATUS, STATUS } from '../../constants';

const TO_REVIEW = [LOCATION_STATUS.REVISAR, LOCATION_STATUS.SIN_UBICACION];

/** Envío pendiente cuya ubicación hay que revisar o que no tiene ubicación. */
export const needsReview = (s) => s.status === STATUS.PENDIENTE && TO_REVIEW.includes(s.location?.status);

/** Lista a revisar, por número de pedido para que el orden no salte al confirmar. */
export const reviewQueue = (shipments) =>
  shipments
    .filter(needsReview)
    .sort((a, b) => String(a.orderNumber ?? a.id).localeCompare(String(b.orderNumber ?? b.id)));

const notFound = (loc) => loc.status === LOCATION_STATUS.SIN_UBICACION || !Number.isFinite(loc.lat);

/** Motivo en palabras de bodega (rediseño 30 oct): "Dirección dudosa" o "Dirección no encontrada". */
export function reviewReason(s) {
  return notFound(s.location ?? {}) ? 'Dirección no encontrada' : 'Dirección dudosa';
}

/** Detalle que se ve al tocar el motivo: dónde la ubicó el mapa. null si no hay nada que mostrar. */
export function reviewDetail(s) {
  const loc = s.location ?? {};
  if (notFound(loc)) return 'Ubique el pin a mano en la casa del cliente';
  return loc.label ? `El mapa la ubicó en: ${loc.label}` : null;
}

/** Centro aproximado de una zona (promedio de los vértices del polígono). */
export function zoneCenter(zone) {
  const pts = zone?.polygon ?? [];
  if (!pts.length) return null;
  const sum = pts.reduce((a, p) => ({ lat: a.lat + p.lat, lng: a.lng + p.lng }), { lat: 0, lng: 0 });
  return { lat: sum.lat / pts.length, lng: sum.lng / pts.length };
}

/** Punto donde arranca el pin: la ubicación dudosa, o el centro de su zona, o el depósito. */
export function startPoint(s, zones = [], depot = null) {
  const loc = s.location;
  if (Number.isFinite(loc?.lat) && Number.isFinite(loc?.lng)) return { lat: loc.lat, lng: loc.lng };
  const center = zoneCenter(zones.find((z) => z.id === s.zoneId));
  if (center) return center;
  return depot?.location ? { lat: depot.location.lat, lng: depot.location.lng } : null;
}

/** "Quedan 1 por revisar" no suena bien: singular y plural. */
export const remainingLabel = (n) => (n === 1 ? 'Queda 1' : `Quedan ${n}`);
