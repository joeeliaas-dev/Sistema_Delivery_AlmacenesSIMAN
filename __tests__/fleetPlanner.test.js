// __tests__/fleetPlanner.test.js  (dueño: P2)
// Optimización conjunta (Optimizar día con UNA llamada al Route Planner y todos los motoristas como
// agentes): la solicitud, la respuesta con varios agentes, los motivos y optimizeDay de punta a punta.
import { ROUTING } from '../src/config/routing';
import {
  buildFleetRequest,
  buildRoutePlannerRequest,
  fleetUnassignedReason,
  parseFleetResponse,
} from '../src/optimizer/geoapify';
import { fleetRoutePlanner } from '../src/mocks/geoapify/fleetPlanner';

jest.mock('../src/lib/geoapify', () => {
  const actual = jest.requireActual('../src/lib/geoapify');
  return { ...actual, geoapifyFetch: jest.fn() };
});
const geo = require('../src/lib/geoapify');
const opt = require('../src/optimizer');

const DATE = '2026-11-02';
const NOW = new Date(2026, 9, 30, 9, 0); // otro día: todos salen al inicio de su turno
const depot = { location: { lat: 13.699, lng: -89.22 } };
const moto = (id) => ({ id, type: 'moto', label: id, maxKg: 40, capabilities: [] });
const pickup = { id: 'V4', type: 'pickup', label: 'Pick-up', maxKg: 600, capabilities: ['carga_grande'] };
const drivers = [
  { id: 'D1', name: 'Kevin Rivas', zoneId: 'Z1', vehicleId: 'V1', shiftStart: '07:00', shiftEnd: '18:00' },
  { id: 'D2', name: 'Jorge Martínez', zoneId: 'Z2', vehicleId: 'V2', shiftStart: '08:00', shiftEnd: '16:00' },
  { id: 'D3', name: 'Daniela Flores', zoneId: 'Z3', vehicleId: 'V4', shiftStart: '07:00', shiftEnd: '18:00' },
];
const vehicles = [moto('V1'), moto('V2'), pickup];
const crew = drivers.map((driver) => ({ driver, vehicle: vehicles.find((v) => v.id === driver.vehicleId) }));

let n = 0;
const ship = (over = {}) => {
  n += 1;
  const id = over.id ?? `S${String(n).padStart(3, '0')}`;
  return {
    id,
    code: id,
    zoneId: 'Z1',
    scheduledDate: DATE,
    status: 'pendiente',
    attempts: 0,
    routeId: null,
    location: { lat: 13.7 + n * 0.001, lng: -89.2 - n * 0.001, status: 'alta' },
    priority: 'normal',
    weightKg: 2,
    requires: [],
    serviceMin: 5,
    timeWindow: null,
    ...over,
  };
};

