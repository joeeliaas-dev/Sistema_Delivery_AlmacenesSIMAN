// __tests__/contractS4.test.js  (dueño: P1) — contrato del Sprint 4 en modo mocks
import { todayISO } from '../src/lib/dates';

const today = todayISO();
const tomorrow = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return todayISO(d);
})();
let mockDb;

beforeEach(() => {
  jest.resetModules();
  mockDb = require('../src/mocks').mockDb;
});


describe('reintentos y Geoapify (S4-04, S4-05)', () => {
  it('carryOverRetries trae los no entregados de días anteriores', async () => {
    const { carryOverRetries } = require('../src/features/shipments/carryOver');
    const { moved } = await carryOverRetries(tomorrow);
    expect(moved).toBe(2);
    expect(mockDb.get('shipments', 'SIM-0401')).toMatchObject({
      status: 'pendiente',
      scheduledDate: tomorrow,
      attempts: 1,
    });
    expect(mockDb.all('events').some((e) => e.kind === 'reprogramado')).toBe(true);
    expect((await carryOverRetries(today)).moved).toBe(0);
  });

  it('geoapifyFetch en mocks responde con la forma de la API', async () => {
    const { geoapifyFetch } = require('../src/lib/geoapify');
    const json = await geoapifyFetch('/v1/routeplanner', {
      method: 'POST',
      body: {
        mode: 'drive',
        agents: [{ id: 'D1', start_location: [-89.22, 13.699] }],
        jobs: [{ id: 'A', location: [-89.19, 13.7], duration: 300 }],
      },
    });
    expect(json.features[0].properties.actions.map((a) => a.type)).toEqual(['start', 'job', 'end']);
  });
});

describe('pedidos de P2 y P3 (miércoles, C30)', () => {
  it('assignToRoute escribe unassignedReason en la misma escritura y limpia el de los asignados', async () => {
    const { assignToRoute } = require('../src/features/shipments/statusMachine');
    mockDb.upsert('shipments', { id: 'SIM-0403', unassignedReason: 'ventana' });
    await assignToRoute({
      routeId: `R-${today}-Z1`,
      stops: [{ shipmentId: 'SIM-0403', seq: 1, etaMin: 10 }],
      route: { code: 'Ruta B', date: today, zoneId: 'Z1', driverId: 'D1', status: 'asignada', stops: [] },
      unassigned: [{ shipmentId: 'SIM-0400', reason: 'capacidad' }],
    });
    expect(mockDb.get('shipments', 'SIM-0403')).toMatchObject({ status: 'asignado', unassignedReason: null });
    expect(mockDb.get('shipments', 'SIM-0400')).toMatchObject({ status: 'pendiente', unassignedReason: 'capacidad' });
    await expect(
      assignToRoute({ routeId: 'R-x', stops: [], unassigned: [{ shipmentId: 'SIM-0404', reason: 'otro' }] }),
    ).rejects.toThrow('Motivo de sin asignar desconocido');
  });

  it('changeStatus devuelve el GPS guardado', async () => {
    const { changeStatus } = require('../src/features/shipments/statusMachine');
    const res = await changeStatus({
      shipment: 'SIM-0419',
      to: 'entregado',
      payload: {
        photoUri: 'file://f.jpg',
        signatureBase64: 'data:image/png;base64,AA',
        description: 'Recibió el cliente',
      },
    });
    expect(res).toHaveProperty('status', 'entregado');
    expect(res).toHaveProperty('gps');
  });

  it('mock del Route Planner: con la forma de la API, y sin asignar lo que no alcanza el turno', async () => {
    const { geoapifyFetch } = require('../src/lib/geoapify');
    const far = [-89.6, 13.98];
    const syn = await geoapifyFetch('/v1/routeplanner', {
      method: 'POST',
      body: {
        mode: 'drive',
        agents: [
          {
            id: 'D5',
            start_location: [-89.22, 13.699],
            end_location: [-89.22, 13.699],
            time_windows: [[25200, 30600]],
          },
        ],
        jobs: [
          { id: 'A', location: [-89.21, 13.74], duration: 300 },
          { id: 'B', location: far, duration: 300 },
          { id: 'C', location: [-89.21, 13.74], duration: 300, time_windows: [[0, 25000]] },
          { id: 'D', location: [-89.21, 13.741], duration: 300 },
        ],
      },
    });
    expect(syn.properties.issues.unassigned_jobs).toEqual([1, 2]);
    expect(syn.features[0].properties.actions.filter((a) => a.job_id).map((a) => [a.job_id, a.job_index])).toEqual([
      ['A', 0],
      ['D', 3],
    ]);
  });
});

