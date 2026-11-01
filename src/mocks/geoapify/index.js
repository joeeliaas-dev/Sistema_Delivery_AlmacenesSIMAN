// src/mocks/geoapify/index.js  (dueño: P1; las grabaciones del Route Planner las aporta P2)
// Respuestas de Geoapify sin internet, con la misma forma que la API real.
//   Geocodificación: busca el texto normalizado en geocode.json; si no está, un punto
//   cerca del centro de la zona del municipio con confianza 0.5 (queda para revisar).
//   Route Planner: si la solicitud es la grabada por P2 (Z1, mismos jobs) responde la grabación real;
//   si no, una respuesta sintética: jobs en el orden recibido, línea recta, y deja sin asignar
//   (issues.unassigned_jobs) los que no cumplen requisitos o ya no caben en la capacidad.
import geocodeTable from './geocode.json';
import { fleetRoutePlanner } from './fleetPlanner';
import zonaA from './routeplanner-zona-a.json';
import zonaARequest from './routeplanner-zona-a.request.json';
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

// La grabación solo se usa si la solicitud es la misma: mismos jobs y el agente completo
// (capacidad, capacidades, turno y salida); con otro vehículo u otra hora sale la sintética
const sortKeys = (v) =>
  Array.isArray(v)
    ? v.map(sortKeys)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, sortKeys(v[k])]),
        )
      : v;
const jobKey = (b) =>
  (b?.jobs ?? [])
    .map((j) => j.id)
    .sort()
    .join(',') +
  '|' +
  JSON.stringify(sortKeys(b?.agents ?? []));

function routePlanner(body = {}) {
  // Optimización conjunta (varios motoristas en una llamada): reparte entre todos los agentes
  if ((body.agents?.length ?? 0) > 1) return fleetRoutePlanner(body);
  if (jobKey(body) === jobKey(zonaARequest)) return zonaA;
  const unassigned = [];
  const agent0 = body.agents?.[0] ?? {};
  let load = 0;
  const fits = (body.jobs ?? []).filter((job, i) => {
    const caps = agent0.capabilities ?? [];
    const amount = job.delivery_amount ?? 0;
    const okReq = (job.requirements ?? []).every((r) => caps.includes(r));
    const okCap = agent0.delivery_capacity == null || load + amount <= agent0.delivery_capacity;
    if (!okReq || !okCap) {
      unassigned.push(i);
      return false;
    }
    load += amount;
    return true;
  });
  const indexOf = new Map((body.jobs ?? []).map((j, i) => [j, i]));
  const features = (body.agents ?? []).map((agent, agentIndex) => {
    const jobs = agentIndex === 0 ? fits : [];
    let t = agent.time_windows?.[0]?.[0] ?? 7 * 3600;
    let pos = agent.start_location;
    let distance = 0;
    const coords = [pos];
    const actions = [{ type: 'start', start_time: t, duration: 0, index: 0 }];
    jobs.forEach((job, i) => {
      const d = km(pos, job.location) * 1.35;
      distance += d * 1000;
      t += Math.round((d / 20) * 3600);
      actions.push({
        type: 'job',
        start_time: t,
        duration: job.duration ?? 300,
        job_index: indexOf.get(job),
        job_id: job.id,
        index: i + 1,
      });
      t += job.duration ?? 300;
      pos = job.location;
      coords.push(pos);
    });
    const back = km(pos, agent.end_location ?? agent.start_location) * 1.35;
    distance += back * 1000;
    t += Math.round((back / 20) * 3600);
    coords.push(agent.end_location ?? agent.start_location);
    actions.push({ type: 'end', start_time: t, duration: 0, index: jobs.length + 1 });
    const start = actions[0].start_time;
    return {
      type: 'Feature',
      geometry: { type: 'MultiLineString', coordinates: [coords] },
      properties: {
        agent_index: agentIndex,
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
    };
  });
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