describe('buildFleetRequest', () => {
  const shipments = [
    ship({ id: 'B', weightKg: 12.2 }),
    ship({ id: 'A', requires: ['carga_grande'], serviceMin: 20 }),
    ship({ id: 'C', priority: 'express' }),
    ship({ id: 'D', timeWindow: { from: '09:00', to: '11:00' } }),
  ];
  const req = buildFleetRequest({ shipments, crew: crew.map((c) => ({ ...c, startSec: undefined })), depot });

  it('un agente por motorista: depósito de ida y vuelta, turno, capacidad en kg y carga grande', () => {
    expect(req.mode).toBe('drive');
    expect(req.agents).toEqual([
      {
        id: 'D1',
        start_location: [-89.22, 13.699],
        end_location: [-89.22, 13.699],
        time_windows: [[7 * 3600, 18 * 3600]],
        delivery_capacity: 40,
      },
      {
        id: 'D2',
        start_location: [-89.22, 13.699],
        end_location: [-89.22, 13.699],
        time_windows: [[8 * 3600, 16 * 3600]],
        delivery_capacity: 40,
      },
      {
        id: 'D3',
        start_location: [-89.22, 13.699],
        end_location: [-89.22, 13.699],
        time_windows: [[7 * 3600, 18 * 3600]],
        delivery_capacity: 600,
        capabilities: ['carga_grande'],
      },
    ]);
  });

  it('un job por pedido (por id): kg hacia arriba, requisito, servicio y ventanas', () => {
    expect(req.jobs.map((j) => j.id)).toEqual(['A', 'B', 'C', 'D']);
    const byId = Object.fromEntries(req.jobs.map((j) => [j.id, j]));
    expect(byId.A).toMatchObject({ requirements: ['carga_grande'], duration: 20 * 60, delivery_amount: 2 });
    expect(byId.B).toMatchObject({ delivery_amount: 13, duration: 300, priority: 50 });
    // Express sin ventana: del primer inicio de turno de la flota (07:00) a las 12:00
    expect(byId.C).toMatchObject({ priority: 100, time_windows: [[7 * 3600, 12 * 3600]] });
    expect(byId.D.time_windows).toEqual([[9 * 3600, 11 * 3600]]);
    expect(byId.B.time_windows).toBeUndefined();
  });

  it('salida más tarde que el turno (hoy, ya empezado) y errores claros', () => {
    const late = buildFleetRequest({ shipments, crew: [{ ...crew[0], startSec: 10 * 3600 }], depot });
    expect(late.agents[0].time_windows).toEqual([[10 * 3600, 18 * 3600]]);
    expect(() => buildFleetRequest({ shipments, crew: [], depot })).toThrow('No hay motoristas');
    expect(() => buildFleetRequest({ shipments, crew, depot: {} })).toThrow('Falta la ubicación del depósito');
  });

  it('la solicitud de UNA ruta sigue igual (Generar ruta de esta zona y Pasar a…)', () => {
    const one = buildRoutePlannerRequest({ shipments, driver: drivers[0], vehicle: vehicles[0], depot });
    expect(one.agents).toHaveLength(1);
    expect(one.agents[0]).toEqual(req.agents[0]);
    expect(one.jobs).toEqual(req.jobs);
  });
});

// Respuesta a mano con la forma de Geoapify: una feature por agente con ruta
const feature = (agentIndex, jobIds, request, startH = 7) => {
  let t = startH * 3600;
  const actions = [{ type: 'start', start_time: t, index: 0 }];
  jobIds.forEach((id, i) => {
    t += 600;
    const job_index = request.jobs.findIndex((j) => j.id === id);
    actions.push({ type: 'job', job_index, job_id: id, start_time: t, duration: 300, index: i + 1 });
    t += 300;
  });
  actions.push({ type: 'end', start_time: t + 600, index: jobIds.length + 1 });
  return {
    type: 'Feature',
    geometry: {
      type: 'MultiLineString',
      coordinates: [
        [
          [-89.22, 13.699],
          [-89.21, 13.7],
          [-89.22, 13.699],
        ],
      ],
    },
    properties: { agent_index: agentIndex, distance: 12345, time: t + 600 - startH * 3600, actions, legs: [] },
  };
};

