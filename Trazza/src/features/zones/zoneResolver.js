import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon';
import { point, polygon as turfPolygon } from '@turf/helpers';
import { SIN_ZONA } from '../../constants';
import mockZones from '../../mocks/zones.json';
import { MUNICIPIO_TO_ZONE } from './municipios';
const normalize = (s = '') => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
function toTurf(poly) {
  const ring = poly.map((p) => [p.lng, p.lat]);
  const [first, last] = [ring[0], ring[ring.length - 1]];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);
  return turfPolygon([ring]);
}
const DEFAULT_ZONES = mockZones.map((z) => ({
  id: z.id,
  shape: toTurf(z.polygon),
}));
export function resolveZone({ location, municipio }, zones) {
  const shapes = zones
    ? zones.map((z) => ({
        id: z.id,
        shape: toTurf(z.polygon),
      }))
    : DEFAULT_ZONES;
  if (location && Number.isFinite(location.lat) && Number.isFinite(location.lng)) {
    const pt = point([location.lng, location.lat]);
    const hit = shapes.find(({ shape }) => booleanPointInPolygon(pt, shape));
    if (hit) return hit.id;
  }
  return MUNICIPIO_TO_ZONE[normalize(municipio)] ?? SIN_ZONA;
}
