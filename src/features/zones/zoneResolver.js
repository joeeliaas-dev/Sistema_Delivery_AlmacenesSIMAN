// src/features/zones/zoneResolver.js  (dueño: P1)
// Paso 1 de la zonificación: punto en polígono → tabla municipio → 'SIN_ZONA'.
import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon';
import { point, polygon as turfPolygon } from '@turf/helpers';
import { SIN_ZONA } from '../../constants';
import mockZones from '../../mocks/zones.json';
import { MUNICIPIO_TO_ZONE } from './municipios';

const normalize = (s = '') =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita tildes
    .trim()
    .toLowerCase();

// Polígonos en formato de Firestore [{lat,lng}] → anillo cerrado GeoJSON [[lng,lat]]
function toTurf(poly) {
  const ring = poly.map((p) => [p.lng, p.lat]);
  const [first, last] = [ring[0], ring[ring.length - 1]];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);
  return turfPolygon([ring]);
}

// Por defecto, las mismas zonas que siembra el seed
const DEFAULT_ZONES = mockZones.map((z) => ({ id: z.id, shape: toTurf(z.polygon) }));

/**
 * @param {{ location?: {lat, lng}, municipio?: string }} args
 * @param {Array<{ id, polygon: {lat,lng}[] }>} [zones]  por defecto, las del seed
 * @returns {string} zoneId o 'SIN_ZONA'
 */
export function resolveZone({ location, municipio }, zones) {
  const shapes = zones ? zones.map((z) => ({ id: z.id, shape: toTurf(z.polygon) })) : DEFAULT_ZONES;
  if (location && Number.isFinite(location.lat) && Number.isFinite(location.lng)) {
    const pt = point([location.lng, location.lat]);
    const hit = shapes.find(({ shape }) => booleanPointInPolygon(pt, shape));
    if (hit) return hit.id;
  }
  return MUNICIPIO_TO_ZONE[normalize(municipio)] ?? SIN_ZONA;
}

/**
 * Zona por polígono, sin el respaldo por municipio (S4-02: "el punto cae dentro de una zona").
 * @returns {string|null} zoneId o null si el punto no cae en ninguna zona
 */
export function zoneAt(location, zones) {
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return null;
  const shapes = zones ? zones.map((z) => ({ id: z.id, shape: toTurf(z.polygon) })) : DEFAULT_ZONES;
  const pt = point([location.lng, location.lat]);
  return shapes.find(({ shape }) => booleanPointInPolygon(pt, shape))?.id ?? null;
}
