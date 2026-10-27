jest.mock('../src/features/evidence/getCurrentGps', () => ({
  getCurrentGps: jest.fn(async () => ({
    lat: 13.7035,
    lng: -89.24,
    accuracyM: 8,
  })),
}));
const OK_DELIVERY = {
  photoUri: 'file:///foto.jpg',
  signatureBase64: 'data:image/png;base64,AAAA',
  description: 'Recibió la clienta en la puerta',
};
const OK_FAIL = {
  reason: 'Cliente ausente',
  photoUri: 'file:///foto.jpg',
  description: 'Nadie atendió después de tocar',
};
let sm, mockDb, STATUS;
beforeEach(() => {
  jest.resetModules();
  sm = require('../src/features/shipments/statusMachine');
  ({ mockDb } = require('../src/mocks'));
  ({ STATUS } = require('../src/constants'));
});
const get = (id) => mockDb.get('shipments', id);
const eventsOf = (id) => mockDb.all('events').filter((e) => e.shipmentId === id);
describe('canTransition', () => {
  test('sigue el diagrama del plan', () => {
    expect(sm.canTransition('pendiente', 'asignado')).toBe(true);
    expect(sm.canTransition('en_ruta', 'entregado')).toBe(true);
    expect(sm.canTransition('pendiente', 'entregado')).toBe(false);
    expect(sm.canTransition('entregado', 'en_ruta')).toBe(false);
    expect(sm.canTransition('devuelto', 'asignado')).toBe(false);
  });
});
describe('changeStatus', () => {
  test('rechaza una transición no permitida con mensaje en español', async () => {
    await expect(
      sm.changeStatus({
        shipment: {
          id: 'SIM-0445',
        },
        to: 'entregado',
        payload: OK_DELIVERY,
      }),
    ).rejects.toThrow('No se puede pasar de pendiente a entregado');
  });
  test('exige foto, firma y descripción para entregado', async () => {
    await expect(
      sm.changeStatus({
        shipment: get('SIM-0419'),
        to: 'entregado',
        payload: {},
      }),
    ).rejects.toThrow('Falta: foto, firma, descripción');
    await expect(
      sm.changeStatus({
        shipment: get('SIM-0419'),
        to: 'entregado',
        payload: {
          ...OK_DELIVERY,
          signatureBase64: '',
        },
      }),
    ).rejects.toThrow('Falta: firma');
    await expect(
      sm.changeStatus({
        shipment: get('SIM-0419'),
        to: 'entregado',
        payload: {
          ...OK_DELIVERY,
          description: ' corta ',
        },
      }),
    ).rejects.toThrow('al menos 10 caracteres');
    expect(get('SIM-0419').status).toBe('en_ruta');
    expect(eventsOf('SIM-0419')).toHaveLength(0);
  });
  test('exige un motivo de la lista para no_entregado', async () => {
    await expect(
      sm.changeStatus({
        shipment: get('SIM-0419'),
        to: 'no_entregado',
        payload: {
          ...OK_FAIL,
          reason: 'Llovió',
        },
      }),
    ).rejects.toThrow('Elija un motivo de la lista');
  });
  test('entregado guarda evidencia con GPS y hora, y un evento', async () => {
    const res = await sm.changeStatus({
      shipment: get('SIM-0419'),
      to: 'entregado',
      payload: OK_DELIVERY,
      driverId: 'D2',
    });
    expect(res).toEqual({
      status: 'entregado',
    });
    const s = get('SIM-0419');
    expect(s.status).toBe('entregado');
    expect(s.attempts).toBe(0);
    expect(s.lastEvidence).toMatchObject({
      photoUrl: 'evidence/SIM-0419/intento-1/foto.jpg',
      signatureUrl: 'evidence/SIM-0419/intento-1/firma.png',
      description: OK_DELIVERY.description,
      gps: {
        lat: 13.7035,
        lng: -89.24,
        accuracyM: 8,
      },
    });
    expect(eventsOf('SIM-0419')).toEqual([
      expect.objectContaining({
        fromStatus: 'en_ruta',
        toStatus: 'entregado',
        driverId: 'D2',
        attempt: 1,
      }),
    ]);
  });
  test('un doble toque no entrega dos veces', async () => {
    const shipment = get('SIM-0420');
    await sm.changeStatus({
      shipment,
      to: 'entregado',
      payload: OK_DELIVERY,
    });
    await expect(
      sm.changeStatus({
        shipment,
        to: 'entregado',
        payload: OK_DELIVERY,
      }),
    ).rejects.toThrow('No se puede pasar de entregado a entregado');
  });
  test('ciclo completo: fallo, reintento y 2.º fallo deja devuelto', async () => {
    const id = 'SIM-0421';
    let r = await sm.changeStatus({
      shipment: get(id),
      to: 'no_entregado',
      payload: OK_FAIL,
      driverId: 'D2',
    });
    expect(r.status).toBe('no_entregado');
    expect(get(id)).toMatchObject({
      status: 'no_entregado',
      attempts: 1,
    });
    expect(get(id).lastFailure).toMatchObject({
      reason: 'Cliente ausente',
      photoUrl: `evidence/${id}/intento-1/foto.jpg`,
    });
    expect(get(id).lastFailure.signatureUrl).toBeUndefined();
    await sm.assignToRoute({
      routeId: 'R-reintento',
      stops: [
        {
          shipmentId: id,
          seq: 1,
          etaMin: 12,
        },
      ],
    });
    expect(get(id)).toMatchObject({
      status: 'asignado',
      routeId: 'R-reintento',
      stopSequence: 1,
      etaMin: 12,
    });
    await sm.changeStatusMany({
      shipmentIds: [id],
      to: 'en_ruta',
      driverId: 'D2',
    });
    r = await sm.changeStatus({
      shipment: get(id),
      to: 'no_entregado',
      payload: OK_FAIL,
      driverId: 'D2',
    });
    expect(r.status).toBe('devuelto');
    expect(get(id)).toMatchObject({
      status: 'devuelto',
      attempts: 2,
    });
    expect(get(id).lastFailure.photoUrl).toBe(`evidence/${id}/intento-2/foto.jpg`);
    expect(eventsOf(id).map((e) => `${e.fromStatus}>${e.toStatus}`)).toEqual([
      'en_ruta>no_entregado',
      'no_entregado>asignado',
      'asignado>en_ruta',
      'en_ruta>no_entregado',
      'no_entregado>devuelto',
    ]);
    expect(eventsOf(id).at(-1)).toMatchObject({
      automatic: true,
      attempt: 2,
    });
  });
  test('changeStatus no sirve para cambios sin evidencia', async () => {
    await expect(
      sm.changeStatus({
        shipment: get('SIM-0445'),
        to: 'asignado',
      }),
    ).rejects.toThrow('assignToRoute');
  });
});
describe('assignToRoute', () => {
  test('asigna pendientes y reintentos con su orden y ETA', async () => {
    await sm.assignToRoute({
      routeId: 'R-test-Z1',
      driverId: 'D1',
      stops: [
        {
          shipmentId: 'SIM-0401',
          seq: 1,
          etaMin: 5,
        },
        {
          shipmentId: 'SIM-0400',
          seq: 2,
          etaMin: 20,
        },
      ],
    });
    expect(get('SIM-0401')).toMatchObject({
      status: 'asignado',
      routeId: 'R-test-Z1',
      stopSequence: 1,
      attempts: 1,
    });
    expect(get('SIM-0400')).toMatchObject({
      status: 'asignado',
      stopSequence: 2,
      etaMin: 20,
    });
    expect(eventsOf('SIM-0401')[0]).toMatchObject({
      fromStatus: 'no_entregado',
      toStatus: 'asignado',
      attempt: 2,
    });
  });
  test('no asigna nada si algún envío no puede (devuelto, entregado)', async () => {
    await expect(
      sm.assignToRoute({
        routeId: 'R-x',
        stops: [
          {
            shipmentId: 'SIM-0400',
            seq: 1,
            etaMin: 5,
          },
          {
            shipmentId: 'SIM-0437',
            seq: 2,
            etaMin: 9,
          },
        ],
      }),
    ).rejects.toThrow('SIM-0437 (devuelto)');
    expect(get('SIM-0400').status).toBe('pendiente');
  });
});
test('mockDb.reset vuelve a los datos iniciales (botón Reiniciar datos)', async () => {
  await sm.changeStatus({
    shipment: get('SIM-0419'),
    to: 'entregado',
    payload: OK_DELIVERY,
  });
  mockDb.reset();
  expect(get('SIM-0419').status).toBe('en_ruta');
  expect(mockDb.all('events')).toHaveLength(0);
});
describe('ruta y asignación en una sola escritura', () => {
  const route = {
    code: 'Ruta B',
    date: '2026-10-12',
    zoneId: 'Z1',
    driverId: 'D1',
    status: 'asignada',
    stops: [],
  };
  test('assignToRoute con route crea la ruta junto con la asignación', async () => {
    await sm.assignToRoute({
      routeId: 'R-atomica',
      driverId: 'D1',
      route,
      stops: [
        {
          shipmentId: 'SIM-0400',
          seq: 1,
          etaMin: 5,
        },
      ],
    });
    expect(mockDb.get('routes', 'R-atomica')).toMatchObject({
      code: 'Ruta B',
      status: 'asignada',
    });
    expect(mockDb.get('routes', 'R-atomica').createdAt).toEqual(expect.any(String));
    expect(get('SIM-0400')).toMatchObject({
      status: 'asignado',
      routeId: 'R-atomica',
    });
  });
  test('si la asignación falla no queda ruta huérfana', async () => {
    await expect(
      sm.assignToRoute({
        routeId: 'R-huerfana',
        route,
        stops: [
          {
            shipmentId: 'SIM-0437',
            seq: 1,
            etaMin: 5,
          },
        ],
      }),
    ).rejects.toThrow('SIM-0437 (devuelto)');
    expect(mockDb.get('routes', 'R-huerfana')).toBeNull();
  });
  test('changeStatusMany con routeStatus inicia la ruta en la misma escritura', async () => {
    await sm.assignToRoute({
      routeId: 'R-inicio',
      route,
      stops: [
        {
          shipmentId: 'SIM-0400',
          seq: 1,
          etaMin: 5,
        },
      ],
    });
    await sm.changeStatusMany({
      shipmentIds: ['SIM-0400'],
      to: 'en_ruta',
      routeStatus: {
        routeId: 'R-inicio',
        status: 'en_curso',
      },
    });
    expect(mockDb.get('routes', 'R-inicio').status).toBe('en_curso');
    expect(get('SIM-0400').status).toBe('en_ruta');
  });
});
describe('dos dispositivos a la vez', () => {
  test('dos entregas simultáneas del mismo envío: una gana y la otra recibe un error claro', async () => {
    const shipment = get('SIM-0419');
    const results = await Promise.allSettled([
      sm.changeStatus({
        shipment,
        to: 'entregado',
        payload: OK_DELIVERY,
        driverId: 'D2',
      }),
      sm.changeStatus({
        shipment,
        to: 'no_entregado',
        payload: OK_FAIL,
        driverId: 'D2',
      }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected').reason.message).toMatch(/cambió de estado en otro dispositivo/);
    expect(eventsOf('SIM-0419')).toHaveLength(1);
  });
  test('dos rutas con el mismo id: la segunda no se crea ni asigna nada', async () => {
    const route = {
      code: 'Ruta B',
      date: '2026-10-12',
      zoneId: 'Z1',
      driverId: 'D1',
      status: 'asignada',
      stops: [],
    };
    await sm.assignToRoute({
      routeId: 'R-doble',
      route,
      stops: [
        {
          shipmentId: 'SIM-0400',
          seq: 1,
          etaMin: 5,
        },
      ],
    });
    await expect(
      sm.assignToRoute({
        routeId: 'R-doble',
        route,
        stops: [
          {
            shipmentId: 'SIM-0403',
            seq: 1,
            etaMin: 5,
          },
        ],
      }),
    ).rejects.toThrow('La zona ya tiene una ruta abierta hoy');
    expect(get('SIM-0403').status).toBe('pendiente');
  });
});
describe('changeStatusMany', () => {
  test('Iniciar ruta pasa todas las paradas asignadas a en_ruta', async () => {
    const stops = [
      {
        shipmentId: 'SIM-0400',
        seq: 1,
        etaMin: 5,
      },
      {
        shipmentId: 'SIM-0403',
        seq: 2,
        etaMin: 15,
      },
    ];
    await sm.assignToRoute({
      routeId: 'R-z1',
      stops,
    });
    const res = await sm.changeStatusMany({
      shipmentIds: ['SIM-0400', 'SIM-0403'],
      to: STATUS.EN_RUTA,
      driverId: 'D1',
    });
    expect(res.count).toBe(2);
    expect(get('SIM-0403').status).toBe('en_ruta');
  });
  test('rechaza destinos que exigen evidencia', async () => {
    await expect(
      sm.changeStatusMany({
        shipmentIds: ['SIM-0419'],
        to: 'entregado',
      }),
    ).rejects.toThrow('changeStatus');
  });
});
