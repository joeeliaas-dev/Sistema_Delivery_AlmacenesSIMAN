// __tests__/geoapifyPlanner.test.js  (dueño: P2)
// Traductor Trazza ↔ Geoapify Route Planner: la solicitud (S4-06).
import {
  EXPRESS_DEADLINE,
  JOB_PRIORITY,
  buildRoutePlannerRequest,
  jobWindow,
  serviceMinOf,
  shiftWindow,
  toSeconds,
} from '../src/optimizer/geoapify';

const depot = { location: { lat: 13.699, lng: -89.22 } };
const driver = { id: 'D1', shiftStart: '07:00', shiftEnd: '18:00' };

const ship = (over = {}) => ({
  id: 'SIM-0401',
  code: 'SIM-0401',
  location: { lat: 13.6971, lng: -89.1882, status: 'alta' },
  priority: 'normal',
  serviceMin: 5,
  timeWindow: null,
  ...over,
});

describe('toSeconds', () => {
  it('cuenta desde las 00:00', () => {
    expect(toSeconds('07:00')).toBe(25200);
    expect(toSeconds('18:00')).toBe(64800);
    expect(toSeconds('9:30')).toBe(34200);
  });
  it('rechaza horas mal escritas', () => {
    expect(() => toSeconds('25:00')).toThrow('Hora inválida');
    expect(() => toSeconds('7h')).toThrow('Hora inválida');
    expect(() => toSeconds(null)).toThrow('Hora inválida');
  });
});

describe('agente (motorista)', () => {
  it('sale y vuelve al depósito, con [lng, lat] y su turno; sin capacidad', () => {
    const { mode, agents } = buildRoutePlannerRequest({ shipments: [], driver, depot });
    expect(mode).toBe('drive');
    expect(agents).toEqual([
      {
        id: 'D1',
        start_location: [-89.22, 13.699],
        end_location: [-89.22, 13.699],
        time_windows: [[25200, 64800]],
      },
    ]);
  });

  it('sin turno usa DEFAULT_SHIFT', () => {
    const { agents } = buildRoutePlannerRequest({ shipments: [], driver: { id: 'D9' }, depot });
    expect(agents[0].time_windows).toEqual([[25200, 64800]]);
    expect(shiftWindow({ shiftStart: '08:30', shiftEnd: '16:00' })).toEqual([30600, 57600]);
  });
});

describe('jobs (envíos)', () => {
  it('id, [lng, lat], servicio en segundos y prioridad normal', () => {
    const { jobs } = buildRoutePlannerRequest({ shipments: [ship()], driver, depot });
    expect(jobs).toEqual([
      {
        id: 'SIM-0401',
        location: [-89.1882, 13.6971],
        duration: 300,
        priority: JOB_PRIORITY.NORMAL,
      },
    ]);
  });

  it('sin minutos de servicio usa DEFAULT_SERVICE_MIN', () => {
    expect(serviceMinOf(ship({ serviceMin: undefined }))).toBe(5);
    expect(serviceMinOf(ship({ serviceMin: 0 }))).toBe(5);
  });

  it('ventana propia en segundos', () => {
    const s = ship({ timeWindow: { from: '09:00', to: '11:30' } });
    const [job] = buildRoutePlannerRequest({ shipments: [s], driver, depot }).jobs;
    expect(job.time_windows).toEqual([[32400, 41400]]);
  });

  it(`express sin ventana: del inicio del turno a las ${EXPRESS_DEADLINE} (N38), prioridad 100`, () => {
    const [job] = buildRoutePlannerRequest({
      shipments: [ship({ priority: 'express' })],
      driver,
      depot,
    }).jobs;
    expect(job.time_windows).toEqual([[25200, 43200]]);
    expect(job.priority).toBe(JOB_PRIORITY.EXPRESS);
  });

  it('express con ventana propia respeta la suya; normal sin ventana no lleva time_windows', () => {
    const shift = shiftWindow(driver);
    expect(jobWindow(ship({ priority: 'express', timeWindow: { from: '14:00', to: '15:00' } }), shift)).toEqual([
      50400, 54000,
    ]);
    expect(jobWindow(ship(), shift)).toBeNull();
    // Turno que empieza después del mediodía: el express no recibe una ventana imposible
    expect(
      jobWindow(ship({ priority: 'express' }), shiftWindow({ shiftStart: '13:00', shiftEnd: '18:00' })),
    ).toBeNull();
  });

  it('rechaza un envío sin ubicación y una zona sin motorista o sin depósito', () => {
    expect(() =>
      buildRoutePlannerRequest({ shipments: [ship({ location: null })], driver, depot }),
    ).toThrow('El envío SIM-0401 no tiene ubicación');
    expect(() => buildRoutePlannerRequest({ shipments: [], driver: null, depot })).toThrow(
      'Falta el motorista de la zona',
    );
    expect(() => buildRoutePlannerRequest({ shipments: [], driver, depot: null })).toThrow(
      'Falta la ubicación del depósito',
    );
  });

  it('con los datos de prueba de Z1: un job por envío, ordenados por id (solicitud estable)', () => {
    const z1 = require('./grabaciones/shipments.json').filter((s) => s.zoneId === 'Z1');
    const body = buildRoutePlannerRequest({ shipments: z1, driver, depot });
    expect(body.jobs.map((j) => j.id)).toEqual(z1.map((s) => s.id).sort());
    const shuffled = [...z1].reverse();
    expect(buildRoutePlannerRequest({ shipments: shuffled, driver, depot })).toEqual(body);
    expect(body.jobs.every((j) => j.location[0] < -89 && j.location[1] > 13)).toBe(true);
  });
});

