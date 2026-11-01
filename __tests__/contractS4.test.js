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

const row = (over = {}) => ({
  __row: 2,
  Pedido: 'WEB-1',
  Cliente: 'Ana Pérez',
  Teléfono: '7012-3456',
  Dirección: 'Calle La Mascota 26, Colonia Escalón',
  Municipio: 'San Salvador',
  Fecha: tomorrow,
  ...over,
});

describe('validateOrders (S4-01)', () => {
  const { validateOrders } = require('../src/features/orders/validateOrders');

  it('fila buena: normaliza encabezados y teléfono', () => {
    const [r] = validateOrders([row({ Municipio: 'San Salvador Centro' })]);
    expect(r.status).toBe('verde');
    expect(r.order).toMatchObject({
      orderNumber: 'WEB-1',
      customer: { phone: '+50370123456' },
      scheduledDate: tomorrow,
    });
  });

  it('teléfono, fecha pasada, repetido y municipio desconocido', () => {
    const rows = validateOrders(
      [
        row({ Teléfono: '7123-45' }),
        row({ Pedido: 'WEB-2', Fecha: '2020-01-01' }),
        row({ Pedido: 'WEB-3' }),
        row({ Pedido: 'WEB-3' }),
        row({ Pedido: 'WEB-4', Municipio: 'Narnia' }),
        row({ Pedido: 'WEB-5' }),
      ],
      { existingOrderIds: ['WEB-5'] },
    );
    expect(rows[0].errors[0]).toBe('Teléfono 7123-45: debe tener 8 dígitos y empezar con 2, 6 o 7');
    expect(rows[1].errors[0]).toMatch('no puede ser anterior a hoy');
    expect(rows[2].status).not.toBe('roja');
    expect(rows[3].errors[0]).toMatch('repetido en el archivo');
    expect(rows[4].status).toBe('amarilla');
    expect(rows[5].errors[0]).toMatch('ya existe');
  });

  it('carga grande y servicio por defecto', () => {
    const [r] = validateOrders([row({ peso_kg: 45 })]);
    expect(r.order.requires).toEqual(['carga_grande']);
    expect(r.order.serviceMin).toBe(20);
  });
});

