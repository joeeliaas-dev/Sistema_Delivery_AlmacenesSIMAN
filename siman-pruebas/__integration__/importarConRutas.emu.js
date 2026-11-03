// __integration__/importarConRutas.emu.js  (dueño: P1)
// Importar más pedidos cuando ya hay rutas optimizadas sin terminar, con pedidos de fuera de las zonas (3 nov).
import { collection, getDocs, terminate } from 'firebase/firestore';
import { db } from '../src/lib/firebase';
import { todayISO } from '../src/lib/dates';

beforeAll(() => require('./reseed')(), 60000);
afterAll(() => terminate(db));

const fila = (n, extra) => ({
  __row: n + 1,
  pedido: `WEB-NUEVO-${n}`,
  cliente: `Cliente ${n}`,
  telefono: `7000-${String(1000 + n)}`,
  direccion: `Calle ${n} #${n}`,
  fecha: todayISO(),
  ...extra,
});

test('importar con rutas abiertas: entra todo, lo de fuera de zona queda sin ruta y nada se rompe', async () => {
  const { validateOrders } = require('../src/features/orders/validateOrders');
  const { resolveLocations } = require('../src/features/geo/resolveLocations');
  const { importOrders, listOrderNumbers } = require('../src/features/orders/importOrders');
  const { optimizeAndSaveDay } = require('../src/features/routes/routesService');
  const today = todayISO();
  const all = async (c) => (await getDocs(collection(db, c))).docs.map((d) => ({ id: d.id, ...d.data() }));

  const first = await optimizeAndSaveDay(today);
  expect(first.routeIds.length).toBeGreaterThan(0);
  const enCurso = (await all('routes')).find((r) => r.status === 'en_curso');
  const enCursoAntes = JSON.stringify(enCurso.stops);

  const rows = [
    fila(1, { municipio: 'Soyapango', lat: 13.7105, lng: -89.1396 }),
    fila(2, { municipio: 'Santa Tecla', lat: 13.6745, lng: -89.2897 }),
    fila(3, { municipio: 'Santa Ana Centro', lat: 13.9942, lng: -89.5597 }), // otro departamento
    fila(4, { municipio: 'San Salvador Oeste', direccion: 'Colonia Nueva' }), // municipio fuera de la tabla
  ];
  const validated = validateOrders(rows, { existingOrderIds: await listOrderNumbers() });
  expect(validated.filter((r) => r.status === 'roja')).toEqual([]);
  const located = await resolveLocations(validated, { zones: await all('zones') });
  const { created, ids } = await importOrders(located);
  expect(created).toBe(4);

  const again = await optimizeAndSaveDay(today);
  const ships = Object.fromEntries((await all('shipments')).map((s) => [s.id, s]));
  const routes = await all('routes');
  // La ruta que ya salió no cambia
  expect(JSON.stringify(routes.find((r) => r.id === enCurso.id).stops)).toBe(enCursoAntes);
  // Lo de dentro de las zonas entra en una ruta del día (o queda con motivo si no cabe en el turno)
  for (const id of ids.slice(0, 2)) {
    const s = ships[id];
    expect(s.status === 'asignado' || ['capacidad', 'ventana'].includes(s.unassignedReason)).toBe(true);
  }
  // Santa Ana: fuera de toda zona → sin ruta, con motivo, para revisar o pasar a mano
  expect(ships[ids[2]]).toMatchObject({ status: 'pendiente', routeId: null, zoneId: 'SIN_ZONA', unassignedReason: 'sin_ubicacion' });
  // Municipio fuera de la tabla sin coordenadas: queda para revisar ubicación, nunca en una ruta
  expect(ships[ids[3]]).toMatchObject({ status: 'pendiente', routeId: null });
  expect(ships[ids[3]].location.status).not.toBe('alta');
  // Nadie en dos rutas
  const stops = routes.filter((r) => r.date === today).flatMap((r) => r.stops.map((st) => st.shipmentId));
  expect(new Set(stops).size).toBe(stops.length);
  expect(again.routeIds.length).toBeGreaterThan(0);
}, 120000);