describe('parseFleetResponse', () => {
  const shipments = [
    ship({ id: 'P1', weightKg: 20 }),
    ship({ id: 'P2', weightKg: 18 }),
    ship({ id: 'P3', weightKg: 30 }), // ya no cabe en ninguna moto
    ship({ id: 'P4', requires: ['carga_grande'], weightKg: 80 }),
    ship({ id: 'P5', timeWindow: { from: '06:00', to: '06:30' } }), // antes de todo turno
  ];
  const twoMotos = crew.slice(0, 2);
  const request = buildFleetRequest({ shipments, crew: twoMotos, depot });

  it('una ruta por agente, en el orden de agents, con paradas, ETA, km y línea por calles', () => {
    const response = {
      type: 'FeatureCollection',
      properties: { issues: { unassigned_jobs: [2, 3, 4] } },
      features: [feature(1, ['P2'], request, 8), feature(0, ['P1'], request)],
    };
    const { plans, unassigned } = parseFleetResponse(response, { request, shipments, crew: twoMotos, date: DATE });
    expect(plans.map((p) => [p.agentIndex, p.stops.map((st) => st.shipmentId)])).toEqual([
      [0, ['P1']],
      [1, ['P2']],
    ]);
    expect(plans[0].stops[0]).toMatchObject({ stopSequence: 1, etaISO: `${DATE}T07:10:00-06:00`, etaMin: 10 });
    expect(plans[0]).toMatchObject({ km: 12.35, startISO: `${DATE}T07:00:00-06:00` });
    expect(plans[0].geometry[0]).toEqual([13.699, -89.22]);
    // Sin asignar con motivo contra TODA la flota: requisito (ninguna moto lleva carga grande),
    // capacidad (en ninguna moto quedan 30 kg libres) y ventana (había espacio, no hora)
    expect(unassigned).toEqual([
      { shipmentId: 'P3', reason: 'capacidad' },
      { shipmentId: 'P4', reason: 'requisito' },
      { shipmentId: 'P5', reason: 'ventana' },
    ]);
  });

  it('sin huérfanos: lo enviado que no vuelve en ninguna ruta queda sin asignar aunque Geoapify no lo liste', () => {
    const response = { type: 'FeatureCollection', properties: {}, features: [feature(0, ['P1'], request)] };
    const { plans, unassigned } = parseFleetResponse(response, { request, shipments, crew: twoMotos, date: DATE });
    expect(plans[1].stops).toEqual([]); // el agente sin feature: ruta vacía
    expect(unassigned.map((u) => u.shipmentId).sort()).toEqual(['P2', 'P3', 'P4', 'P5']);
  });

  it('sin repetidos: un pedido que viniera en dos rutas se queda en la primera', () => {
    const response = { features: [feature(0, ['P1', 'P2'], request), feature(1, ['P2'], request)] };
    const { plans } = parseFleetResponse(response, { request, shipments, crew: twoMotos, date: DATE });
    expect(plans.map((p) => p.stops.map((st) => st.shipmentId))).toEqual([['P1', 'P2'], []]);
  });

  it('respuesta mal formada: lanza (optimizeDay cae al cálculo por zona)', () => {
    expect(() => parseFleetResponse({}, { request, shipments, crew: twoMotos, date: DATE })).toThrow('sin features');
    expect(() =>
      parseFleetResponse({ features: [{ properties: { agent_index: 0 } }] }, { request, shipments, crew, date: DATE }),
    ).toThrow('sin acciones');
  });

  it('fleetUnassignedReason: requisito, capacidad (peso o paradas) y ventana', () => {
    const loads = [
      { vehicle: moto('V1'), kg: 39, stops: 3 },
      { vehicle: pickup, kg: 590, stops: 25 },
    ];
    expect(fleetUnassignedReason({ requires: ['carga_grande'], weightKg: 5 }, loads, 25)).toBe('capacidad');
    expect(fleetUnassignedReason({ requires: ['carga_grande'], weightKg: 5 }, [loads[0]], 25)).toBe('requisito');
    expect(fleetUnassignedReason({ weightKg: 1 }, loads, 25)).toBe('ventana');
    expect(fleetUnassignedReason({ weightKg: 2 }, loads, 25)).toBe('capacidad');
    expect(fleetUnassignedReason({ weightKg: 500 }, [{ vehicle: null, kg: 0, stops: 0 }], 25)).toBe('ventana');
  });
});