describe('ubicación, importación y libreta (S4-02 a S4-04)', () => {
  it('Excel → alta; Geoapify mock → revisar; importar; confirmar; la libreta evita la API', async () => {
    const { validateOrders } = require('../src/features/orders/validateOrders');
    const { resolveLocations } = require('../src/features/geo/resolveLocations');
    const { importOrders } = require('../src/features/orders/importOrders');
    const { confirmLocation } = require('../src/features/geo/addressBook');
    const geo = require('../src/features/geo/geocodeAddress');

    const valid = validateOrders([
      row({ Municipio: 'San Salvador Centro', lat: 13.7, lng: -89.19 }),
      row({ Pedido: 'WEB-2', Teléfono: '2222-3333', Dirección: 'Colonia Miramonte', Municipio: 'San Salvador Centro' }),
    ]);
    const progress = jest.fn();
    const located = await resolveLocations(valid, { onProgress: progress });
    expect(located[0].order.location).toMatchObject({ status: 'alta', source: 'excel' });
    expect(located[1].order.location).toMatchObject({ status: 'revisar', source: 'geoapify' });
    expect(located[1].status).toBe('amarilla');
    expect(progress).toHaveBeenLastCalledWith(2, 2);

    const { created, ids } = await importOrders(located);
    expect(created).toBe(2);
    const s = mockDb.get('shipments', ids[1]);
    expect(s).toMatchObject({ status: 'pendiente', scheduledDate: tomorrow, orderNumber: 'WEB-2' });

    await confirmLocation(ids[1], { lat: 13.699, lng: -89.19 }, 'despacho');
    expect(mockDb.get('shipments', ids[1]).location.status).toBe('confirmada');

    const spy = jest.spyOn(geo, 'geocodeAddress');
    const again = await resolveLocations(
      validateOrders([
        row({
          Pedido: 'WEB-9',
          Teléfono: '2222-3333',
          Dirección: 'Colonia Miramonte',
          Municipio: 'San Salvador Centro',
        }),
      ]),
    );
    expect(again[0].order.location).toMatchObject({ status: 'confirmada', source: 'libreta' });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('flota, reintentos y Geoapify (S4-04, S4-05)', () => {
  it('vehículos y turno', async () => {
    const { listenVehicles, upsertVehicle, updateDriverSetup } = require('../src/features/fleet/fleetService');
    const list = await new Promise((r) => listenVehicles(r));
    expect(list.map((v) => v.id)).toEqual(['V1', 'V2', 'V3', 'V4', 'V5']);
    await upsertVehicle({ id: 'V1', type: 'moto', label: 'Moto 1', maxKg: 45 });
    expect(mockDb.get('vehicles', 'V1').maxKg).toBe(45);
    await updateDriverSetup('D1', { vehicleId: 'V4', shiftStart: '08:00', shiftEnd: '17:00' });
    expect(mockDb.get('drivers', 'D1')).toMatchObject({ vehicleId: 'V4', shiftStart: '08:00' });
    await expect(updateDriverSetup('D1', { shiftStart: '9' })).rejects.toThrow('use HH:MM');
  });

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
      unassigned: [{ shipmentId: 'SIM-0400', reason: 'requisito' }],
    });
    expect(mockDb.get('shipments', 'SIM-0403')).toMatchObject({ status: 'asignado', unassignedReason: null });
    expect(mockDb.get('shipments', 'SIM-0400')).toMatchObject({ status: 'pendiente', unassignedReason: 'requisito' });
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

  it('mock del Route Planner: la grabación de P2 para Z1 y sin asignar en el sintético', async () => {
    const { geoapifyFetch } = require('../src/lib/geoapify');
    const request = require('../src/mocks/geoapify/routeplanner-zona-a.request.json');
    const rec = await geoapifyFetch('/v1/routeplanner', { method: 'POST', body: request });
    expect(rec.properties.issues.unassigned_jobs).toEqual([0, 1, 3, 6, 8, 9]);
    const syn = await geoapifyFetch('/v1/routeplanner', {
      method: 'POST',
      body: {
        mode: 'drive',
        agents: [{ id: 'D5', start_location: [-89.22, 13.699], delivery_capacity: 40, capabilities: [] }],
        jobs: [
          { id: 'A', location: [-89.21, 13.74], delivery_amount: 30 },
          { id: 'B', location: [-89.21, 13.74], delivery_amount: 20 },
          { id: 'C', location: [-89.21, 13.74], delivery_amount: 5, requirements: ['carga_grande'] },
          { id: 'D', location: [-89.21, 13.74], delivery_amount: 5 },
        ],
      },
    });
    expect(syn.properties.issues.unassigned_jobs).toEqual([1, 2]);
    expect(syn.features[0].properties.actions.filter((a) => a.job_id).map((a) => [a.job_id, a.job_index])).toEqual([
      ['A', 0],
      ['D', 3],
    ]);
  });

  it('listOrderNumbers trae los pedidos de todas las fechas', async () => {
    const { listOrderNumbers } = require('../src/features/orders/importOrders');
    const list = await listOrderNumbers();
    expect(list).toHaveLength(60);
    expect(list[0]).toMatch(/^WEB-/);
  });

  it('CSV en UTF-8 sin BOM se lee con tildes', async () => {
    const { parseOrdersFile } = require('../src/features/orders/parseOrdersFile');
    const bytes = new TextEncoder().encode('pedido,referencia\nWEB-1,Portón negro\n');
    const { rows } = await parseOrdersFile(bytes.buffer);
    expect(rows[0].referencia).toBe('Portón negro');
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
        { shipmentId: 'SIM-0400', reason: 'requisito' },
      ],
    });
    expect(mockDb.get('shipments', 'SIM-0405')).toMatchObject({ status: 'asignado', routeId: r1, stopSequence: 1 });
    expect(mockDb.get('shipments', 'SIM-0407')).toMatchObject({ status: 'asignado', routeId: r2 });
    expect(mockDb.get('shipments', 'SIM-0404')).toMatchObject({
      status: 'pendiente',
      routeId: null,
      unassignedReason: 'capacidad',
    });
    expect(mockDb.get('shipments', 'SIM-0400')).toMatchObject({ status: 'pendiente', unassignedReason: 'requisito' });
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
