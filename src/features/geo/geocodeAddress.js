// src/features/geo/geocodeAddress.js  (dueño: P1)
// Dirección + municipio → coordenadas con nivel de confianza (Geoapify, S4-02).
import { geoapifyFetch } from '../../lib/geoapify';
import defaultDepot from '../../config/depot.json';

/**
 * @param {{ text: string, municipio: string }} address
 * @param {{ depot?: { location: {lat, lng} } }} [opts]  sesgo de proximidad (por defecto, el depósito de prueba)
 * @returns {Promise<{ lat, lng, confidence, resultType, label } | null>} null si no hay resultado
 * @throws {GeoapifyError} si la API no responde (timeout, quota, http, offline)
 */
export async function geocodeAddress({ text, municipio }, { depot = defaultDepot } = {}) {
  const { lat, lng } = depot.location;
  const json = await geoapifyFetch('/v1/geocode/search', {
    params: {
      text: [text, municipio, 'El Salvador'].filter(Boolean).join(', '),
      filter: 'countrycode:sv',
      bias: `proximity:${lng},${lat}`,
      lang: 'es',
      limit: 1,
      format: 'json',
    },
  });
  const r = json?.results?.[0];
  if (!r || !Number.isFinite(r.lat) || !Number.isFinite(r.lon)) return null;
  return {
    lat: r.lat,
    lng: r.lon,
    confidence: r.rank?.confidence ?? 0,
    resultType: r.result_type ?? null,
    label: r.formatted ?? null,
  };
}
