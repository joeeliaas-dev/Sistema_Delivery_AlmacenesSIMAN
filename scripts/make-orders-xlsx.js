// scripts/make-orders-xlsx.js  (dueño: P1)
// Genera, con la fecha de mañana:
//   assets/pedidos-prueba-100.xlsx  100 pedidos desordenados (S4-05): 60 buenos, 10 de la libreta,
//                                   12 vagos, 6 con lat/lng, 5 de línea blanca, 3 fuera de zona y 4 con error
//   assets/plantilla-pedidos.xlsx   la plantilla vacía con una fila de ejemplo
//   src/mocks/geoapify/geocode.json respuestas del geocodificador de mocks para esas direcciones
//   src/mocks/addresses.json        los 10 clientes que ya están en la libreta
// Uso: npm run orders:xlsx   (vuelva a correrlo cada día: la fecha es la de mañana)
// La normalización y djb2 son copia de src/features/geo/normalize.js (lo verifica __tests__/testOrders.test.js).
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const XLSX = require('xlsx');

const root = join(__dirname, '..');
const pad = (n, w = 2) => String(n).padStart(w, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const tomorrow = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return ymd(d);
})();

const COLUMNS = [
  'pedido',
  'cliente',
  'telefono',
  'direccion',
  'municipio',
  'referencia',
  'fecha',
  'desde',
  'hasta',
  'prioridad',
  'peso_kg',
  'volumen_m3',
  'bultos',
  'minutos_servicio',
  'lat',
  'lng',
];

const normalizeText = (s = '') =>
  String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9#]+/g, ' ')
    .trim();
