// src/mocks/geoapify/index.js  (dueño: P1; las grabaciones del Route Planner las aporta P2)
// Respuestas de Geoapify sin internet, con la misma forma que la API real.
//   Geocodificación: busca el texto normalizado en geocode.json; si no está, un punto
//   cerca del centro de la zona del municipio con confianza 0.5 (queda para revisar).
//   Route Planner: respuesta sintética con la forma real: jobs en el orden recibido, línea recta a
//   20 km/h, y deja sin asignar (issues.unassigned_jobs) los que ya no alcanzan el turno o su horario.
import geocodeTable from './geocode.json';
import zones from '../zones.json';
import depot from '../depot.json';
import { MUNICIPIO_TO_ZONE } from '../../features/zones/municipios';
import { normalizeText } from '../../features/geo/normalize';

const centerOf = (zone) => {
  const n = zone.polygon.length;
  return {
    lat: zone.polygon.reduce((s, p) => s + p.lat, 0) / n,
    lng: zone.polygon.reduce((s, p) => s + p.lng, 0) / n,
  };
};

function geocode(params) {
  const text = params.text ?? '';
  const known = geocodeTable[normalizeText(text)];
  if (known) return { results: [known], query: { text } };
  const parts = text.split(',').map((p) => p.trim());
  const municipio = normalizeText(parts.at(-2) ?? '');
  const zone = zones.find((z) => z.id === MUNICIPIO_TO_ZONE[municipio]);
  const c = zone ? centerOf(zone) : depot.location;
  return {
    results: [
      {
        lat: Math.round((c.lat + 0.001) * 1e6) / 1e6,
        lon: Math.round((c.lng + 0.001) * 1e6) / 1e6,
        result_type: 'suburb',
        formatted: `${parts.at(-2) ?? 'San Salvador'}, El Salvador`,
        rank: { confidence: 0.5, match_type: 'inner_part' },
      },
    ],
    query: { text },
  };
}

const km = (a, b) => {
  const r = (d) => (d * Math.PI) / 180;
  const h =
    Math.sin(r(b[1] - a[1]) / 2) ** 2 + Math.cos(r(a[1])) * Math.cos(r(b[1])) * Math.sin(r(b[0] - a[0]) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

function routePlanner(body = {}) {
  const unassigned = [];
  const agent = body.agents?.[0] ?? {};
  const [t0, shiftEnd] = agent.time_windows?.[0] ?? [7 * 3600, 18 * 3600];
  const home = agent.end_location ?? agent.start_location;
  const leg = (a, b) => km(a, b) * 1.35;
  const travel = (d) => Math.round((d / 20) * 3600);
  let t = t0;
  let pos = agent.start_location;
  let distance = 0;
  const coords = [pos];
  const actions = [{ type: 'start', start_time: t, duration: 0, index: 0 }];
  (body.jobs ?? []).forEach((job, i) => {
    const d = leg(pos, job.location);
    let at = t + travel(d);
    const [from, to] = job.time_windows?.[0] ?? [0, Infinity];
    at = Math.max(at, from);
    const done = at + (job.duration ?? 300);
    if (at > to || done + travel(leg(job.location, home)) > shiftEnd) {
      unassigned.push(i);
      return;
    }
    distance += d * 1000;
    actions.push({
      type: 'job',
      start_time: at,
      duration: job.duration ?? 300,
      job_index: i,
      job_id: job.id,
      index: actions.length,
    });
    t = done;
    pos = job.location;
    coords.push(pos);
  });
  const back = leg(pos, home);
  distance += back * 1000;
  t += travel(back);
  coords.push(home);
  actions.push({ type: 'end', start_time: t, duration: 0, index: actions.length });
  const start = actions[0].start_time;
  const features = [
    {
      type: 'Feature',
      geometry: { type: 'MultiLineString', coordinates: [coords] },
      properties: {
        agent_index: 0,
        agent_id: agent.id,
        distance: Math.round(distance),
        mode: body.mode ?? 'drive',
        start_time: start,
        end_time: t,
        time: t - start,
        actions,
        waypoints: [],
        legs: [],
      },
    },
  ];
  return {
    type: 'FeatureCollection',
    properties: {
      mode: body.mode ?? 'drive',
      params: body,
      issues: unassigned.length ? { unassigned_jobs: unassigned } : undefined,
    },
    features,
  };
}

export function mockGeoapify(path, { body, params }) {
  if (path.startsWith('/v1/geocode/search')) return geocode(params);
  if (path.startsWith('/v1/routeplanner')) return routePlanner(body);
  throw new Error(`Mock de Geoapify sin respuesta para ${path}`);
}