describe('geometría de rutas en Firestore (C32)', () => {
  const { fromStoredGeometry, toStoredGeometry } = require('../src/lib/geometry');

  it('ida y vuelta sin listas anidadas', () => {
    const coords = [
      [13.7, -89.2],
      [13.71, -89.21],
    ];
    const stored = toStoredGeometry(coords);
    expect(stored).toEqual([
      { lat: 13.7, lng: -89.2 },
      { lat: 13.71, lng: -89.21 },
    ]);
    expect(fromStoredGeometry(stored)).toEqual(coords);
    expect(toStoredGeometry(null)).toBeNull();
  });

  it('recorta a 1500 puntos y conserva el último', () => {
    const coords = Array.from({ length: 4000 }, (_, i) => [13.7 + i / 1e5, -89.2]);
    const stored = toStoredGeometry(coords);
    expect(stored.length).toBeLessThanOrEqual(1501);
    expect(stored.at(-1).lat).toBeCloseTo(13.7 + 3999 / 1e5, 6);
  });
});

describe('replanRoutes (S4-07 reemplazo y S4-08 mover parada, C33)', () => {
  const route = (zoneId, stops) => ({ code: 'Ruta B', date: today, zoneId, driverId: 'D1', status: 'asignada', stops });

  it('crea, mueve una parada a otra ruta, libera y anota motivos en una sola escritura', async () => {
    const { assignToRoute, replanRoutes } = require('../src/features/shipments/statusMachine');
    const r1 = `R-${today}-Z1`;
    await assignToRoute({
      routeId: r1,
      stops: [
        { shipmentId: 'SIM-0404', seq: 1, etaMin: 5 },
        { shipmentId: 'SIM-0405', seq: 2, etaMin: 10 },
      ],
      route: route('Z1', []),
    });
    const r2 = `R-${today}-Z1-2`;
    await replanRoutes({
      routes: [
        {
          routeId: r1,
          route: route('Z1', [{ shipmentId: 'SIM-0405', seq: 1, etaMin: 4 }]),
          stops: [{ shipmentId: 'SIM-0405', seq: 1, etaMin: 4 }],
        },
        {
          routeId: r2,
          route: route('Z1', [{ shipmentId: 'SIM-0407', seq: 1, etaMin: 6 }]),
          stops: [{ shipmentId: 'SIM-0407', seq: 1, etaMin: 6 }],
        },
      ],
      released: ['SIM-0404'],
      unassigned: [
        { shipmentId: 'SIM-0404', reason: 'capacidad' },
        { shipmentId: 'SIM-0400', reason: 'capacidad' },
      ],
    });
    expect(mockDb.get('shipments', 'SIM-0405')).toMatchObject({ status: 'asignado', routeId: r1, stopSequence: 1 });
    expect(mockDb.get('shipments', 'SIM-0407')).toMatchObject({ status: 'asignado', routeId: r2 });
    expect(mockDb.get('shipments', 'SIM-0404')).toMatchObject({
      status: 'pendiente',
      routeId: null,
      unassignedReason: 'capacidad',
    });
    expect(mockDb.get('shipments', 'SIM-0400')).toMatchObject({ status: 'pendiente', unassignedReason: 'capacidad' });
    expect(mockDb.get('routes', r1).stops).toHaveLength(1);
    expect(mockDb.all('events').some((e) => e.kind === 'liberado' && e.shipmentId === 'SIM-0404')).toBe(true);
  });

  it('no toca una ruta que ya inició', async () => {
    const { replanRoutes } = require('../src/features/shipments/statusMachine');
    const rA = `R-${today}-Z2`;
    await expect(replanRoutes({ routes: [{ routeId: rA, route: route('Z2', []), stops: [] }] })).rejects.toThrow(
      'ya inició',
    );
  });
});
