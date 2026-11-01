// src/mocks/geoapify/fleetPlanner.js  (dueño: P1) — copia de testing/fleetPlanner.js (P2), 31 oct
// Route Planner de prueba con VARIOS agentes para "Optimizar día" (optimización conjunta, datos de prueba).
// Route Planner sintético con VARIOS agentes, con la forma de la API real de Geoapify, para las pruebas
// de la optimización conjunta. Es la misma lógica que se le propone a P1 para src/mocks/geoapify
// (su mock hoy reparte solo al agente 0). No es Geoapify: reparte de forma voraz y en línea recta.
//   - Por turnos, cada agente toma el job posible más cercano a donde está (primero prioridad 100).
//   - Posible: requirements ⊆ capabilities, delivery_capacity libre, y
//     llega dentro de la ventana del job y de su turno (y alcanza a volver). Si ningún agente
//     puede, va a issues.unassigned_jobs (índice del job).
//   - Distancia: línea recta × 1,35; velocidad 20 km/h (como ROUTING).
// Respuesta: FeatureCollection con UNA feature por agente que recibió algo (agent_index, agent_id,
// actions start/job/end con job_index y job_id, distance, time, start_time, end_time, legs: []).

const km = (a, b) => {
  const r = (d) => (d * Math.PI) / 180;
  const h =
    Math.sin(r(b[1] - a[1]) / 2) ** 2 + Math.cos(r(a[1])) * Math.cos(r(b[1])) * Math.sin(r(b[0] - a[0]) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};
const FACTOR = 1.35;
const SPEED_KMH = 20;
const travelSec = (a, b) => Math.round(((km(a, b) * FACTOR) / SPEED_KMH) * 3600);

export function fleetRoutePlanner(body = {}) {
  const jobs = body.jobs ?? [];
  const agents = (body.agents ?? []).map((a, i) => ({
    index: i,
    agent: a,
    pos: a.start_location,
    t: a.time_windows?.[0]?.[0] ?? 7 * 3600,
    end: a.time_windows?.[0]?.[1] ?? 18 * 3600,
    load: 0,
    visits: [],
  }));
  // Si el agente puede tomar el job ahora: llegada (esperando el inicio de la ventana) y fin
  const tryJob = (s, job) => {
    const caps = s.agent.capabilities ?? [];
    if (!(job.requirements ?? []).every((r) => caps.includes(r))) return null;
    const cap = s.agent.delivery_capacity;
    if (cap != null && s.load + (job.delivery_amount ?? 0) > cap) return null;
    let arrive = s.t + travelSec(s.pos, job.location);
    const tw = job.time_windows?.[0];
    if (tw) {
      if (arrive > tw[1]) return null;
      arrive = Math.max(arrive, tw[0]);
    }
    const done = arrive + (job.duration ?? 300);
    if (done + travelSec(job.location, s.agent.end_location ?? s.agent.start_location) > s.end) return null;
    return { arrive, done, d: km(s.pos, job.location) };
  };
  // Por turnos: cada agente toma el job posible más cercano a donde está; primero los de mayor
  // prioridad (express), después el resto. Lo que nadie puede tomar queda sin asignar.
  const remaining = new Map(jobs.map((job, i) => [i, job]));
  const priorities = [...new Set(jobs.map((j) => j.priority ?? 0))].sort((a, b) => b - a);
  for (const level of priorities) {
    let progress = true;
    while (progress) {
      progress = false;
      for (const s of agents) {
        let best = null;
        for (const [i, job] of remaining) {
          if ((job.priority ?? 0) !== level) continue;
          const t = tryJob(s, job);
          if (t && (!best || t.d < best.d)) best = { i, job, ...t };
        }
        if (!best) continue;
        remaining.delete(best.i);
        s.visits.push({ job: best.job, i: best.i, arrive: best.arrive });
        s.load += best.job.delivery_amount ?? 0;
        s.t = best.done;
        s.pos = best.job.location;
        progress = true;
      }
    }
  }
  const unassigned = [...remaining.keys()];

  const features = agents
    .filter((s) => s.visits.length)
    .map((s) => {
      const startT = s.agent.time_windows?.[0]?.[0] ?? 7 * 3600;
      const home = s.agent.end_location ?? s.agent.start_location;
      let pos = s.agent.start_location;
      let distance = 0;
      const coords = [pos];
      const actions = [{ type: 'start', start_time: startT, duration: 0, index: 0 }];
      s.visits.forEach((v, k) => {
        distance += km(pos, v.job.location) * FACTOR * 1000;
        actions.push({
          type: 'job',
          start_time: v.arrive,
          duration: v.job.duration ?? 300,
          job_index: v.i,
          job_id: v.job.id,
          index: k + 1,
        });
        pos = v.job.location;
        coords.push(pos);
      });
      distance += km(pos, home) * FACTOR * 1000;
      const endT = s.t + travelSec(pos, home);
      coords.push(home);
      actions.push({ type: 'end', start_time: endT, duration: 0, index: s.visits.length + 1 });
      return {
        type: 'Feature',
        geometry: { type: 'MultiLineString', coordinates: [coords] },
        properties: {
          agent_index: s.index,
          agent_id: s.agent.id,
          distance: Math.round(distance),
          mode: body.mode ?? 'drive',
          start_time: startT,
          end_time: endT,
          time: endT - startT,
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
      issues: unassigned.length ? { unassigned_jobs: unassigned.sort((a, b) => a - b) } : undefined,
    },
    features,
  };
}