describe('respuesta del Route Planner (grabación real de Z1, 27 oct)', () => {
  const {
    flattenGeometry,
    parseRoutePlannerResponse,
    secondsToISO,
  } = require('../src/optimizer/geoapify');
  const response = require('./grabaciones/routeplanner-zona-a.json');
  const request = require('./grabaciones/routeplanner-zona-a.request.json');
  const shipments = require('./grabaciones/shipments.json').filter((s) => s.zoneId === 'Z1');
  const parsed = parseRoutePlannerResponse(response, { request, shipments, date: '2026-10-29' });

  it('orden de paradas, stopSequence y ETA con la hora de El Salvador', () => {
    expect(parsed.stops.map((s) => s.shipmentId)).toEqual([
      'SIM-0405',
      'SIM-0407',
      'SIM-0404',
      'SIM-0411',
      'SIM-0402',
      'SIM-0410',
    ]);
    expect(parsed.stops.map((s) => s.stopSequence)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(parsed.stops[0]).toEqual({
      shipmentId: 'SIM-0405',
      stopSequence: 1,
      etaISO: '2026-10-29T07:05:03-06:00', // 25 503 s
      etaMin: 5, // desde la salida (07:00)
      serviceMin: 5,
      kmFromPrev: 3.82,
    });
    expect(secondsToISO('2026-10-29', 25200)).toBe('2026-10-29T07:00:00-06:00');
  });

  it('km, minutos, salida y fin', () => {
    expect(parsed).toMatchObject({
      km: 14.66,
      minutes: 51,
      startISO: '2026-10-29T07:00:00-06:00',
      endISO: '2026-10-29T07:50:46-06:00',
    });
  });

  it('geometría: MultiLineString aplanada y volteada a [lat, lng], sin puntos repetidos', () => {
    const g = parsed.geometry;
    expect(g.length).toBeGreaterThan(2);
    expect(g[0]).toEqual([13.698998, -89.219988]);
    expect(g.every(([lat, lng]) => lat > 13 && lat < 14.5 && lng < -87 && lng > -90.5)).toBe(true);
    expect(g.some((p, i) => i > 0 && p[0] === g[i - 1][0] && p[1] === g[i - 1][1])).toBe(false);
    expect(flattenGeometry(null)).toBeNull();
  });

  it('lo que Geoapify no metió en la ruta queda sin asignar por ventana (turno u horario)', () => {
    expect(parsed.unassigned.map((u) => u.shipmentId).sort()).toEqual([
      'SIM-0400',
      'SIM-0401',
      'SIM-0403',
      'SIM-0406',
      'SIM-0408',
      'SIM-0409',
    ]);
    expect(new Set(parsed.unassigned.map((u) => u.reason))).toEqual(new Set(['ventana']));
  });

  it('respuesta sin ruta para el agente: todo lo enviado queda sin asignar', () => {
    const empty = { type: 'FeatureCollection', properties: { issues: { unassigned_jobs: [0] } }, features: [] };
    const r = parseRoutePlannerResponse(empty, { request, shipments, date: '2026-10-29' });
    expect(r.stops).toEqual([]);
    expect(r.unassigned).toHaveLength(12);
    expect(r).toMatchObject({ km: 0, geometry: null, endISO: null });
  });
});

describe('respuesta mal formada', () => {
  const { parseRoutePlannerResponse } = require('../src/optimizer/geoapify');
  const ctx = { request: { jobs: [] }, shipments: [], date: '2026-10-29' };
  it('sin features o sin acciones lanza error (optimizeDay avisa que Geoapify falló)', () => {
    expect(() => parseRoutePlannerResponse({}, ctx)).toThrow('sin features');
    expect(() => parseRoutePlannerResponse({ features: [{ properties: { actions: 'x' } }] }, ctx)).toThrow(
      'sin acciones',
    );
  });
});