describe('optimizeDay con la optimización conjunta', () => {
  beforeEach(() => {
    n = 0;
    geo.geoapifyFetch.mockReset();
    geo.geoapifyFetch.mockImplementation((path, { body }) => Promise.resolve(fleetRoutePlanner(body)));
  });

  // 3 zonas, pedidos repartidos; Z2 (Jorge) con más peso del que lleva su moto
  const day = () => [
    ...Array.from({ length: 6 }, () => ship({ zoneId: 'Z1', weightKg: 5 })),
    ...Array.from({ length: 6 }, () => ship({ zoneId: 'Z2', weightKg: 9 })),
    ...Array.from({ length: 4 }, () => ship({ zoneId: 'Z3', weightKg: 3 })),
    ship({ zoneId: 'Z1', requires: ['carga_grande'], weightKg: 60 }),
    ship({ zoneId: 'Z2', location: { lat: 13.7, lng: -89.2, status: 'revisar' } }),
  ];

  it('UNA llamada con todos los motoristas activos; una ruta por motorista, sin repetidos ni huérfanos', async () => {
    const shipments = day();
    const r = await opt.optimizeDay({ date: DATE, shipments, drivers, vehicles, depot, now: NOW });
    expect(geo.geoapifyFetch).toHaveBeenCalledTimes(1);
    expect(geo.geoapifyFetch.mock.calls[0][1].body.agents.map((a) => a.id)).toEqual(['D1', 'D2', 'D3']);
    expect(r.engine).toBe('geoapify');
    expect(r.plans.map((p) => [p.driverId, p.zoneId])).toEqual([
      ['D1', 'Z1'],
      ['D2', 'Z2'],
      ['D3', 'Z3'],
    ]);
    const routed = r.plans.flatMap((p) => p.stops.map((st) => st.shipmentId));
    const left = r.unassigned.map((u) => u.shipmentId);
    expect(new Set(routed).size).toBe(routed.length); // sin repetidos
    expect(routed.filter((id) => left.includes(id))).toEqual([]);
    expect(new Set([...routed, ...left]).size).toBe(shipments.length); // sin huérfanos
    // La línea blanca va en la pick-up, aunque sea de Z1 (las zonas no limitan)
    const big = shipments.find((s) => s.requires.length).id;
    expect(r.plans.find((p) => p.driverId === 'D3').stops.map((st) => st.shipmentId)).toContain(big);
    // Ninguna moto pasa de 40 kg
    const kg = (p) =>
      p.stops.reduce((s, st) => s + Math.ceil(shipments.find((x) => x.id === st.shipmentId).weightKg), 0);
    for (const p of r.plans.filter((x) => x.vehicleId !== 'V4')) expect(kg(p)).toBeLessThanOrEqual(40);
    expect(r.unassigned).toContainEqual({ shipmentId: shipments.at(-1).id, reason: 'sin_ubicacion' });
  });

  it('"ahorra X km": línea base de cada ruta con SUS paradas, nunca menor que sus km', async () => {
    const r = await opt.optimizeDay({ date: DATE, shipments: day(), drivers, vehicles, depot, now: NOW });
    for (const p of r.plans) {
      expect(p.baselineKm).toBeGreaterThanOrEqual(p.km);
      expect(p.engine).toBe('geoapify');
    }
  });

  it('quien sigue en ruta no entra como agente, y los pedidos de su zona entran al reparto', async () => {
    const shipments = day();
    const z2 = shipments.filter((s) => s.zoneId === 'Z2' && s.location.status === 'alta').map((s) => s.id);
    // Jorge salió hoy con la Ruta A (Z2) y sigue en ruta
    const running = ship({ id: 'RUN', zoneId: 'Z2', status: 'en_ruta', routeId: 'R-A' });
    const routes = [
      {
        id: 'R-A',
        code: 'Ruta A',
        date: DATE,
        zoneId: 'Z2',
        driverId: 'D2',
        status: 'en_curso',
        stops: [{ shipmentId: 'RUN' }],
      },
    ];
    const r = await opt.optimizeDay({
      date: DATE,
      shipments: [...shipments, running],
      drivers,
      vehicles,
      depot,
      routes,
      now: new Date(2026, 10, 2, 9, 0),
    });
    expect(geo.geoapifyFetch.mock.calls[0][1].body.agents.map((a) => a.id)).toEqual(['D1', 'D3']);
    expect(r.warnings).toContain('Jorge sigue en ruta (Ruta A): no recibe pedidos nuevos.');
    expect(r.plans.map((p) => p.driverId)).not.toContain('D2');
    const routed = new Set(r.plans.flatMap((p) => p.stops.map((st) => st.shipmentId)));
    expect(z2.some((id) => routed.has(id))).toBe(true); // otro vehículo los lleva
    const left = new Set(r.unassigned.map((u) => u.shipmentId));
    for (const id of z2) expect(routed.has(id) || left.has(id)).toBe(true);
    expect(routed.has('RUN')).toBe(false);
  });

  it(`una ruta con más de ${ROUTING.maxStops} paradas se recorta y lo recortado va a otra ronda`, async () => {
    const many = Array.from({ length: ROUTING.maxStops + 5 }, (_, i) =>
      ship({ zoneId: 'Z3', weightKg: 1, priority: i < 3 ? 'express' : 'normal' }),
    );
    let first = true;
    geo.geoapifyFetch.mockImplementation((path, { body }) => {
      if (first && body.agents.length > 1) {
        first = false;
        // Ronda 1: Geoapify (sin límite de paradas por agente) le da todo a la pick-up
        const idx = body.agents.findIndex((a) => a.id === 'D3');
        const resp = {
          type: 'FeatureCollection',
          properties: {},
          features: [
            feature(
              idx,
              body.jobs.map((j) => j.id),
              body,
            ),
          ],
        };
        return Promise.resolve(resp);
      }
      return Promise.resolve(fleetRoutePlanner(body));
    });
    const r = await opt.optimizeDay({ date: DATE, shipments: many, drivers, vehicles, depot, now: NOW });
    // Ronda 1 + la pick-up recortada, sola + ronda 2 con las motos (la pick-up ya va en 25 paradas)
    expect(geo.geoapifyFetch).toHaveBeenCalledTimes(3);
    const round2 = geo.geoapifyFetch.mock.calls[2][1].body;
    expect(round2.agents.map((a) => a.id)).toEqual(['D1', 'D2']);
    expect(round2.jobs).toHaveLength(5);
    const d3 = r.plans.find((p) => p.driverId === 'D3');
    expect(d3.stops).toHaveLength(ROUTING.maxStops);
    const express = many.filter((s) => s.priority === 'express').map((s) => s.id);
    for (const id of express) expect(d3.stops.map((st) => st.shipmentId)).toContain(id);
    // Los 5 recortados entran en las motos: nada queda sin asignar
    const routed = r.plans.flatMap((p) => p.stops.map((st) => st.shipmentId));
    expect(new Set(routed).size).toBe(many.length);
    expect(r.unassigned).toEqual([]);
    expect(r.rounds).toBe(2);
  });

  it('el aviso no dice "todas las rutas van llenas" si quedó un vehículo sin usar', async () => {
    // Pedidos de carga grande, más de lo que lleva la pick-up: las motos no pueden llevarlos
    const big = Array.from({ length: 4 }, () => ship({ requires: ['carga_grande'], weightKg: 200 }));
    const r = await opt.optimizeDay({ date: DATE, shipments: big, drivers, vehicles, depot, now: NOW });
    expect(r.plans.map((p) => p.driverId)).toEqual(['D3']);
    expect(r.unassigned).toEqual([{ shipmentId: expect.any(String), reason: 'capacidad' }]); // 600 kg: caben 3
    expect(r.warnings).toEqual([
      '1 pedido no cabe en ningún vehículo: Kevin y Jorge quedaron sin ruta porque lo que falta no les cabe ' +
        '(peso, carga grande u horario). Páselos a otro día.',
    ]);
  });

  it('si Geoapify falla, el día sale por zona en el teléfono, con un aviso', async () => {
    geo.geoapifyFetch.mockRejectedValue(new geo.GeoapifyError('quota', 'sin créditos'));
    const r = await opt.optimizeDay({ date: DATE, shipments: day(), drivers, vehicles, depot, now: NOW });
    expect(r.engine).toBe('local');
    expect(r.warnings[0]).toBe(
      'Se acabaron los créditos de Geoapify por hoy; las rutas se calcularon en el teléfono, por zona, sin calles ni horarios.',
    );
    expect(r.plans.every((p) => p.engine === 'local')).toBe(true);
  });

  it('sin motoristas libres: avisa y no llama a Geoapify', async () => {
    const r = await opt.optimizeDay({
      date: DATE,
      shipments: day(),
      drivers: drivers.map((d) => ({ ...d, active: false })),
      vehicles,
      depot,
      now: NOW,
    });
    expect(geo.geoapifyFetch).not.toHaveBeenCalled();
    expect(r.plans).toEqual([]);
    expect(r.warnings).toEqual(['No hay motoristas libres: los 17 pedidos quedan pendientes.']);
  });
});

