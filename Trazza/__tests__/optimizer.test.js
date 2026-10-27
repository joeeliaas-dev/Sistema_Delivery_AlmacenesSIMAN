import { optimizeRoute } from '../src/optimizer';
import { haversineKm, optimizeLocal } from '../src/optimizer/local';
import { ROUTING } from '../src/config/routing';
const depot = {
  location: {
    lat: 13.6989,
    lng: -89.205,
  },
};
const START = '2026-10-12T08:00:00-06:00';
const ZONE_CENTERS = [
  {
    lat: 13.6989,
    lng: -89.1914,
  },
  {
    lat: 13.7035,
    lng: -89.24,
  },
  {
    lat: 13.675,
    lng: -89.26,
  },
  {
    lat: 13.71,
    lng: -89.15,
  },
  {
    lat: 13.74,
    lng: -89.213,
  },
];
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randomStops(n, rand, center = ZONE_CENTERS[1]) {
  return Array.from(
    {
      length: n,
    },
    (_, i) => {
      const h = 8 + Math.floor(rand() * 8);
      const min = Math.floor(rand() * 60);
      return {
        id: `s${i}`,
        code: `SIM-${String(400 + i).padStart(4, '0')}`,
        location: {
          lat: center.lat + (rand() - 0.5) * 0.04,
          lng: center.lng + (rand() - 0.5) * 0.04,
        },
        priority: rand() < 0.3 ? 'express' : 'normal',
        scheduledTime: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`,
      };
    },
  );
}
describe('haversineKm', () => {
  it('es 0 para el mismo punto y simétrica', () => {
    const a = {
        lat: 13.7,
        lng: -89.2,
      },
      b = {
        lat: 13.71,
        lng: -89.25,
      };
    expect(haversineKm(a, a)).toBe(0);
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 10);
  });
  it('1 grado de latitud ≈ 111.19 km', () => {
    expect(
      haversineKm(
        {
          lat: 13,
          lng: -89,
        },
        {
          lat: 14,
          lng: -89,
        },
      ),
    ).toBeCloseTo(111.19, 1);
  });
});
describe('optimizeLocal', () => {
  it('desenreda un recorrido cruzado (2-opt)', () => {
    const stops = [3, 1, 4, 2, 5].map((k) => ({
      id: `p${k}`,
      location: {
        lat: 13.7,
        lng: -89.2 + k * 0.01,
      },
    }));
    const { ordered } = optimizeLocal({
      depot: {
        location: {
          lat: 13.7,
          lng: -89.2,
        },
      },
      stops,
    });
    expect(ordered.map((s) => s.id)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
  });
  it('nunca es peor que el orden recibido', () => {
    const rand = mulberry32(7);
    for (let t = 0; t < 100; t++) {
      const stops = randomStops(12, rand);
      const given = stops.reduce(
        (acc, s) => ({
          km: acc.km + haversineKm(acc.prev, s.location) * 1.35,
          prev: s.location,
        }),
        {
          km: 0,
          prev: depot.location,
        },
      ).km;
      expect(
        optimizeLocal({
          depot,
          stops,
        }).totalKm,
      ).toBeLessThanOrEqual(given + 1e-9);
    }
  });
});
describe('optimizeRoute', () => {
  it('ruta vacía', () => {
    const r = optimizeRoute({
      depot,
      stops: [],
      options: {
        startAt: START,
      },
    });
    expect(r).toMatchObject({
      ordered: [],
      legs: [],
      totalKm: 0,
      baselineKm: 0,
      totalMin: 0,
      skipped: [],
    });
    expect(r.estEnd).toBe(new Date(START).toISOString());
  });
  it('pone todas las express antes que las normales', () => {
    const stops = randomStops(20, mulberry32(1));
    const { ordered } = optimizeRoute({
      depot,
      stops,
    });
    const firstNormal = ordered.findIndex((s) => s.priority === 'normal');
    const lastExpress = ordered.map((s) => s.priority).lastIndexOf('express');
    expect(lastExpress).toBeLessThan(firstNormal);
  });
  it('legs tienen la forma de routes.stops y cuadran con totalKm', () => {
    const stops = randomStops(10, mulberry32(2));
    const r = optimizeRoute({
      depot,
      stops,
      options: {
        startAt: START,
      },
    });
    expect(r.legs).toHaveLength(10);
    r.legs.forEach((leg, i) => {
      expect(Object.keys(leg).sort()).toEqual(['etaMin', 'kmFromPrev', 'seq', 'shipmentId']);
      expect(leg.seq).toBe(i + 1);
      expect(leg.shipmentId).toBe(r.ordered[i].id);
      if (i > 0) expect(leg.etaMin).toBeGreaterThan(r.legs[i - 1].etaMin);
    });
    const sumKm = r.legs.reduce((s, l) => s + l.kmFromPrev, 0);
    expect(sumKm).toBeCloseTo(r.totalKm, 1);
    expect(new Set(r.ordered.map((s) => s.id))).toEqual(new Set(stops.map((s) => s.id)));
  });
  it('calcula ETA y fin estimado con velocidad y servicio', () => {
    const oneKmNorth = {
      lat: depot.location.lat + 1 / 111.19,
      lng: depot.location.lng,
    };
    const r = optimizeRoute({
      depot,
      stops: [
        {
          id: 'a',
          location: oneKmNorth,
          priority: 'normal',
          scheduledTime: '09:00',
        },
      ],
      options: {
        startAt: START,
      },
    });
    expect(r.legs[0].etaMin).toBe(4);
    expect(r.totalMin).toBe(12);
    expect(r.estEnd).toBe(new Date(new Date(START).getTime() + 12 * 60000).toISOString());
  });
  it('respeta parámetros de options sobre ROUTING', () => {
    const stops = randomStops(5, mulberry32(3));
    const base = optimizeRoute({
      depot,
      stops,
    });
    const fast = optimizeRoute({
      depot,
      stops,
      options: {
        avgSpeedKmh: 40,
        serviceMinutes: 0,
      },
    });
    expect(fast.totalMin).toBeLessThan(base.totalMin);
  });
  it(`con más de maxStops (${ROUTING.maxStops}) entran las primeras por prioridad y hora`, () => {
    const stops = randomStops(30, mulberry32(4));
    const r = optimizeRoute({
      depot,
      stops,
    });
    expect(r.ordered).toHaveLength(ROUTING.maxStops);
    expect(r.skipped).toHaveLength(5);
    const rank = (s) => `${s.priority === 'express' ? 0 : 1}${s.scheduledTime}`;
    const worstIncluded = r.ordered.map(rank).sort().at(-1);
    r.skipped.forEach((s) => expect(rank(s) >= worstIncluded).toBe(true));
  });
  it('no modifica el arreglo recibido', () => {
    const stops = randomStops(8, mulberry32(5));
    const copy = JSON.parse(JSON.stringify(stops));
    optimizeRoute({
      depot,
      stops,
    });
    expect(stops).toEqual(copy);
  });
  it('rechaza un envío sin ubicación con mensaje en español', () => {
    expect(() =>
      optimizeRoute({
        depot,
        stops: [
          {
            id: 'x',
            code: 'SIM-0999',
          },
        ],
      }),
    ).toThrow('El envío SIM-0999 no tiene ubicación');
  });
  it('totalKm ≤ baselineKm en 500 rutas aleatorias de las 5 zonas', () => {
    const rand = mulberry32(42);
    for (let t = 0; t < 500; t++) {
      const n = 1 + Math.floor(rand() * 25);
      const stops = randomStops(n, rand, ZONE_CENTERS[t % 5]);
      const { totalKm, baselineKm } = optimizeRoute({
        depot,
        stops,
      });
      expect(totalKm).toBeLessThanOrEqual(baselineKm);
    }
  });
  it('25 paradas en menos de 1 s', () => {
    const stops = randomStops(25, mulberry32(9));
    const t0 = performance.now();
    optimizeRoute({
      depot,
      stops,
    });
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});
