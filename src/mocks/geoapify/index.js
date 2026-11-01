// src/mocks/geoapify/index.js  (dueño: P1; las grabaciones del Route Planner las aporta P2)
// Respuesta del Route Planner sin internet, con la misma forma que la API real: jobs en el orden
// recibido, línea recta a 20 km/h, y deja sin asignar (issues.unassigned_jobs) los que ya no
// alcanzan el turno del motorista o su horario.

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

export function mockGeoapify(path, { body }) {
  if (path.startsWith('/v1/routeplanner')) return routePlanner(body);
  throw new Error(`Mock de Geoapify sin respuesta para ${path}`);
}
