// __tests__/simulaciones/geoapify.cjs  (dueño: P1)
// Geoapify simulado para las pruebas (la app ya no trae datos de prueba): responde con la misma forma que la API.
//   Geocodificación: busca el texto normalizado en geocode.json; si no está, un punto cerca del centro
//   de la zona del municipio con confianza 0.5 (queda para revisar).
//   Route Planner: jobs en el orden recibido, línea recta a 20 km/h, y deja sin asignar
//   (issues.unassigned_jobs) los que ya no alcanzan el turno o su horario.
// instalar(global) cambia fetch: lo que va a api.geoapify.com lo responde esta simulación; lo demás sigue igual.
const path = require('path');
const geocodeTable = require('./geocode.json');
const zones = require(path.join(__dirname, '..', '..', 'src', 'config', 'zones.json'));
const depot = require(path.join(__dirname, '..', '..', 'src', 'config', 'depot.json'));

// Copias de src/features/geo/normalize.js y src/features/zones/municipios.js (este archivo no pasa por Babel)
const normalizeText = (s = '') =>
  String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9#]+/g, ' ')
    .trim();
const MUNICIPIO_TO_ZONE = {
  'san salvador centro': 'Z1',
  'antiguo cuscatlan': 'Z3',
  'santa tecla': 'Z3',
  'la libertad sur': 'Z3',
  'la libertad este': 'Z3',
  soyapango: 'Z4',
  ilopango: 'Z4',
  'san salvador este': 'Z4',
  mejicanos: 'Z5',
  apopa: 'Z5',
  'san salvador norte': 'Z5',
};

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

function responder(ruta, { body, params } = {}) {
  if (ruta.startsWith('/v1/geocode/search')) return geocode(params);
  if (ruta.startsWith('/v1/routeplanner')) return routePlanner(body);
  throw new Error(`Geoapify simulado sin respuesta para ${ruta}`);
}

/** Cambia fetch del objeto global: las llamadas a api.geoapify.com las responde la simulación. */
function instalar(g = globalThis) {
  if (g.__geoapifySimulado) return;
  const real = g.fetch;
  g.__geoapifySimulado = true;
  g.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    if (u.hostname !== 'api.geoapify.com') return real(url, init);
    const params = Object.fromEntries(u.searchParams.entries());
    const json = responder(u.pathname, { body: init.body ? JSON.parse(init.body) : undefined, params });
    return { ok: true, status: 200, json: async () => json, text: async () => JSON.stringify(json) };
  };
}

module.exports = { responder, instalar };
