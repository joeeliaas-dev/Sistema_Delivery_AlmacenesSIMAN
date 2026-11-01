// src/features/geo/resolveLocations.js  (dueño: P1)
// Ubicación en capas (S4-02) para las filas validadas del Excel:
//   1) libreta → confirmada   2) lat/lng del Excel → alta   3) Geoapify → alta, revisar o sin_ubicacion
// Las filas rojas no se tocan. Una fila verde cuya ubicación hay que revisar pasa a amarilla.
import {
  GEOCODE_MIN_CONFIDENCE,
  GEOCODE_OK_TYPES,
  LOCATION_SOURCE,
  LOCATION_STATUS,
  ROW_STATUS,
} from '../../constants';
import { zoneAt } from '../zones/zoneResolver';
import { lookupAddress } from './addressBook';
import { geocodeAddress } from './geocodeAddress';
import { normalizeText } from './normalize';

const CONCURRENCY = 5;

const COLONY_MARKER =
  /^(colonia|col|barrio|bo|urbanizacion|urb|residencial|res|reparto|rpto|lotificacion|condominio)\b/;
const COLONY_STOP = new Set(['calle', 'avenida', 'pasaje', 'casa', 'final', 'norte', 'oriente', 'poniente', 'santa']);

/**
 * Palabras de la colonia escrita en el Excel (N40, opción B): el tramo con "Colonia", "Barrio", "Urb."…
 * o, si no hay, el último tramo después de una coma. "Calle El Mirador #6, Col. Escalón" → ['escalon'].
 * Sin colonia reconocible devuelve [] y no se compara.
 */
export function colonyWords(address) {
  const parts = String(address?.text ?? '')
    .split(',')
    .slice(1)
    .map(normalizeText)
    .filter((p) => p && p !== normalizeText(address?.municipio ?? ''));
  const seg = parts.find((p) => COLONY_MARKER.test(p)) ?? parts.at(-1);
  if (!seg || /\d/.test(seg)) return [];
  return seg
    .replace(COLONY_MARKER, '')
    .split(' ')
    .filter((w) => w.length >= 4 && !COLONY_STOP.has(w));
}

/**
 * Decide el estado de una respuesta de Geoapify; motivo en español si hay que revisar.
 * Confianza 1 solo dice "encontré la calle" (N48): si el Excel trae colonia y Geoapify no la menciona,
 * el punto puede estar en otra calle con el mismo nombre, así que se revisa.
 */
export function judgeGeocode(hit, zones, address = null) {
  if (!hit) return { status: LOCATION_STATUS.SIN_UBICACION, reason: 'No se encontró la dirección' };
  if (hit.confidence < GEOCODE_MIN_CONFIDENCE) return { status: LOCATION_STATUS.REVISAR, reason: 'confianza baja' };
  if (!GEOCODE_OK_TYPES.includes(hit.resultType))
    return { status: LOCATION_STATUS.REVISAR, reason: 'solo se ubicó la colonia' };
  if (!zoneAt(hit, zones)) return { status: LOCATION_STATUS.REVISAR, reason: 'fuera de zona de reparto' };
  const colony = colonyWords(address);
  const found = normalizeText(`${hit.label ?? ''} ${hit.area ?? ''}`).split(' ');
  if (colony.length && !colony.every((w) => found.includes(w)))
    return { status: LOCATION_STATUS.REVISAR, reason: 'la colonia no coincide con la del Excel' };
  return { status: LOCATION_STATUS.ALTA, reason: null };
}

async function locate(order, { zones, depot }) {
  const book = await lookupAddress(order.customer.phone, order.address).catch(() => null);
  if (book)
    return {
      location: {
        lat: book.lat,
        lng: book.lng,
        status: LOCATION_STATUS.CONFIRMADA,
        source: LOCATION_SOURCE.LIBRETA,
        confidence: 1,
        label: null,
      },
      addressId: book.id,
      reason: null,
    };

  if (order.location)
    return {
      location: {
        ...order.location,
        status: LOCATION_STATUS.ALTA,
        source: LOCATION_SOURCE.EXCEL,
        confidence: 1,
        label: null,
      },
      reason: null,
    };

  let hit = null;
  try {
    hit = await geocodeAddress(order.address, depot ? { depot } : undefined);
  } catch (err) {
    return { location: null, reason: `Sin respuesta de Geoapify: ${err.message}` };
  }
  const { status, reason } = judgeGeocode(hit, zones, order.address);
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
      const { location, reason, addressId } = await locate(row.order, { zones, depot });
      row.order.location = location ?? {
        lat: null,
        lng: null,
        status: LOCATION_STATUS.SIN_UBICACION,
        source: null,
        confidence: 0,
        label: null,
      };
      if (addressId) row.order.addressId = addressId;
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
