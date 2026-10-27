export const MOCK_DATE = '2026-10-12';
const STATUS = {
  PENDIENTE: 'pendiente',
  EN_RUTA: 'en_ruta',
  ENTREGADO: 'entregado',
  NO_ENTREGADO: 'no_entregado',
  DEVUELTO: 'devuelto',
};
const CIRCUITY = 1.35;
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;
const pad = (n, w = 2) => String(n).padStart(w, '0');
const code = (n) => `SIM-${pad(n, 4)}`;
function haversineKm(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
export const depot = {
  id: 'DEP-CENTRO',
  name: 'Depósito SIMAN Centro',
  location: {
    lat: 13.699,
    lng: -89.22,
  },
  address: 'Punto ficticio de prueba, San Salvador',
};
const HALF = 0.012;
const ZONE_DEFS = [
  {
    id: 'Z1',
    name: 'San Salvador Centro',
    center: [13.6989, -89.1914],
    color: '#6B5AA6',
    driver: ['D1', 'Kevin Rivas'],
  },
  {
    id: 'Z2',
    name: 'Escalón / San Benito',
    center: [13.7035, -89.24],
    color: '#9A5B8A',
    driver: ['D2', 'Jorge Martínez'],
  },
  {
    id: 'Z3',
    name: 'Antiguo Cuscatlán / Santa Tecla',
    center: [13.675, -89.26],
    color: '#2F7D5B',
    driver: ['D3', 'Daniela Flores'],
  },
  {
    id: 'Z4',
    name: 'Soyapango / Ilopango',
    center: [13.71, -89.15],
    color: '#C26A1B',
    driver: ['D4', 'Mario Castro'],
  },
  {
    id: 'Z5',
    name: 'Mejicanos / Apopa',
    center: [13.74, -89.213],
    color: '#2B6CB0',
    driver: ['D5', 'Sofía Guzmán'],
  },
];
export const zones = ZONE_DEFS.map(({ id, name, center: [lat, lng], color, driver }) => ({
  id,
  code: id,
  name,
  color,
  polygon: [
    {
      lat: round(lat - HALF, 4),
      lng: round(lng - HALF, 4),
    },
    {
      lat: round(lat - HALF, 4),
      lng: round(lng + HALF, 4),
    },
    {
      lat: round(lat + HALF, 4),
      lng: round(lng + HALF, 4),
    },
    {
      lat: round(lat + HALF, 4),
      lng: round(lng - HALF, 4),
    },
  ],
  driverId: driver[0],
}));
const initials = (name) =>
  name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
export const drivers = ZONE_DEFS.map(({ id, driver: [driverId, name] }, i) => ({
  id: driverId,
  name,
  initials: initials(name),
  phone: `+50370000${pad(i + 1, 3)}`,
  zoneId: id,
  active: true,
}));
const CATALOG = [
  ['ELE-9921', 'TV Samsung 55" QLED 4K', 14.2],
  ['ELE-4410', 'Barra de sonido LG 2.1', 3.4],
  ['ELE-1180', 'Laptop HP 15" Ryzen 5', 1.8],
  ['ELE-1192', 'Mouse inalámbrico Logitech', 0.1],
  ['ELE-2230', 'Audífonos Sony inalámbricos', 0.3],
  ['HOG-3344', 'Licuadora Oster 3 velocidades', 2.1],
  ['HOG-8812', 'Set de ollas Tramontina 5 piezas', 4.8],
  ['HOG-1201', 'Microondas Panasonic 1.2 pies', 12.5],
  ['HOG-2205', 'Cafetera Black+Decker 12 tazas', 2.2],
  ['HOG-5521', 'Juego de sábanas queen', 1.5],
  ['MUE-7710', 'Silla de oficina ergonómica', 11.0],
  ['MUE-3302', 'Mesa de noche de pino', 9.0],
  ['DEP-4501', 'Bicicleta estática Kettler', 28.0],
  ['JUG-6610', 'Set de bloques de construcción', 1.2],
  ['BEL-7720', 'Secadora de cabello Remington', 0.7],
];
const item = (sku, qty = 1) => {
  const [, name, weightKg] = CATALOG.find(([s]) => s === sku);
  return {
    sku,
    name,
    weightKg,
    qty,
  };
};
const FIRST = [
  'Andrea',
  'Luis',
  'Carmen',
  'José',
  'Gabriela',
  'Ricardo',
  'Patricia',
  'Manuel',
  'Verónica',
  'Oscar',
  'Karla',
  'Ernesto',
  'Silvia',
  'Alejandro',
  'Rosa',
  'Mauricio',
  'Claudia',
  'Héctor',
  'Beatriz',
  'Francisco',
];
const LAST = [
  'López',
  'Ramírez',
  'Pérez',
  'Alvarado',
  'Molina',
  'Orellana',
  'Henríquez',
  'Cruz',
  'Rodríguez',
  'Navarro',
  'Guevara',
  'Escobar',
  'Menjívar',
  'Chávez',
  'Romero',
  'Ayala',
];
const STREETS = [
  'Calle Los Almendros',
  'Av. Las Palmeras',
  'Pasaje San José',
  'Calle La Mascota',
  'Av. Bernal',
  'Calle El Progreso',
  'Pasaje Los Cipreses',
  'Calle Arce',
  'Av. Olímpica',
  'Calle Las Rosas',
];
const REFS = [
  'Portón café',
  'Frente a la tienda',
  'Casa esquinera color crema',
  'A la par de la iglesia',
  'Contiguo a la cancha',
  'Portón blanco con buganvilia',
  '',
];
const MUNICIPIO = {
  Z1: 'San Salvador Centro',
  Z2: 'San Salvador Centro',
  Z3: 'La Libertad Sur',
  Z4: 'San Salvador Este',
  Z5: 'San Salvador Norte',
};
const RUTA_A = [
  [
    417,
    'Elena Fuentes',
    'Col. Médica, 25 Av. Norte #14',
    'San Salvador Centro',
    13.7062,
    -89.2051,
    'normal',
    '08:30',
    'entregado',
    0,
    ['HOG-1201'],
  ],
  [
    418,
    'Fernando Aguilar',
    'Urb. Maquilishuat, Calle Principal #3',
    'San Salvador Centro',
    13.7101,
    -89.2289,
    'normal',
    '08:52',
    'entregado',
    0,
    ['ELE-4410', 'HOG-2205'],
  ],
  [
    419,
    'María Hernández',
    'Colonia Escalón, Calle El Mirador #42',
    'San Salvador Centro',
    13.7035,
    -89.24,
    'express',
    '09:15',
    'en_ruta',
    6,
    ['ELE-9921', 'HOG-3344', 'HOG-8812'],
  ],
  [
    420,
    'Roberto Castellanos',
    'Res. Santa Elena, Pasaje 8 #12',
    'Antiguo Cuscatlán',
    13.689,
    -89.245,
    'normal',
    '09:32',
    'en_ruta',
    14,
    ['MUE-7710'],
  ],
  [
    421,
    'Lucía Vásquez',
    'Col. San Benito, Blvd. del Hipódromo #78',
    'San Salvador Centro',
    13.6985,
    -89.2342,
    'express',
    '09:48',
    'en_ruta',
    28,
    ['ELE-1180', 'ELE-1192', 'HOG-3344', ['HOG-5521', 2]],
  ],
  [
    422,
    'Carlos Portillo',
    'Urb. Lomas Verdes, Casa 14-B',
    'Santa Tecla',
    13.6772,
    -89.2793,
    'normal',
    '10:05',
    'en_ruta',
    41,
    ['MUE-3302', 'HOG-8812'],
  ],
  [
    423,
    'Ana Mejía',
    'Col. Flor Blanca, 3a Av. Norte #55',
    'San Salvador Centro',
    13.7008,
    -89.2125,
    'normal',
    '10:22',
    'en_ruta',
    55,
    ['ELE-2230', 'HOG-1201', 'HOG-2205', 'ELE-4410'],
  ],
  [
    424,
    'Diego Recinos',
    'Jardines de Guadalupe, Los Pinos #9',
    'Antiguo Cuscatlán',
    13.6823,
    -89.2402,
    'express',
    '10:39',
    'en_ruta',
    70,
    ['ELE-9921', 'ELE-4410'],
  ],
];
const REFS_A = {
  419: 'Portón negro frente a farmacia',
};
const FIXED = {
  401: {
    zoneId: 'Z1',
    lat: 13.6971,
    lng: -89.1882,
    time: '08:40',
    priority: 'normal',
    items: 2,
    status: STATUS.NO_ENTREGADO,
    attempts: 1,
  },
  402: {
    zoneId: 'Z1',
    status: STATUS.NO_ENTREGADO,
    attempts: 1,
  },
  437: {
    zoneId: 'Z4',
    lat: 13.7088,
    lng: -89.1534,
    time: '10:05',
    priority: 'normal',
    items: 4,
    status: STATUS.DEVUELTO,
    attempts: 2,
  },
  445: {
    zoneId: 'Z5',
    lat: 13.7392,
    lng: -89.2101,
    time: '11:20',
    priority: 'express',
    items: 1,
    status: STATUS.PENDIENTE,
    attempts: 0,
  },
};
const range = (a, b) =>
  Array.from(
    {
      length: b - a + 1,
    },
    (_, i) => a + i,
  );
const ZONE_CODES = {
  Z1: range(400, 411),
  Z2: range(413, 424),
  Z3: range(425, 436),
  Z4: [412, ...range(437, 444), 457, 458, 459],
  Z5: range(445, 456),
};
export function buildDataset({ date = MOCK_DATE, seed = 419 } = {}) {
  const rand = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const at = (hhmm) => `${date}T${hhmm}:00-06:00`;
  const routeId = `R-${date}-Z2`;
  const created = at('07:00');
  const base = (n, zoneId) => ({
    id: code(n),
    code: code(n),
    orderNumber: `WEB-${884000 + n * 7}`,
    zoneId,
    scheduledDate: date,
    routeId: null,
    stopSequence: null,
    etaMin: null,
    attempts: 0,
    lastEvidence: null,
    lastFailure: null,
    createdAt: created,
    updatedAt: created,
  });
  const shipments = [];
  RUTA_A.forEach(([n, name, text, municipio, lat, lng, priority, time, status, etaMin, skus], i) => {
    const s = {
      ...base(n, 'Z2'),
      customer: {
        name,
        phone: `+50370000${pad(n, 3)}`,
      },
      address: {
        text,
        reference: REFS_A[n] ?? '',
        municipio,
      },
      location: {
        lat,
        lng,
      },
      scheduledTime: time,
      priority,
      items: skus.map((k) => (Array.isArray(k) ? item(k[0], k[1]) : item(k))),
      status,
      routeId,
      stopSequence: i + 1,
      etaMin,
    };
    if (status === STATUS.ENTREGADO) {
      const hhmm = i === 0 ? '08:41' : '09:02';
      s.lastEvidence = {
        photoUrl: `evidence/${s.code}/intento-1/foto.jpg`,
        signatureUrl: `evidence/${s.code}/intento-1/firma.png`,
        description:
          i === 0 ? 'Recibió la clienta en la puerta principal' : 'Entregado al vigilante de la urbanización',
        gps: {
          lat: round(lat + 0.00002, 5),
          lng: round(lng - 0.00003, 5),
          accuracyM: 10 + i * 3,
        },
        at: at(hhmm),
      };
      s.updatedAt = at(hhmm);
    }
    shipments.push(s);
  });
  const rutaACodes = new Set(RUTA_A.map(([n]) => n));
  for (const [zoneId, codes] of Object.entries(ZONE_CODES)) {
    const zone = zones.find((z) => z.id === zoneId);
    const [sw, , ne] = [zone.polygon[0], zone.polygon[1], zone.polygon[2]];
    for (const n of codes) {
      if (rutaACodes.has(n)) continue;
      const f = FIXED[n] ?? {};
      const lat = f.lat ?? round(sw.lat + rand() * (ne.lat - sw.lat), 4);
      const lng = f.lng ?? round(sw.lng + rand() * (ne.lng - sw.lng), 4);
      const minutes = 8 * 60 + Math.floor(rand() * 32) * 15;
      const time = f.time ?? `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
      const priority = f.priority ?? (rand() < 0.3 ? 'express' : 'normal');
      const nItems = f.items ?? 1 + Math.floor(rand() * 4);
      const skus = [];
      while (skus.length < nItems) {
        const sku = pick(CATALOG)[0];
        if (!skus.includes(sku)) skus.push(sku);
      }
      const name = `${pick(FIRST)} ${pick(LAST)}`;
      const s = {
        ...base(n, zoneId),
        customer: {
          name,
          phone: `+50370000${pad(n, 3)}`,
        },
        address: {
          text: `${pick(STREETS)} #${1 + Math.floor(rand() * 90)}`,
          reference: pick(REFS),
          municipio: MUNICIPIO[zoneId],
        },
        location: {
          lat,
          lng,
        },
        scheduledTime: time,
        priority,
        items: skus.map((k) => item(k)),
        status: f.status ?? STATUS.PENDIENTE,
        attempts: f.attempts ?? 0,
      };
      if (s.status === STATUS.NO_ENTREGADO || s.status === STATUS.DEVUELTO) {
        s.lastFailure = {
          reason: s.status === STATUS.DEVUELTO ? 'Dirección incorrecta' : 'Cliente ausente',
          photoUrl: `evidence/${s.code}/intento-${s.attempts}/foto.jpg`,
          description:
            s.status === STATUS.DEVUELTO
              ? 'La dirección no existe, vecinos no conocen al cliente'
              : 'Nadie atendió después de tocar 3 veces',
          gps: {
            lat,
            lng,
            accuracyM: 15,
          },
          at: at('15:30'),
        };
        s.updatedAt = at('15:30');
      }
      shipments.push(s);
    }
  }
  shipments.sort((a, b) => a.code.localeCompare(b.code));
  const stopsA = shipments.filter((s) => s.routeId === routeId).sort((a, b) => a.stopSequence - b.stopSequence);
  let prev = depot.location;
  const stops = stopsA.map((s) => {
    const kmFromPrev = round(haversineKm(prev, s.location) * CIRCUITY, 2);
    prev = s.location;
    return {
      shipmentId: s.id,
      seq: s.stopSequence,
      etaMin: s.etaMin,
      kmFromPrev,
    };
  });
  const totalKm = round(
    stops.reduce((sum, st) => sum + st.kmFromPrev, 0),
    2,
  );
  const isExp = (s) => s.priority === 'express';
  const byTime = [...stopsA].sort((a, b) => isExp(b) - isExp(a) || a.scheduledTime.localeCompare(b.scheduledTime));
  let p = depot.location;
  const baselineKm = round(
    byTime.reduce((sum, s) => {
      const d = haversineKm(p, s.location) * CIRCUITY;
      p = s.location;
      return sum + d;
    }, 0),
    2,
  );
  const routes = [
    {
      id: routeId,
      code: 'Ruta A',
      date,
      zoneId: 'Z2',
      driverId: 'D2',
      status: 'en_curso',
      stops,
      totalKm,
      baselineKm,
      estEnd: at('12:20'),
      createdAt: at('07:45'),
    },
  ];
  return {
    depot,
    zones,
    drivers,
    shipments,
    routes,
  };
}
export const HISTORY = {
  pendiente: [],
  en_ruta: [
    ['pendiente', 'asignado'],
    ['asignado', 'en_ruta'],
  ],
  entregado: [
    ['pendiente', 'asignado'],
    ['asignado', 'en_ruta'],
    ['en_ruta', 'entregado'],
  ],
  no_entregado: [
    ['pendiente', 'asignado'],
    ['asignado', 'en_ruta'],
    ['en_ruta', 'no_entregado'],
  ],
  devuelto: [
    ['pendiente', 'asignado'],
    ['asignado', 'en_ruta'],
    ['en_ruta', 'no_entregado'],
    ['no_entregado', 'asignado'],
    ['asignado', 'en_ruta'],
    ['en_ruta', 'no_entregado'],
    ['no_entregado', 'devuelto'],
  ],
};
export function eventsFor(s, driverId) {
  const steps = HISTORY[s.status] ?? [];
  let attempt = 1;
  return steps.map(([fromStatus, toStatus], i) => {
    const ev = {
      fromStatus,
      toStatus,
      at: s.updatedAt,
      driverId,
      attempt,
      reason: null,
      description: null,
      photoUrl: null,
      signatureUrl: null,
      gps: null,
    };
    if (toStatus === 'entregado' && s.lastEvidence)
      Object.assign(ev, s.lastEvidence, {
        at: s.lastEvidence.at,
      });
    if (toStatus === 'no_entregado' && s.lastFailure) {
      Object.assign(ev, s.lastFailure);
      attempt += 1;
    }
    if (toStatus === 'devuelto') ev.automatic = true;
    return {
      id: `${pad(i + 1)}-${toStatus}`,
      ...ev,
    };
  });
}
