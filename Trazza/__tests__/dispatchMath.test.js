import {
  assignmentLabel,
  countByStage,
  dateShiftLabel,
  formatClock,
  isRoutable,
  itemCount,
  kmOptimized,
  latestZoneRoute,
  matchesPriority,
  routeProgress,
  routeStageLabel,
  savedKm,
  shortName,
  splitByZone,
  toMapStops,
} from '../src/features/dispatch/dispatchMath';
import { SIN_ZONA } from '../src/constants';
const at = (h) => new Date(2026, 9, 6, h, 0);
describe('dispatchMath', () => {
  it('fecha y turno como el prototipo', () => {
    expect(dateShiftLabel('2026-10-06', at(9))).toBe('Martes 6 de octubre · Turno matutino');
    expect(dateShiftLabel('2026-10-12', at(14))).toBe('Lunes 12 de octubre · Turno vespertino');
    expect(dateShiftLabel('2026-12-31', at(19))).toBe('Jueves 31 de diciembre · Turno nocturno');
  });
  it('cuenta Pendientes (con reintentos), En ruta (asignado + en_ruta) y Entregados', () => {
    const list = [
      {
        status: 'pendiente',
        attempts: 0,
      },
      {
        status: 'no_entregado',
        attempts: 1,
      },
      {
        status: 'asignado',
        attempts: 0,
      },
      {
        status: 'en_ruta',
        attempts: 0,
      },
      {
        status: 'en_ruta',
        attempts: 1,
      },
      {
        status: 'entregado',
        attempts: 0,
      },
      {
        status: 'devuelto',
        attempts: 2,
      },
    ];
    expect(countByStage(list)).toEqual({
      pendientes: 2,
      enRuta: 3,
      entregados: 1,
    });
  });
  it('solo pendientes y reintentos entran a una ruta nueva', () => {
    expect(
      isRoutable({
        status: 'pendiente',
        attempts: 0,
      }),
    ).toBe(true);
    expect(
      isRoutable({
        status: 'no_entregado',
        attempts: 1,
      }),
    ).toBe(true);
    expect(
      isRoutable({
        status: 'no_entregado',
        attempts: 2,
      }),
    ).toBe(false);
    expect(
      isRoutable({
        status: 'asignado',
        attempts: 0,
      }),
    ).toBe(false);
  });
  it('filtra por prioridad y separa SIN_ZONA', () => {
    const list = [
      {
        id: 'a',
        priority: 'express',
        zoneId: 'Z1',
      },
      {
        id: 'b',
        priority: 'normal',
        zoneId: 'SIN_ZONA',
      },
    ];
    expect(list.filter(matchesPriority('todos'))).toHaveLength(2);
    expect(list.filter(matchesPriority('express')).map((s) => s.id)).toEqual(['a']);
    const { zoned, noZone } = splitByZone(list);
    expect(zoned.map((s) => s.id)).toEqual(['a']);
    expect(noZone.map((s) => s.id)).toEqual(['b']);
  });
  it('artículos suman cantidades', () => {
    expect(
      itemCount({
        items: [
          {
            qty: 1,
          },
          {
            qty: 2,
          },
        ],
      }),
    ).toBe(3);
    expect(itemCount({})).toBe(0);
  });
  it('etiqueta de ruta asignada: "Ruta A - Jorge M."', () => {
    expect(shortName('Jorge Martínez')).toBe('Jorge M.');
    const routes = {
      R1: {
        code: 'Ruta A',
        driverId: 'D2',
      },
    };
    const drivers = {
      D2: {
        name: 'Jorge Martínez',
      },
    };
    expect(
      assignmentLabel(
        {
          routeId: 'R1',
        },
        routes,
        drivers,
      ),
    ).toBe('Ruta A - Jorge M.');
    expect(
      assignmentLabel(
        {
          routeId: null,
        },
        routes,
        drivers,
      ),
    ).toBeNull();
  });
  it('paradas del mapa con la forma del contrato', () => {
    const s = {
      id: 'SIM-0419',
      code: 'SIM-0419',
      location: {
        lat: 1,
        lng: 2,
      },
      priority: 'express',
      status: 'en_ruta',
      stopSequence: 3,
    };
    const withCustomer = {
      ...s,
      customer: {
        name: 'María Hernández',
      },
      scheduledTime: '09:15',
    };
    expect(toMapStops([withCustomer])).toEqual([
      {
        id: 'SIM-0419',
        location: {
          lat: 1,
          lng: 2,
        },
        label: '0419',
        priority: 'express',
        status: 'en_ruta',
        title: 'María Hernández',
        subtitle: 'SIM-0419 · 09:15',
      },
    ]);
    expect(
      toMapStops([s], {
        numbered: true,
      })[0].label,
    ).toBe('3');
  });
  it('bloque SIN_ZONA: separa los envíos sin zona, con el filtro de prioridad aplicado, y cuentan en los contadores', () => {
    const list = [
      {
        id: 'a',
        priority: 'express',
        zoneId: SIN_ZONA,
        status: 'pendiente',
        attempts: 0,
      },
      {
        id: 'b',
        priority: 'normal',
        zoneId: 'Z1',
        status: 'pendiente',
        attempts: 0,
      },
      {
        id: 'c',
        priority: 'normal',
        zoneId: SIN_ZONA,
        status: 'pendiente',
        attempts: 0,
      },
    ];
    expect(splitByZone(list).noZone.map((s) => s.id)).toEqual(['a', 'c']);
    expect(splitByZone(list.filter(matchesPriority('normal'))).noZone.map((s) => s.id)).toEqual(['c']);
    expect(splitByZone(list.filter((s) => s.zoneId === 'Z1')).noZone).toEqual([]);
    expect(countByStage(list).pendientes).toBe(3);
  });
  it('latestZoneRoute toma la última ruta creada de la zona', () => {
    const routes = [
      {
        id: 'R-Z1',
        zoneId: 'Z1',
        createdAt: '2026-10-12T08:00:00-06:00',
      },
      {
        id: 'R-Z1-2',
        zoneId: 'Z1',
        createdAt: '2026-10-12T13:00:00-06:00',
      },
      {
        id: 'R-Z2',
        zoneId: 'Z2',
        createdAt: {
          toMillis: () => Date.parse('2026-10-12T14:00:00-06:00'),
        },
      },
    ];
    expect(latestZoneRoute(routes, 'Z1').id).toBe('R-Z1-2');
    expect(latestZoneRoute(routes, 'Z2').id).toBe('R-Z2');
    expect(latestZoneRoute(routes, 'Z3')).toBeNull();
  });
  it('km ahorrados de la Ruta A del mock: 36.1 − 34.85 = 1.25', () => {
    expect(
      savedKm({
        baselineKm: 36.1,
        totalKm: 34.85,
      }),
    ).toBeCloseTo(1.25, 5);
    expect(
      savedKm({
        baselineKm: 10,
        totalKm: 12,
      }),
    ).toBe(0);
    expect(savedKm(null)).toBe(0);
  });
  it('KPI Km optimizados suma baselineKm − totalKm de las rutas del día', () => {
    const routes = [
      {
        baselineKm: 36.1,
        totalKm: 34.85,
      },
      {
        baselineKm: 20,
        totalKm: 15,
      },
    ];
    const { km, pct } = kmOptimized(routes);
    expect(km).toBeCloseTo(6.25, 5);
    expect(pct).toBeCloseTo((6.25 / 56.1) * 100, 5);
    expect(kmOptimized([])).toEqual({
      km: 0,
      pct: 0,
    });
  });
  it('progreso de ruta: cerradas, reprogramadas y estado visible', () => {
    const route = {
      id: 'R1',
      status: 'en_curso',
      stops: [
        {
          shipmentId: 'a',
          seq: 1,
          etaMin: 5,
        },
        {
          shipmentId: 'b',
          seq: 2,
          etaMin: 15,
        },
        {
          shipmentId: 'c',
          seq: 3,
          etaMin: 25,
        },
        {
          shipmentId: 'd',
          seq: 4,
          etaMin: 35,
        },
      ],
    };
    const byId = {
      a: {
        id: 'a',
        routeId: 'R1',
        status: 'entregado',
      },
      b: {
        id: 'b',
        routeId: 'R1',
        status: 'no_entregado',
      },
      c: {
        id: 'c',
        routeId: 'R2',
        status: 'asignado',
      },
      d: {
        id: 'd',
        routeId: 'R1',
        status: 'en_ruta',
      },
    };
    const p = routeProgress(route, byId);
    expect(p).toMatchObject({
      done: 3,
      total: 4,
      percent: 75,
      open: true,
    });
    expect(p.rows[2].moved).toBe(true);
    expect(routeStageLabel(route, p)).toBe('En curso');
    expect(
      routeStageLabel(
        {
          ...route,
          status: 'asignada',
        },
        p,
      ),
    ).toBe('Asignada');
    byId.d.status = 'entregado';
    expect(routeStageLabel(route, routeProgress(route, byId))).toBe('Completada');
    expect(routeProgress(null, {})).toMatchObject({
      rows: [],
      total: 0,
      percent: 0,
    });
  });
  it('formatClock da la hora local de estEnd', () => {
    expect(formatClock(new Date(2026, 9, 12, 12, 20).toISOString())).toBe('12:20');
    expect(formatClock('no es fecha')).toBe('');
  });
});
describe('fechas del selector', () => {
  const { addDays, shortDate } = require('../src/features/dispatch/dispatchMath');
  it('addDays cruza meses y años', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
  it('shortDate da "8 oct"', () => {
    expect(shortDate('2026-10-08')).toBe('8 oct');
  });
});
