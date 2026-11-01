// __integration__/serverReads.emu.js  (dueño: P1)
// "Optimizar día" lee pedidos y rutas del servidor: con un pedido ya en la caché local (lo dejó otra
// lectura), el primer aviso de un listener traería solo ese pedido y saldría una sola ruta.
import { terminate } from 'firebase/firestore';
import { db } from '../src/lib/firebase';
import { todayISO } from '../src/lib/dates';
import { optimizeAndSaveDay } from '../src/features/routes/routesService';
import { getShipment } from '../src/features/shipments/shipmentsService';

beforeAll(() => require('./reseed')(), 60000);
afterAll(() => terminate(db));

test('con la caché a medias, Optimizar día igual arma una ruta por zona', async () => {
  await getShipment('SIM-0401'); // queda en la caché local
  const today = todayISO();
  const res = await optimizeAndSaveDay(today);
  // Z2 ya salió con la Ruta A del seed: las demás zonas tienen su ruta
  expect(res.routeIds.sort()).toEqual(['Z1', 'Z3', 'Z4', 'Z5'].map((z) => `R-${today}-${z}`));
}, 60000);