// Respuesta REAL de Geoapify (1 nov, 96 del Excel de demo + arrastre, contra el emulador): la ronda 1
// carga 125 pedidos en D1 (5), la pick-up D3 (53) y el camión D4 (67), y deja sin usar D2 y D5
// (issues.unassigned_agents [1, 4]). Las rondas siguientes se simulan con el planner de prueba.
describe('optimización por rondas con la respuesta real de la ronda 1', () => {
  const rec = require('./fixtures/geoapify-conjunta-llamada-1.json');
  const hhmm = (sec) =>
    `${String(Math.floor(sec / 3600)).padStart(2, '0')}:${String((sec % 3600) / 60).padStart(2, '0')}`;
  // Los pedidos que producen exactamente esos jobs
  const shipments = rec.request.jobs.map((j) => {
    const express = j.priority === 100;
    const tw = j.time_windows?.[0];
    return {
      id: j.id,
      code: j.id,
      zoneId: 'Z1',
      scheduledDate: '2026-11-01',
      status: 'pendiente',
      attempts: 0,
      routeId: null,
      location: { lng: j.location[0], lat: j.location[1], status: 'alta' },
      priority: express ? 'express' : 'normal',
      weightKg: j.delivery_amount ?? 0,
      requires: j.requirements ?? [],
      serviceMin: j.duration / 60,
      // Un express sin ventana propia lleva la de 07:00 a 12:00; esa la arma buildFleetRequest
      timeWindow:
        tw && !(express && tw[0] === 7 * 3600 && tw[1] === 12 * 3600) ? { from: hhmm(tw[0]), to: hhmm(tw[1]) } : null,
    };
  });
  const realDrivers = require('../src/mocks/drivers.json');
  const realVehicles = require('../src/mocks/vehicles.json');
  const realDepot = require('../src/mocks/depot.json');
  const args = () => ({
    date: '2026-11-01',
    shipments,
    drivers: realDrivers,
    vehicles: realVehicles,
    depot: realDepot,
    now: new Date(2026, 9, 31, 10, 0),
  });

  beforeEach(() => {
    geo.geoapifyFetch.mockReset();
    geo.geoapifyFetch.mockImplementation((path, { body }) =>
      Promise.resolve(body.agents.length === 5 ? rec.response : fleetRoutePlanner(body)),
    );
  });

  it('la solicitud de la ronda 1 es la misma que se mandó a Geoapify', async () => {
    await opt.optimizeDay(args());
    expect(geo.geoapifyFetch.mock.calls[0][1].body).toEqual(rec.request);
  });

  it('la ronda 2 le da pedidos a D2 y D5 (las motos que Geoapify dejó sin usar)', async () => {
    const r = await opt.optimizeDay(args());
    const fleetCalls = geo.geoapifyFetch.mock.calls.map(([, o]) => o.body).filter((b) => b.agents.length > 1);
    expect(r.rounds).toBeGreaterThanOrEqual(2);
    expect(fleetCalls.length).toBe(r.rounds);
    expect(fleetCalls.length).toBeLessThanOrEqual(3);
    // Ronda 2: las que siguen con espacio (D1 con sus kg libres, D2 y D5 vacías); la pick-up y el
    // camión ya van en 25 paradas
    const round2 = fleetCalls[1];
    expect(round2.agents.map((a) => a.id)).toEqual(['D1', 'D2', 'D5']);
    expect(round2.agents[0].delivery_capacity).toBe(40 - 21); // D1 ya lleva 21 kg
    const used = r.plans.map((p) => p.driverId).sort();
    expect(used).toEqual(['D1', 'D2', 'D3', 'D4', 'D5']);
    for (const p of r.plans) expect(p.stops.length).toBeLessThanOrEqual(ROUTING.maxStops);
    // Sin repetidos ni huérfanos
    const routed = r.plans.flatMap((p) => p.stops.map((st) => st.shipmentId));
    const left = r.unassigned.map((u) => u.shipmentId);
    expect(new Set(routed).size).toBe(routed.length);
    expect(new Set([...routed, ...left]).size).toBe(shipments.length);
    // Antes de las rondas quedaban 77 "no caben"; ahora las motos se llenan
    const noRoom = r.unassigned.filter((u) => u.reason === 'capacidad').length;
    expect(noRoom).toBeLessThan(77 - 20);
    const kg = (p) => p.stops.reduce((s, st) => s + shipments.find((x) => x.id === st.shipmentId).weightKg, 0);
    for (const id of ['D2', 'D5']) expect(kg(r.plans.find((p) => p.driverId === id))).toBeGreaterThan(20);
  });
});
