// src/features/geo/resolveLocations.js  (dueño: P1)
// Ubicación de las filas validadas del Excel, en dos pasos:
//   1) lat/lng del Excel → alta      2) Geoapify → alta, revisar o sin_ubicacion
// Las filas rojas no se tocan. Una fila verde cuya ubicación hay que revisar pasa a amarilla y se
// corrige en "Revisar ubicaciones".
import { GEOCODE_MIN_CONFIDENCE, GEOCODE_OK_TYPES, LOCATION_SOURCE, LOCATION_STATUS, ROW_STATUS } from '../../constants';
import { zoneAt } from '../zones/zoneResolver';
import { geocodeAddress } from './geocodeAddress';

const CONCURRENCY = 5;

/** Estado de una respuesta de Geoapify, con el motivo en español si hay que revisar. */
export function judgeGeocode(hit, zones) {
  if (!hit) return { status: LOCATION_STATUS.SIN_UBICACION, reason: 'No se encontró la dirección' };
  if (hit.confidence < GEOCODE_MIN_CONFIDENCE) return { status: LOCATION_STATUS.REVISAR, reason: 'confianza baja' };
  if (!GEOCODE_OK_TYPES.includes(hit.resultType))
    return { status: LOCATION_STATUS.REVISAR, reason: 'solo se ubicó la colonia' };
  if (!zoneAt(hit, zones)) return { status: LOCATION_STATUS.REVISAR, reason: 'fuera de zona de reparto' };
  return { status: LOCATION_STATUS.ALTA, reason: null };
}

async function locate(order, { zones, depot }) {
  if (order.location)
    return {
      location: { ...order.location, status: LOCATION_STATUS.ALTA, source: LOCATION_SOURCE.EXCEL, confidence: 1, label: null },
      reason: null,
    };
  let hit = null;
  try {
    hit = await geocodeAddress(order.address, depot ? { depot } : undefined);
  } catch (err) {
    return { location: null, reason: `Sin respuesta de Geoapify: ${err.message}` };
  }
  const { status, reason } = judgeGeocode(hit, zones);
  if (!hit) return { location: null, reason };
  return {
    location: {
      lat: hit.lat,
      lng: hit.lng,
      status,
      source: LOCATION_SOURCE.GEOAPIFY,
      confidence: hit.confidence,
      label: hit.label,
    },
    reason,
  };
}

/**
 * @param {Array<{ rowNumber, order, status, errors, warnings }>} validatedRows  salida de validateOrders
 * @param {{ onProgress?: (done: number, total: number) => void, zones?: object[], depot?: object }} [opts]
 * @returns {Promise<Array>} las mismas filas con order.location
 *   ({ lat, lng, status, source, confidence, label } o { status: 'sin_ubicacion' }) y, si hay que revisar, amarillas
 */
export async function resolveLocations(validatedRows, { onProgress, zones, depot } = {}) {
  const out = validatedRows.map((r) => ({
    ...r,
    order: r.order ? { ...r.order } : r.order,
    warnings: [...(r.warnings ?? [])],
  }));
  const todo = out.filter((r) => r.status !== ROW_STATUS.ROJA);
  let done = 0;
  onProgress?.(0, todo.length);

  let next = 0;
  async function worker() {
    while (next < todo.length) {
      const row = todo[next++];
      const { location, reason } = await locate(row.order, { zones, depot });
      row.order.location = location ?? {
        lat: null,
        lng: null,
        status: LOCATION_STATUS.SIN_UBICACION,
        source: null,
        confidence: 0,
        label: null,
      };
      if (reason) {
        row.warnings.push(`Ubicación: ${reason}`);
        if (row.status === ROW_STATUS.VERDE) row.status = ROW_STATUS.AMARILLA;
      }
      onProgress?.(++done, todo.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));
  return out;
}