function djb2(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(2026);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;

// Zonas de los datos de prueba (scripts/data/buildDataset.mjs): cuadrados de ±0.012° alrededor del centro
const ZONES = {
  Z1: {
    center: [13.6989, -89.1914],
    municipio: 'San Salvador Centro',
    streets: [
      'Calle Arce',
      'Calle Delgado',
      'Calle Rubén Darío',
      'Avenida España',
      'Avenida Cuscatlán',
      'Calle Concepción',
      '4a Calle Poniente',
      '2a Avenida Norte',
    ],
    colonias: ['Barrio San Miguelito', 'Barrio Candelaria', 'Barrio La Vega', 'Centro Histórico'],
  },
  Z2: {
    center: [13.7035, -89.24],
    municipio: 'San Salvador Centro',
    streets: [
      'Paseo General Escalón',
      'Calle La Mascota',
      'Calle El Mirador',
      'Avenida La Revolución',
      'Calle Los Castaños',
      'Calle Loma Linda',
      '79 Avenida Norte',
      'Calle Las Palmas',
    ],
    colonias: ['Colonia Escalón', 'Colonia San Benito', 'Colonia Maquilishuat', 'Colonia La Mascota'],
  },
  Z3: {
    center: [13.675, -89.26],
    municipio: 'Antiguo Cuscatlán',
    streets: [
      'Calle El Pedregal',
      'Calle La Sultana',
      'Avenida Las Palmeras',
      'Calle Madre Selva',
      'Calle Jardines de Guadalupe',
      'Calle Santa Elena',
      'Avenida El Espino',
      'Calle Las Delicias',
    ],
    colonias: ['Urbanización Madre Selva', 'Colonia La Sultana', 'Jardines de Guadalupe', 'Santa Elena'],
  },
  Z4: {
    center: [13.71, -89.15],
    municipio: 'Soyapango',
    streets: [
      'Calle Credisa',
      'Boulevard del Ejército',
      'Calle Los Santos',
      'Avenida Las Cañas',
      'Calle Guadalupe',
      'Pasaje Bosques de la Paz',
      'Calle Santa Lucía',
      'Avenida Prusia',
    ],
    colonias: ['Ciudad Credisa', 'Colonia Guadalupe', 'Reparto Las Cañas', 'Colonia Los Santos'],
  },
  Z5: {
    center: [13.74, -89.213],
    municipio: 'Mejicanos',
    streets: [
      'Calle Zacamil',
      'Avenida San Ramón',
      'Calle Montreal',
      'Calle Principal Zacamil',
      'Pasaje Las Flores',
      'Calle El Bambú',
      'Avenida Castro Morán',
      'Calle Los Pinos',
    ],
    colonias: ['Colonia Zacamil', 'Colonia San Ramón', 'Colonia Montreal', 'Residencial Montebello'],
  },
};
const ZONE_IDS = Object.keys(ZONES);
const inZone = (zid) => {
  const [lat, lng] = ZONES[zid].center;
  return { lat: round(lat - 0.01 + rand() * 0.02, 6), lng: round(lng - 0.01 + rand() * 0.02, 6) };
};
const OUTSIDE = [
  { text: 'Calle Principal #14, Nuevo Cuscatlán', municipio: 'La Libertad Este', lat: 13.648, lng: -89.268 },
  { text: 'Avenida Los Laureles #7, San Marcos', municipio: 'San Salvador Centro', lat: 13.659, lng: -89.183 },
  {
    text: 'Calle Antigua a Tonacatepeque #31, Ciudad Delgado',
    municipio: 'San Salvador Centro',
    lat: 13.724,
    lng: -89.172,
  },
];

const FIRST = [
  'María',
  'José',
  'Ana',
  'Carlos',
  'Rosa',
  'Luis',
  'Carmen',
  'Jorge',
  'Patricia',
  'Miguel',
  'Gabriela',
  'Ricardo',
  'Sofía',
  'Fernando',
  'Claudia',
  'Óscar',
  'Daniela',
  'Roberto',
  'Elena',
  'Mauricio',
];
const LAST = [
  'Hernández',
  'López',
  'Martínez',
  'Rodríguez',
  'García',
  'Flores',
  'Ramírez',
  'Cruz',
  'Rivera',
  'Mejía',
  'Alvarado',
  'Romero',
  'Castillo',
  'Portillo',
  'Aguilar',
  'Molina',
];
const REFS = [
  'Portón negro',
  'Casa de dos plantas color crema',
  'Frente al parque',
  'A la par de la tienda',
  'Edificio azul, 3er piso',
  'Portón blanco con buganvilia',
  'Esquina con farmacia',
  'Casa con muro de ladrillo',
  '',
];
const WINDOWS = [
  ['08:00', '11:00'],
  ['09:00', '12:00'],
  ['13:00', '16:00'],
  ['14:00', '17:00'],
  ['10:00', '13:00'],
];

let seq = 0;
let phoneSeq = 0;
const newPhone = () => `7${pad(1000000 + ++phoneSeq * 7919, 7).slice(-7)}`;
const asPrinted = (p) => `${p.slice(0, 4)}-${p.slice(4)}`;

function baseRow(zid, { text, municipio } = {}) {
  const z = ZONES[zid];
  return {
    pedido: `WEB-${900100 + ++seq}`,
    cliente: `${pick(FIRST)} ${pick(LAST)}`,
    telefono: asPrinted(newPhone()),
    direccion: text ?? `${pick(z.streets)} #${1 + Math.floor(rand() * 120)}, ${pick(z.colonias)}`,
    municipio: municipio ?? z.municipio,
    referencia: pick(REFS),
    fecha: tomorrow,
    desde: '',
    hasta: '',
    prioridad: 'normal',
    peso_kg: round(0.3 + rand() * 12, 1),
    volumen_m3: round(0.01 + rand() * 0.08, 2),
    bultos: 1 + Math.floor(rand() * 3),
    minutos_servicio: '',
    lat: '',
    lng: '',
  };
}

const geocode = {};
const addGeocode = (row, point, { type = 'building', confidence = 0.92 } = {}) => {
  geocode[normalizeText(`${row.direccion}, ${row.municipio}, El Salvador`)] = {
    lat: point.lat,
    lon: point.lng,
    result_type: type,
    formatted: `${row.direccion}, ${row.municipio}, El Salvador`,
    rank: { confidence, match_type: 'match_by_building' },
  };
};

const rows = [];
// 60 buenos dentro de zona
for (let i = 0; i < 60; i++) {
  const zid = ZONE_IDS[i % 5];
  const r = baseRow(zid);
  addGeocode(r, inZone(zid));
  rows.push(r);
}
// 10 clientes que ya están en la libreta
const addresses = [];
for (let i = 0; i < 10; i++) {
  const zid = ZONE_IDS[i % 5];
  const r = baseRow(zid);
  const p = inZone(zid);
  const phone = r.telefono.replace(/\D/g, '');
  const norm = normalizeText(`${r.direccion} ${r.municipio}`);
  addresses.push({
    id: `${phone}_${djb2(norm)}`,
    phone,
    addressNorm: norm,
    lat: p.lat,
    lng: p.lng,
    source: 'despacho',
    confirmedAt: '2026-10-20T10:00:00-06:00',
    uses: 1,
  });
  rows.push(r);
}
// 12 vagos: solo colonia o municipio (el geocodificador de mocks responde 0.5, tipo suburb)
for (let i = 0; i < 12; i++) {
  const zid = ZONE_IDS[i % 5];
  rows.push(baseRow(zid, { text: i % 3 === 0 ? ZONES[zid].municipio : pick(ZONES[zid].colonias) }));
}
// 6 con lat y lng
for (let i = 0; i < 6; i++) {
  const zid = ZONE_IDS[i % 5];
  const r = baseRow(zid);
  const p = inZone(zid);
  r.lat = p.lat;
  r.lng = p.lng;
  rows.push(r);
}
// 5 de línea blanca (más de 30 kg): Z1 y Z5 son motos, así que esos quedan sin asignar por requisito
const BIG = [
  ['Z1', 62],
  ['Z3', 48],
  ['Z4', 75],
  ['Z5', 55],
  ['Z2', 38],
];
for (const [zid, kg] of BIG) {
  const r = baseRow(zid);
  r.peso_kg = kg;
  r.volumen_m3 = 0.6;
  r.bultos = 1;
  r.minutos_servicio = 30;
  r.referencia = 'Refrigeradora o lavadora: subir por escaleras';
  addGeocode(r, inZone(zid));
  rows.push(r);
}
// 3 fuera de las zonas de reparto (bien ubicados, pero el punto no cae en ninguna zona)
for (const o of OUTSIDE) {
  const r = baseRow('Z1', { text: o.text, municipio: o.municipio });
  addGeocode(r, o);
  rows.push(r);
}

// Ventanas (20) y express (8) entre las filas buenas
rows.slice(0, 70).forEach((r, i) => {
  if (i % 5 === 3) [r.desde, r.hasta] = WINDOWS[i % WINDOWS.length];
  if (i % 9 === 5) r.prioridad = 'express';
});
for (const r of rows.slice(70, 76)) [r.desde, r.hasta] = WINDOWS[2];

// 4 con error: teléfono malo, sin fecha y 2 pedidos repetidos
const bad1 = baseRow('Z2');
bad1.telefono = '7123-45';
const bad2 = baseRow('Z4');
bad2.fecha = '';
const dup1 = baseRow('Z3');
dup1.pedido = rows[4].pedido;
const dup2 = baseRow('Z5');
dup2.pedido = rows[20].pedido;
rows.push(bad1, bad2, dup1, dup2);

// Desordenar (los repetidos quedan siempre después de su original)
const originals = new Set([rows[4].pedido, rows[20].pedido]);
const head = rows.filter((r) => originals.has(r.pedido) && r !== dup1 && r !== dup2);
const rest = rows.filter((r) => !head.includes(r) && r !== dup1 && r !== dup2);
for (let i = rest.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [rest[i], rest[j]] = [rest[j], rest[i]];
}
const ordered = [...head, ...rest.slice(0, 60), dup1, ...rest.slice(60), dup2];

function writeBook(file, data) {
  const sheet = XLSX.utils.json_to_sheet(data, { header: COLUMNS });
  sheet['!cols'] = COLUMNS.map((c) => ({ wch: ['direccion', 'referencia'].includes(c) ? 40 : 14 }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Pedidos');
  XLSX.writeFile(book, file);
}

mkdirSync(join(root, 'assets'), { recursive: true });
writeBook(join(root, 'assets/pedidos-prueba-100.xlsx'), ordered);
writeBook(join(root, 'assets/plantilla-pedidos.xlsx'), [
  {
    pedido: 'WEB-900001',
    cliente: 'María López',
    telefono: '7012-3456',
    direccion: 'Calle La Mascota #26, Colonia Escalón',
    municipio: 'San Salvador Centro',
    referencia: 'Portón negro frente al parque',
    fecha: tomorrow,
    desde: '09:00',
    hasta: '12:00',
    prioridad: 'normal',
    peso_kg: 14.2,
    volumen_m3: 0.1,
    bultos: 1,
    minutos_servicio: '',
    lat: '',
    lng: '',
  },
]);

const geoFile = join(root, 'src/mocks/geoapify/geocode.json');
const recorded = JSON.parse(readFileSync(geoFile, 'utf8'));
const keep = Object.fromEntries(
  Object.entries(recorded).filter(([k]) => k.startsWith('calle la mascota 26 colonia escalon')),
);
writeFileSync(geoFile, JSON.stringify({ ...keep, ...geocode }, null, 2) + '\n');
writeFileSync(join(root, 'src/mocks/addresses.json'), JSON.stringify(addresses, null, 2) + '\n');

console.log(
  `pedidos-prueba-100.xlsx: ${ordered.length} filas para el ${tomorrow}; geocode.json: ${Object.keys(geocode).length + Object.keys(keep).length}; libreta: ${addresses.length}`,
);
